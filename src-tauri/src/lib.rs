//! MF/1.2 Iris Studio — native layer.
//! Owns the single SQLite connection (rusqlite), exposes generic query
//! commands to the UI, and implements online backup / restore / integrity.

use rusqlite::{backup::Backup, params_from_iter, types::ValueRef, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

const DB_FILE: &str = "iris_studio.db";

struct Db(Mutex<Connection>);

#[derive(Deserialize)]
struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Serialize)]
struct ExecResult {
    changes: usize,
    last_id: i64,
}

#[derive(Serialize)]
struct BackupInfo {
    path: String,
    name: String,
    size: u64,
    modified: u64,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn to_sql(v: &Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as V;
    match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Integer(*b as i64),
        Value::Number(n) => n
            .as_i64()
            .map(V::Integer)
            .unwrap_or_else(|| V::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => V::Text(s.clone()),
        other => V::Text(other.to_string()),
    }
}

fn configure(conn: &Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;",
    )
    .map_err(err)
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}

fn backups_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = data_dir(app)?.join("backups");
    fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}

fn run_select(conn: &Connection, s: &Stmt) -> Result<Vec<Value>, String> {
    let mut st = conn.prepare_cached(&s.sql).map_err(err)?;
    let cols: Vec<String> = st.column_names().iter().map(|c| c.to_string()).collect();
    let mut rows = st
        .query(params_from_iter(s.params.iter().map(to_sql)))
        .map_err(err)?;
    let mut out = Vec::new();
    while let Some(r) = rows.next().map_err(err)? {
        let mut m = Map::with_capacity(cols.len());
        for (i, c) in cols.iter().enumerate() {
            let v = match r.get_ref(i).map_err(err)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(n) => Value::Number(n.into()),
                ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
                ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
                ValueRef::Blob(_) => Value::Null,
            };
            m.insert(c.clone(), v);
        }
        out.push(Value::Object(m));
    }
    Ok(out)
}

fn run_exec(conn: &Connection, s: &Stmt) -> Result<ExecResult, String> {
    let changes = conn
        .execute(&s.sql, params_from_iter(s.params.iter().map(to_sql)))
        .map_err(err)?;
    Ok(ExecResult { changes, last_id: conn.last_insert_rowid() })
}

#[tauri::command]
fn db_select(db: State<Db>, sql: String, params: Vec<Value>) -> Result<Vec<Value>, String> {
    let c = db.0.lock().map_err(err)?;
    run_select(&c, &Stmt { sql, params })
}

#[tauri::command]
fn db_execute(db: State<Db>, sql: String, params: Vec<Value>) -> Result<ExecResult, String> {
    let c = db.0.lock().map_err(err)?;
    run_exec(&c, &Stmt { sql, params })
}

/// Runs all statements atomically (single transaction, rollback on error).
#[tauri::command]
fn db_batch(db: State<Db>, stmts: Vec<Stmt>) -> Result<usize, String> {
    let mut c = db.0.lock().map_err(err)?;
    let tx = c.transaction().map_err(err)?;
    let mut total = 0;
    for s in &stmts {
        if s.params.is_empty() {
            tx.execute_batch(&s.sql).map_err(err)?;
        } else {
            total += tx
                .execute(&s.sql, params_from_iter(s.params.iter().map(to_sql)))
                .map_err(|e| format!("{e} — SQL: {}", s.sql.chars().take(120).collect::<String>()))?;
        }
    }
    tx.commit().map_err(err)?;
    Ok(total)
}

#[tauri::command]
fn app_paths(app: tauri::AppHandle) -> Result<Value, String> {
    let d = data_dir(&app)?;
    Ok(serde_json::json!({
        "dataDir": d.to_string_lossy(),
        "dbPath": d.join(DB_FILE).to_string_lossy(),
        "backupsDir": backups_dir(&app)?.to_string_lossy(),
    }))
}

/// Online backup through the SQLite backup API (safe on a live database),
/// followed by an integrity check of the produced file.
fn backup_to(conn: &Connection, dest: &Path) -> Result<(), String> {
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p).map_err(err)?;
    }
    let tmp = dest.with_extension("tmp");
    let _ = fs::remove_file(&tmp);
    {
        let mut out = Connection::open(&tmp).map_err(err)?;
        let b = Backup::new(conn, &mut out).map_err(err)?;
        b.run_to_completion(256, Duration::from_millis(0), None).map_err(err)?;
        drop(b);
        // Self-contained file: no -wal/-shm companions.
        out.query_row("PRAGMA journal_mode=DELETE", [], |_| Ok(())).map_err(err)?;
    }
    let check = integrity_of(&tmp)?;
    if check != "ok" {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Sauvegarde invalide : {check}"));
    }
    fs::rename(&tmp, dest).map_err(err)
}

