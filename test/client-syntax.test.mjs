// Клиентские модули не импортируются в Node (им нужен document), поэтому
// обычные тесты не поймают в них опечатку. Проверяем их разбор отдельно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_DIR = 'public';
const scripts = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.js'));

test('в public есть клиентские модули', () => {
  assert.ok(scripts.length >= 3, `найдено ${scripts.length}`);
});

for (const file of scripts) {
  test(`${file} разбирается без синтаксических ошибок`, () => {
    // package.json объявляет type: module, поэтому .js здесь проверяется как модуль.
    execFileSync(process.execPath, ['--check', join(PUBLIC_DIR, file)], { stdio: 'pipe' });
  });
}

test('index.html ссылается на существующие файлы', () => {
  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map((m) => m[1]);
  const existing = new Set(readdirSync(PUBLIC_DIR));
  for (const ref of refs) {
    if (ref.startsWith('api/')) continue;
    assert.ok(existing.has(ref), `в index.html указан ${ref}, которого нет в public/`);
  }
});

test('каждый ключ data-i18n из разметки есть в словаре', async () => {
  const { DICTIONARIES } = await import('../public/i18n.js');
  const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'в разметке нет ключей перевода');
  for (const key of keys) {
    assert.ok(DICTIONARIES.en[key], `ключ ${key} из index.html отсутствует в словаре`);
  }
});

test('все ключи t() из app.js есть в словаре', async () => {
  const { DICTIONARIES } = await import('../public/i18n.js');
  const source = readFileSync(join(PUBLIC_DIR, 'app.js'), 'utf8');
  const keys = new Set([...source.matchAll(/\bt\('([a-z][\w.]+)'/gi)].map((m) => m[1]));
  assert.ok(keys.size > 20, `найдено ключей: ${keys.size}`);
  const missing = [...keys].filter((k) => !DICTIONARIES.en[k]);
  assert.deepEqual(missing, [], 'в словаре нет этих ключей');
});
