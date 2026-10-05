// Превращает "Authorized Dealers & Distributors.xlsx" в data/seed.json.
//
// Структура исходника:
//   A            — дистрибьютор, указан в первой строке своего блока
//   C..I         — бренды этого дистрибьютора, сеткой слева направо и вниз
//   J            — контакты блока
//   A='DIRECT SUPPLIERS' — ниже начинается раздел прямых поставщиков,
//                  где каждая строка с брендом в C это отдельный поставщик
//
// Запуск: node scripts/import-xlsx.mjs "путь/к/файлу.xlsx"

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readSheet } from './xlsx-reader.mjs';
import { parseContactCell } from '../src/contacts.mjs';

const COL_DISTRIBUTOR = 1;      // A
const COL_BRAND_FROM = 3;       // C
const COL_BRAND_TO = 9;         // I
const COL_CONTACTS = 10;        // J
const DIRECT_MARKER = 'DIRECT SUPPLIERS';
const HEADERS = new Set(['DISTRIBUTORS', 'MANUFACTURERS', 'DIRECT CONTACTS']);

export function buildModel({ rows, maxRow }) {
  const entries = [];
  let current = null;
  let mode = 'distributor';

  const start = (name, kind) => {
    const entry = { name: name.trim(), kind, brands: [], contacts: [] };
    entries.push(entry);
    return entry;
  };
  const addBrands = (entry, values) => {
    for (const v of values) {
      const name = v.trim();
      if (!name) continue;
      if (!entry.brands.some((b) => b.toUpperCase() === name.toUpperCase())) entry.brands.push(name);
    }
  };
  const addContacts = (entry, cell) => {
    for (const c of parseContactCell(cell)) {
      const dup = c.email
        ? entry.contacts.some((x) => x.email === c.email)
        : entry.contacts.some((x) => x.name === c.name);
      if (!dup) entry.contacts.push(c);
    }
  };

  for (let r = 1; r <= maxRow; r++) {
    const row = rows.get(r);
    if (!row) continue;

    const head = row.get(COL_DISTRIBUTOR);
    if (head && HEADERS.has(head.toUpperCase())) continue;

    // В строке с этим заголовком уже стоит первый прямой поставщик,
    // поэтому переключаем режим и продолжаем разбирать ту же строку.
    if (head && head.toUpperCase() === DIRECT_MARKER) {
      mode = 'direct';
      current = null;
    }

    const brandCells = [];
    for (let c = COL_BRAND_FROM; c <= COL_BRAND_TO; c++) {
      const v = row.get(c);
      if (v && !HEADERS.has(v.toUpperCase())) brandCells.push(v);
    }

    if (mode === 'distributor') {
      if (head) current = start(head, 'distributor');
      if (!current) continue;
      addBrands(current, brandCells);
    } else {
      // Раздел прямых поставщиков: имя поставщика — первый бренд в строке.
      if (brandCells.length) {
        current = start(brandCells[0], 'direct');
        addBrands(current, brandCells);
      }
      if (!current) continue;
    }

    const contactCell = row.get(COL_CONTACTS);
    if (contactCell) addContacts(current, contactCell);
  }

  return entries;
}

function main() {
  const src = process.argv[2]
    || resolve(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads', 'Authorized Dealers & Distributors.xlsx');
  const outPath = resolve(import.meta.dirname, '..', 'data', 'seed.json');

  const sheet = readSheet(src);
  const entries = buildModel(sheet);

  const brands = new Set();
  let contacts = 0;
  let links = 0;
  for (const e of entries) {
    e.brands.forEach((b) => brands.add(b.toUpperCase()));
    links += e.brands.length;
    contacts += e.contacts.length;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({
    source: src.replace(/\\/g, '/').split('/').pop(),
    importedAt: new Date().toISOString().slice(0, 10),
    entries,
  }, null, 2), 'utf8');

  console.log(`Поставщиков:        ${entries.length}`);
  console.log(`  из них прямых:    ${entries.filter((e) => e.kind === 'direct').length}`);
  console.log(`Уникальных брендов: ${brands.size}`);
  console.log(`Связей с брендами:  ${links}`);
  console.log(`Контактов:          ${contacts}`);
  console.log(`\nЗаписано: ${outPath}`);
}

// Запускаем только при прямом вызове, чтобы тесты могли импортировать buildModel.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
