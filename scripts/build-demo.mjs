// Собирает статическую демо-версию в docs/ — её публикует GitHub Pages.
//
// На Pages нет сервера, поэтому данные зашиваются в файл, а правки посетителя
// сохраняются в его браузере. Данные берутся из той же базы, что и у сервера,
// чтобы демо и рабочая версия не разошлись.
//
// Запуск: node scripts/build-demo.mjs

import { writeFileSync, mkdirSync, copyFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openDb, seedIfEmpty, allSuppliers, listBrands } from '../src/db.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs');
const PUBLIC = join(ROOT, 'public');

const ASSETS = ['styles.css', 'app.js', 'ui.js', 'i18n.js', 'transport.js', 'search.js', 'demo-store.js'];

const DEMO_BOOT = `// Точка входа демо-версии: подменяет сервер локальным хранилищем.
import { useLocalBackend } from './transport.js';
import { createDemoStore } from './demo-store.js';
import DATA from './demo-data.js';

useLocalBackend(createDemoStore(DATA).request);
await import('./app.js');
`;

function collectData() {
  // Строим базу в памяти из seed.json — те же правила, что и у сервера.
  const db = openDb(':memory:');
  const seeded = seedIfEmpty(db, join(ROOT, 'data', 'seed.json'));
  if (!seeded) throw new Error('data/seed.json не найден или пуст — сначала запустите импорт из Excel');

  const suppliers = [];
  const links = [];
  const contacts = [];

  for (const s of allSuppliers(db)) {
    suppliers.push({
      id: s.id, name: s.name, kind: s.kind, city: s.city, country: s.country,
      website: s.website, phone: s.phone, email: s.email, terms: s.terms,
      notes: s.notes, status: s.status, created_at: s.created_at, updated_at: s.updated_at,
    });
    for (const b of s.brands) links.push({ supplier_id: s.id, brand_id: b.id, note: b.note || '' });
    for (const c of s.contacts) {
      contacts.push({
        id: c.id, supplier_id: c.supplier_id, name: c.name, role: c.role,
        email: c.email, phone: c.phone, note: c.note, sort: c.sort,
      });
    }
  }

  const brands = listBrands(db).map((b) => ({ id: b.id, name: b.name, name_key: b.name.toUpperCase() }));
  return { suppliers, brands, links, contacts };
}

function buildIndexHtml() {
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
  // Демо грузится через свою точку входа, которая сначала включает локальное хранилище.
  const patched = html.replace('src="./app.js"', 'src="./demo-boot.js"');
  if (patched === html) throw new Error('В public/index.html не найдено подключение ./app.js');
  return patched;
}

const data = collectData();

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const asset of ASSETS) copyFileSync(join(PUBLIC, asset), join(OUT, asset));
writeFileSync(join(OUT, 'index.html'), buildIndexHtml(), 'utf8');
writeFileSync(join(OUT, 'demo-boot.js'), DEMO_BOOT, 'utf8');
writeFileSync(
  join(OUT, 'demo-data.js'),
  `// Создано автоматически: node scripts/build-demo.mjs — править вручную не нужно.\nexport default ${JSON.stringify(data)};\n`,
  'utf8',
);
// Без этого файла GitHub Pages прогоняет содержимое через Jekyll.
writeFileSync(join(OUT, '.nojekyll'), '', 'utf8');

const size = ASSETS.concat(['index.html', 'demo-boot.js', 'demo-data.js'])
  .reduce((sum, f) => sum + readFileSync(join(OUT, f)).length, 0);

console.log('Демо-версия собрана в docs/');
console.log(`  поставщиков ${data.suppliers.length}, брендов ${data.brands.length},`
  + ` связей ${data.links.length}, контактов ${data.contacts.length}`);
console.log(`  размер: ${(size / 1024).toFixed(0)} КБ`);
console.log('\nВ настройках репозитория: Settings → Pages → Source: Deploy from a branch,');
console.log('ветка main, папка /docs. Затем закоммитьте docs/ и запушьте.');
