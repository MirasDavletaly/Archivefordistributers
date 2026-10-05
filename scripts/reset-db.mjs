// Пересоздаёт базу из data/seed.json. Все правки, сделанные в интерфейсе, теряются.
// Запуск: node scripts/reset-db.mjs [--force]
import { rmSync, existsSync } from 'node:fs';
import { openDb, seedIfEmpty, stats } from '../src/db.mjs';

const DB_FILE = process.env.ARCHIVE_DB || 'data/archive.db';

if (existsSync(DB_FILE) && !process.argv.includes('--force')) {
  console.error(`База ${DB_FILE} уже существует.`);
  console.error('Все правки из интерфейса будут потеряны. Если уверены, запустите с --force.');
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  const file = DB_FILE + suffix;
  if (existsSync(file)) rmSync(file);
}

const db = openDb(DB_FILE);
const count = seedIfEmpty(db);
const s = stats(db);

console.log(`База пересоздана: ${DB_FILE}`);
console.log(`  поставщиков ${s.suppliers} (дистрибьюторов ${s.distributors}, прямых ${s.direct})`);
console.log(`  брендов ${s.brands}, связей ${s.links}, контактов ${s.contacts}`);
if (!count) console.log('  ВНИМАНИЕ: data/seed.json не найден, база пустая.');
