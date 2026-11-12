import type { Db } from './types';

/**
 * Ordered schema migrations. Never edit a shipped migration: append a new one.
 * Version tracked with PRAGMA user_version. Money = INTEGER cents. Rates = basis points (1% = 100).
 */
export const MIGRATIONS: string[] = [
  /* 1 — initial schema */ `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE media (
  id TEXT PRIMARY KEY, mime TEXT NOT NULL DEFAULT 'image/jpeg',
  thumb TEXT NOT NULL, full TEXT NOT NULL, width INTEGER, height INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE families (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_first_name TEXT, phone TEXT, email TEXT,
  notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_families_name ON families(name COLLATE NOCASE);
CREATE INDEX idx_families_phone ON families(phone);

CREATE TABLE participants (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL, notes TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_participants_family ON participants(family_id);

CREATE TABLE price_templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, conditions TEXT,
  archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- A price list belongs either to a template (its master list) or to a session (an independent copy).
CREATE TABLE price_lists (
  id TEXT PRIMARY KEY, template_id TEXT REFERENCES price_templates(id) ON DELETE CASCADE,
  source_template_id TEXT, source_template_name TEXT, name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, date TEXT, start_time TEXT, end_time TEXT,
  location TEXT, organizer TEXT, description TEXT,
  status TEXT NOT NULL DEFAULT 'preparation' CHECK (status IN ('preparation','active','terminee','archivee')),
  price_list_id TEXT REFERENCES price_lists(id) ON DELETE SET NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 20, slot_capacity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_date ON sessions(date);

-- Registration of a family to a session, including its appointment (1 RDV per registration).
CREATE TABLE session_registrations (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  external_ref TEXT, participants_count INTEGER, notes TEXT,
  appt_date TEXT, appt_time TEXT, appt_duration INTEGER,
  appt_status TEXT NOT NULL DEFAULT 'a_venir' CHECK (appt_status IN ('a_venir','present','en_cours','termine','absent','annule')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_reg_session ON session_registrations(session_id);
CREATE INDEX idx_reg_family ON session_registrations(family_id);
CREATE UNIQUE INDEX uq_reg_ref ON session_registrations(session_id, external_ref) WHERE external_ref IS NOT NULL AND external_ref <> '';

CREATE TABLE file_references (
  id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  reference TEXT NOT NULL, file_path TEXT, notes TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_fileref_participant ON file_references(participant_id);
CREATE INDEX idx_fileref_ref ON file_references(reference);

CREATE TABLE composition_styles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  min_iris INTEGER NOT NULL DEFAULT 1, max_iris INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE composition_examples (
  id TEXT PRIMARY KEY, style_id TEXT NOT NULL REFERENCES composition_styles(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  iris_count INTEGER, caption TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_examples_style ON composition_examples(style_id);

CREATE TABLE products (
  id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK (category IN ('numerique','impression','option')),
  name TEXT NOT NULL, description TEXT, media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  style_id TEXT REFERENCES composition_styles(id) ON DELETE SET NULL,
  needs_composition INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE product_variants (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, format TEXT, finish TEXT, extra_cost_cents INTEGER NOT NULL DEFAULT 0,
  preferred_supplier_product_id TEXT,
  active INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

-- kind 'variant' -> ref_id = product_variants.id ; kind 'style' -> ref_id = composition_styles.id (creation fee).
-- iris_count 0 = any number of iris.
CREATE TABLE price_list_items (
  id TEXT PRIMARY KEY, price_list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('variant','style')), ref_id TEXT NOT NULL,
  iris_count INTEGER NOT NULL DEFAULT 0, price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  pricing_mode TEXT NOT NULL DEFAULT 'manual' CHECK (pricing_mode IN ('manual','coef','margin')),
  pricing_param REAL, enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE (price_list_id, kind, ref_id, iris_count)
);
CREATE INDEX idx_pli_list ON price_list_items(price_list_id);

-- Packs & promotions (config JSON, see lib/pricing.ts).
CREATE TABLE promotions (
  id TEXT PRIMARY KEY, price_list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  type TEXT NOT NULL CHECK (type IN ('pack','percent','amount','quantity')),
  config TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 100, stackable INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_promos_list ON promotions(price_list_id);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT, email TEXT, phone TEXT, website TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR', vat_bp INTEGER NOT NULL DEFAULT 2000,
  discount_bp INTEGER NOT NULL DEFAULT 0, shipping_cents INTEGER NOT NULL DEFAULT 0,
  lead_time TEXT, notes TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE supplier_products (
  id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sku TEXT, support TEXT, format TEXT, finish TEXT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
  equivalence TEXT NOT NULL DEFAULT 'equivalent' CHECK (equivalence IN ('equivalent','proche')),
  notes TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX idx_sp_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_sp_variant ON supplier_products(variant_id);
-- Price history: the most recent valid_from is the current price.
CREATE TABLE supplier_prices (
  id TEXT PRIMARY KEY, supplier_product_id TEXT NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL, price_is_ttc INTEGER NOT NULL DEFAULT 1, vat_bp INTEGER,
  discount_bp INTEGER, shipping_cents INTEGER, valid_from TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_sprice_sp ON supplier_prices(supplier_product_id, valid_from);

CREATE TABLE orders (
  id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  registration_id TEXT REFERENCES session_registrations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','validee','annulee')),
  subtotal_cents INTEGER NOT NULL DEFAULT 0, discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  cost_estimate_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT, desired_delivery TEXT, payment_due_date TEXT, payment_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, validated_at TEXT, cancelled_at TEXT
);
CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_orders_family ON orders(family_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_compositions (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  style_id TEXT REFERENCES composition_styles(id) ON DELETE SET NULL, style_name TEXT NOT NULL,
  iris_count INTEGER NOT NULL, participant_ids TEXT NOT NULL DEFAULT '[]', participant_names TEXT,
  instructions TEXT, fee_cents INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_oc_order ON order_compositions(order_id);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  composition_id TEXT REFERENCES order_compositions(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
  product_id TEXT, category TEXT NOT NULL, product_name TEXT NOT NULL, variant_name TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0), unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL, unit_cost_cents INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_oi_order ON order_items(order_id);

CREATE TABLE order_discounts (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  promotion_id TEXT, kind TEXT NOT NULL CHECK (kind IN ('auto','manual')),
  label TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0), reason TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_od_order ON order_discounts(order_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('carte','especes','cheque','virement','autre')),
  paid_at TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE production_tasks (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  composition_id TEXT REFERENCES order_compositions(id) ON DELETE CASCADE,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('composition','item')),
  status TEXT NOT NULL DEFAULT 'a_realiser' CHECK (status IN ('a_realiser','en_cours','montage_termine','fichier_pret','impression_a_commander','commande_fournisseur','recu','livre')),
  notes TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX idx_pt_order ON production_tasks(order_id);
CREATE INDEX idx_pt_status ON production_tasks(status);

CREATE TABLE supplier_orders (
  id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  reference TEXT, status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','commandee','recue','annulee')),
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0, actual_cost_cents INTEGER, shipping_cents INTEGER NOT NULL DEFAULT 0,
  ordered_at TEXT, received_at TEXT, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE supplier_order_items (
  id TEXT PRIMARY KEY, supplier_order_id TEXT NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL, est_cost_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_soi_item ON supplier_order_items(order_item_id);

CREATE TABLE session_expenses (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('location','deplacement','publicite','consommables','temps','autre')),
  label TEXT, amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0), date TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_exp_session ON session_expenses(session_id);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  details TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
`,
  /* 2 — supports d'impression limités à Acrylique, Alu Dibond, HD Metal Print 5 mm.
        Bases déjà initialisées : anciens supports archivés (historique conservé), HD Metal Print ajouté. */ `
UPDATE products SET archived=1, active=0
 WHERE category='impression' AND name IN ('Tirage photo premium','Papier Fine Art','Caisse américaine');
UPDATE products SET name='Alu Dibond' WHERE category='impression' AND name='Dibond aluminium';
INSERT INTO products (id, category, name, needs_composition, sort, created_at)
 SELECT lower(hex(randomblob(16))), 'impression', 'HD Metal Print 5 mm', 1, 12, strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE EXISTS (SELECT 1 FROM settings WHERE key='seeded' AND value='1')
   AND NOT EXISTS (SELECT 1 FROM products WHERE name='HD Metal Print 5 mm');
INSERT INTO product_variants (id, product_id, name, format, sort)
 SELECT lower(hex(randomblob(16))), p.id, f.v, f.v, f.s
 FROM products p, (SELECT '20 × 20 cm' v, 0 s UNION ALL SELECT '30 × 30 cm', 1 UNION ALL SELECT '40 × 40 cm', 2 UNION ALL SELECT '40 × 60 cm', 3) f
 WHERE p.name='HD Metal Print 5 mm' AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id);
`,
  /* 3 — paiement en plusieurs fois : échéancier choisi dans le panier (JSON { count, first_date }). */ `
ALTER TABLE orders ADD COLUMN payment_plan TEXT;
`,
  /* 4 — disposition des iris dans la création : horizontal | vertical | diagonale (NULL = non précisée). */ `
ALTER TABLE order_compositions ADD COLUMN orientation TEXT;
`,
  /* 5 — factures et avoirs : numérotation continue, contenu figé (JSON). Conservés si la commande est supprimée. */ `
CREATE TABLE invoices (
  id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK (kind IN ('facture','avoir')),
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL, invoice_id TEXT REFERENCES invoices(id),
  issued_at TEXT NOT NULL, total_cents INTEGER NOT NULL, data TEXT NOT NULL, cancelled_by TEXT
);
CREATE INDEX idx_invoices_order ON invoices(order_id);
`,
];

export async function migrate(db: Db): Promise<number> {
  const [{ user_version }] = await db.select<{ user_version: number }>('PRAGMA user_version');
  let v = user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    await db.batch([{ sql: MIGRATIONS[i] }, { sql: `PRAGMA user_version = ${i + 1};` }]);
    v = i + 1;
  }
  return v;
}
