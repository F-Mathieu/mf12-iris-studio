import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initDb } from './lib/db';
import { seedIfEmpty } from './services/seed';
import { applyDataUpgrades } from './services/onelab';
import { autoBackupIfDue } from './services/backup';
import App from './App';

const root = createRoot(document.getElementById('root')!);

async function boot() {
  try {
    await initDb();
    await seedIfEmpty();
    await applyDataUpgrades();
    root.render(<StrictMode><App /></StrictMode>);
    autoBackupIfDue().catch((e) => console.warn('Sauvegarde auto', e));
    setInterval(() => autoBackupIfDue().catch(() => {}), 3600e3);
  } catch (e) {
    console.error(e);
    root.render(
      <div style={{ padding: 48, fontFamily: '-apple-system', color: '#f3f1ec' }}>
        <h2>Impossible d’ouvrir la base de données</h2>
        <p style={{ color: '#b4b1aa' }}>{String(e instanceof Error ? e.message : e)}</p>
        <p style={{ color: '#8d8b86' }}>Vos sauvegardes se trouvent dans le dossier de l’application (backups). Contactez le support technique avant toute manipulation.</p>
      </div>,
    );
  }
}
boot();
