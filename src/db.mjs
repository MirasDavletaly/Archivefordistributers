// Слой доступа к данным. Встроенный в Node SQLite, без внешних зависимостей.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  kind       TEXT    NOT NULL DEFAULT 'distributor',  -- distributor | direct
  city       TEXT    NOT NULL DEFAULT '',
  country    TEXT    NOT NULL DEFAULT '',
  website    TEXT    NOT NULL DEFAULT '',
  phone      TEXT    NOT NULL DEFAULT '',
  email      TEXT    NOT NULL DEFAULT '',
  terms      TEXT    NOT NULL DEFAULT '',
  notes      TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'active',   -- active | reserve | blacklist
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE          -- верхний регистр, для склейки дублей
);

CREATE TABLE IF NOT EXISTS supplier_brands (
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  brand_id    INTEGER NOT NULL REFERENCES brands(id)    ON DELETE CASCADE,
  note        TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (supplier_id, brand_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_contacts_supplier ON contacts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sb_brand          ON supplier_brands(brand_id);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const SUPPLIER_FIELDS = ['name', 'kind', 'city', 'country', 'website', 'phone', 'email', 'terms', 'notes', 'status'];
const CONTACT_FIELDS = ['name', 'role', 'email', 'phone', 'note', 'sort'];

// Раньше статус хранился русским текстом. Теперь это код, а подпись даёт интерфейс.
const STATUS_MIGRATION = `
UPDATE suppliers SET status = 'active'    WHERE lower(status) IN ('активный', 'актив');
UPDATE suppliers SET status = 'reserve'   WHERE lower(status) = 'резерв';
UPDATE suppliers SET status = 'blacklist' WHERE lower(status) IN ('чёрный список', 'черный список');
UPDATE suppliers SET status = 'active'    WHERE status = '';
`;

export function openDb(file = 'data/archive.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  db.exec(STATUS_MIGRATION);
  return db;
}

/** Заполняет пустую базу из data/seed.json. Возвращает число добавленных поставщиков. */
export function seedIfEmpty(db, seedPath = 'data/seed.json') {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM suppliers').get();
  if (count > 0 || !existsSync(seedPath)) return 0;

  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  db.exec('BEGIN');
  try {
    for (const entry of seed.entries) {
      const id = createSupplier(db, { name: entry.name, kind: entry.kind });
      entry.brands.forEach((b) => attachBrand(db, id, b));
      entry.contacts.forEach((c, i) => createContact(db, id, { ...c, sort: i }));
    }
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run('imported_from', `${seed.source} (${seed.importedAt})`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return seed.entries.length;
}

/** Ошибка с кодом: интерфейс переводит её на своём языке, API отдаёт код наружу. */
const fail = (code, message) => Object.assign(new Error(message), { code });

const pick = (fields, data) => {
  const out = {};
  for (const f of fields) if (data[f] !== undefined && data[f] !== null) out[f] = data[f];
  return out;
};

/* ---------- Поставщики ---------- */

export function createSupplier(db, data) {
  const row = { name: '', kind: 'distributor', ...pick(SUPPLIER_FIELDS, data) };
  if (!String(row.name).trim()) throw fail('name_required', 'Name is required');
  const keys = Object.keys(row);
  const stmt = db.prepare(
    `INSERT INTO suppliers (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  );
  return Number(stmt.run(...keys.map((k) => String(row[k]))).lastInsertRowid);
}

export function updateSupplier(db, id, data) {
  const row = pick(SUPPLIER_FIELDS, data);
  if ('name' in row && !String(row.name).trim()) throw fail('name_required', 'Name is required');
  const keys = Object.keys(row);
  if (!keys.length) return false;
  const sql = `UPDATE suppliers SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`;
  return db.prepare(sql).run(...keys.map((k) => String(row[k])), id).changes > 0;
}

export function deleteSupplier(db, id) {
  return db.prepare('DELETE FROM suppliers WHERE id = ?').run(id).changes > 0;
}

export function getSupplier(db, id) {
  const s = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!s) return null;
  s.brands = db.prepare(`
    SELECT b.id, b.name, sb.note
      FROM supplier_brands sb JOIN brands b ON b.id = sb.brand_id
     WHERE sb.supplier_id = ?
     ORDER BY b.name COLLATE NOCASE`).all(id);
  s.contacts = db.prepare('SELECT * FROM contacts WHERE supplier_id = ? ORDER BY sort, id').all(id);
  return s;
}

/** Все поставщики со вложенными брендами и контактами — основа поискового индекса. */
export function allSuppliers(db) {
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE').all();
  const byId = new Map(suppliers.map((s) => [s.id, Object.assign(s, { brands: [], contacts: [] })]));

  for (const r of db.prepare(`
    SELECT sb.supplier_id, b.id, b.name, sb.note
      FROM supplier_brands sb JOIN brands b ON b.id = sb.brand_id
     ORDER BY b.name COLLATE NOCASE`).all()) {
    byId.get(r.supplier_id)?.brands.push({ id: r.id, name: r.name, note: r.note });
  }
  for (const r of db.prepare('SELECT * FROM contacts ORDER BY sort, id').all()) {
    byId.get(r.supplier_id)?.contacts.push(r);
  }
  return suppliers;
}

/* ---------- Бренды ---------- */

export function upsertBrand(db, name) {
  const clean = String(name).trim();
  if (!clean) throw fail('brand_name_required', 'Brand name is required');
  const key = clean.toUpperCase();
  const found = db.prepare('SELECT id FROM brands WHERE name_key = ?').get(key);
  if (found) return Number(found.id);
  return Number(db.prepare('INSERT INTO brands (name, name_key) VALUES (?, ?)').run(clean, key).lastInsertRowid);
}

export function attachBrand(db, supplierId, name, note = '') {
  const brandId = upsertBrand(db, name);
  db.prepare('INSERT OR IGNORE INTO supplier_brands (supplier_id, brand_id, note) VALUES (?, ?, ?)')
    .run(supplierId, brandId, note);
  return brandId;
}

export function detachBrand(db, supplierId, brandId) {
  const res = db.prepare('DELETE FROM supplier_brands WHERE supplier_id = ? AND brand_id = ?')
    .run(supplierId, brandId);
  // Бренд, который больше никто не возит, в справочнике не нужен.
  db.prepare(`DELETE FROM brands WHERE id = ?
              AND NOT EXISTS (SELECT 1 FROM supplier_brands WHERE brand_id = ?)`).run(brandId, brandId);
  return res.changes > 0;
}

export function renameBrand(db, brandId, name) {
  const clean = String(name).trim();
  if (!clean) throw fail('brand_name_required', 'Brand name is required');
  const key = clean.toUpperCase();
  const clash = db.prepare('SELECT id FROM brands WHERE name_key = ? AND id <> ?').get(key, brandId);
  if (clash) {
    // Такой бренд уже есть — переносим связи на него и удаляем дубль.
    db.prepare('UPDATE OR IGNORE supplier_brands SET brand_id = ? WHERE brand_id = ?').run(clash.id, brandId);
    db.prepare('DELETE FROM supplier_brands WHERE brand_id = ?').run(brandId);
    db.prepare('DELETE FROM brands WHERE id = ?').run(brandId);
    return Number(clash.id);
  }
  db.prepare('UPDATE brands SET name = ?, name_key = ? WHERE id = ?').run(clean, key, brandId);
  return brandId;
}

export function listBrands(db) {
  return db.prepare(`
    SELECT b.id, b.name, COUNT(sb.supplier_id) AS suppliers
      FROM brands b LEFT JOIN supplier_brands sb ON sb.brand_id = b.id
     GROUP BY b.id
     ORDER BY b.name COLLATE NOCASE`).all();
}

export function getBrand(db, id) {
  const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
  if (!b) return null;
  b.suppliers = db.prepare(`
    SELECT s.id, s.name, s.kind, s.city, sb.note
      FROM supplier_brands sb JOIN suppliers s ON s.id = sb.supplier_id
     WHERE sb.brand_id = ?
     ORDER BY s.name COLLATE NOCASE`).all(id);
  return b;
}

/* ---------- Контакты ---------- */

export function createContact(db, supplierId, data) {
  const row = { ...pick(CONTACT_FIELDS, data) };
  const keys = ['supplier_id', ...Object.keys(row)];
  const values = [supplierId, ...Object.keys(row).map((k) => (k === 'sort' ? Number(row[k]) || 0 : String(row[k])))];
  const stmt = db.prepare(
    `INSERT INTO contacts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  );
  return Number(stmt.run(...values).lastInsertRowid);
}

export function updateContact(db, id, data) {
  const row = pick(CONTACT_FIELDS, data);
  const keys = Object.keys(row);
  if (!keys.length) return false;
  const values = keys.map((k) => (k === 'sort' ? Number(row[k]) || 0 : String(row[k])));
  return db.prepare(`UPDATE contacts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...values, id).changes > 0;
}

export function deleteContact(db, id) {
  return db.prepare('DELETE FROM contacts WHERE id = ?').run(id).changes > 0;
}

export function stats(db) {
  const one = (sql) => Object.values(db.prepare(sql).get())[0];
  return {
    suppliers: one('SELECT COUNT(*) FROM suppliers'),
    distributors: one("SELECT COUNT(*) FROM suppliers WHERE kind = 'distributor'"),
    direct: one("SELECT COUNT(*) FROM suppliers WHERE kind = 'direct'"),
    brands: one('SELECT COUNT(*) FROM brands'),
    links: one('SELECT COUNT(*) FROM supplier_brands'),
    contacts: one('SELECT COUNT(*) FROM contacts'),
    importedFrom: db.prepare("SELECT value FROM meta WHERE key = 'imported_from'").get()?.value || '',
  };
}