fn integrity_of(p: &Path) -> Result<String, String> {
    let c = Connection::open_with_flags(p, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
    c.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)).map_err(err)
}

#[tauri::command]
fn db_backup(app: tauri::AppHandle, db: State<Db>, dest: Option<String>, prefix: Option<String>) -> Result<String, String> {
    let path = match dest {
        Some(d) => PathBuf::from(d),
        None => {
            let ts = chrono_like_now();
            backups_dir(&app)?.join(format!("{}-{ts}.db", prefix.unwrap_or_else(|| "manuel".into())))
        }
    };
    let c = db.0.lock().map_err(err)?;
    backup_to(&c, &path)?;
    Ok(path.to_string_lossy().into())
}

#[tauri::command]
fn db_integrity(db: State<Db>) -> Result<String, String> {
    let c = db.0.lock().map_err(err)?;
    let r: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(err)?;
    let fk: i64 = c
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0))
        .map_err(err)?;
    Ok(if r == "ok" && fk == 0 { "ok".into() } else { format!("{r}; clés étrangères invalides: {fk}") })
}

/// Restores a backup into the live database (after saving the current one).
#[tauri::command]
fn db_restore(app: tauri::AppHandle, db: State<Db>, source: String) -> Result<String, String> {
    let src = PathBuf::from(&source);
    let check = integrity_of(&src).map_err(|_| "Fichier illisible ou non SQLite.".to_string())?;
    if check != "ok" {
        return Err(format!("La sauvegarde est corrompue : {check}"));
    }
    let mut c = db.0.lock().map_err(err)?;
    let safety = backups_dir(&app)?.join(format!("avant-restauration-{}.db", chrono_like_now()));
    backup_to(&c, &safety)?;
    c.restore(rusqlite::DatabaseName::Main, &src, None::<fn(rusqlite::backup::Progress)>)
        .map_err(err)?;
    configure(&c)?;
    Ok(safety.to_string_lossy().into())
}

#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let mut out = vec![];
    for e in fs::read_dir(backups_dir(&app)?).map_err(err)? {
        let e = e.map_err(err)?;
        let p = e.path();
        if p.extension().map(|x| x == "db").unwrap_or(false) {
            let m = e.metadata().map_err(err)?;
            let modified = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.push(BackupInfo {
                path: p.to_string_lossy().into(),
                name: e.file_name().to_string_lossy().into(),
                size: m.len(),
                modified,
            });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

#[tauri::command]
fn prune_backups(app: tauri::AppHandle, prefix: String, keep: usize) -> Result<usize, String> {
    let mut removed = 0;
    for b in list_backups(app)?.iter().filter(|b| b.name.starts_with(&prefix)).skip(keep) {
        if fs::remove_file(&b.path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

fn chrono_like_now() -> String {
    // YYYYMMDD-HHMMSS in UTC without extra dependency.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, (rem % 3600) / 60, rem % 60)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let path = data_dir(app.handle())?.join(DB_FILE);
            let conn = Connection::open(&path)?;
            configure(&conn)?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_select, db_execute, db_batch, db_backup, db_integrity, db_restore,
            app_paths, list_backups, prune_backups, path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running MF/1.2 Iris Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_and_restore_roundtrip() {
        let dir = std::env::temp_dir().join(format!("iris-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let live = Connection::open(dir.join("live.db")).unwrap();
        configure(&live).unwrap();
        live.execute_batch("CREATE TABLE orders(id TEXT PRIMARY KEY, total INTEGER); INSERT INTO orders VALUES ('a', 1234);").unwrap();
        // online backup while the connection is open
        let bk = dir.join("bk.db");
        backup_to(&live, &bk).unwrap();
        assert_eq!(integrity_of(&bk).unwrap(), "ok");
        assert!(!dir.join("bk.db-wal").exists() && !dir.join("bk.tmp-wal").exists());
        // modify live data, then restore the backup into the live connection
        live.execute("UPDATE orders SET total=0", []).unwrap();
        live.execute("INSERT INTO orders VALUES ('b', 1)", []).unwrap();
        let mut live = live;
        live.restore(rusqlite::DatabaseName::Main, &bk, None::<fn(rusqlite::backup::Progress)>).unwrap();
        let (n, t): (i64, i64) = live.query_row("SELECT count(*), sum(total) FROM orders", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((n, t), (1, 1234));
        // a non-SQLite file is rejected
        let bad = dir.join("bad.db");
        fs::write(&bad, b"not a database at all, definitely not sqlite........................................................").unwrap();
        assert!(integrity_of(&bad).is_err() || integrity_of(&bad).unwrap() != "ok");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn timestamp_format() {
        let s = chrono_like_now();
        assert_eq!(s.len(), 15);
        assert_eq!(&s[8..9], "-");
    }
}
