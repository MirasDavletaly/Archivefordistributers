// HTTP-сервер архива поставщиков. Только встроенные модули Node.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { openDb, seedIfEmpty, stats } from './src/db.mjs';
import { createStore, handleApi } from './src/api.mjs';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.ARCHIVE_DB || 'data/archive.db';
const PASSWORD = process.env.ARCHIVE_PASSWORD || '';
const SECRET = process.env.ARCHIVE_SECRET || randomBytes(32).toString('hex');
const SESSION_DAYS = 30;
const PUBLIC_DIR = resolve(import.meta.dirname, 'public');
const COOKIE = 'archive_session';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ---------- сессия ---------- */

const sign = (value) => createHmac('sha256', SECRET).update(value).digest('base64url');

function makeToken() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${sign(exp)}`;
}

function validToken(token) {
  if (!token || !token.includes('.')) return false;
  const [exp, mac] = token.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const got = Buffer.from(mac || '');
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const readCookie = (header, name) => (header || '')
  .split(';')
  .map((p) => p.trim().split('='))
  .find(([k]) => k === name)?.[1];

function passwordMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------- утилиты запроса ---------- */

/** Ошибка с кодом: интерфейс переводит её на языке, который сейчас выбран. */
const coded = (code, message) => Object.assign(new Error(message), { code });

function readBody(req, limit = 1e6) {
  return new Promise((done, failed) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { failed(coded('too_large', 'Request too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return done(null);
      try { done(JSON.parse(raw)); } catch { failed(coded('bad_json', 'Malformed JSON')); }
    });
    req.on('error', failed);
  });
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

async function sendStatic(res, urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, rel === '' ? 'index.html' : rel);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    // Любой неизвестный путь отдаём приложению — навигация у него своя.
    try {
      const data = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
}

/* ---------- запуск ---------- */

const database = openDb(DB_FILE);
const seeded = seedIfEmpty(database);
const store = createStore(database);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (!path.startsWith('/api/')) return sendStatic(res, path);

  const authed = !PASSWORD || validToken(readCookie(req.headers.cookie, COOKIE));

  if (path === '/api/session') {
    return sendJson(res, 200, { authed, protected: Boolean(PASSWORD) });
  }

  if (path === '/api/login' && req.method === 'POST') {
    let body = null;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message, code: e.code }); }
    if (!PASSWORD) return sendJson(res, 200, { authed: true });
    if (!passwordMatches(body?.password)) {
      return sendJson(res, 401, { error: 'Wrong password', code: 'wrong_password' });
    }
    res.setHeader('set-cookie',
      `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
    return sendJson(res, 200, { authed: true });
  }

  if (path === '/api/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return sendJson(res, 200, { authed: false });
  }

  if (!authed) return sendJson(res, 401, { error: 'Authentication required', code: 'unauthorized' });

  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message, code: e.code }); }
  }

  let result;
  try {
    result = handleApi(store, { method: req.method, path, query: url.searchParams, body });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'Internal error', code: 'server' });
  }

  if (result.text !== undefined) {
    res.writeHead(result.status, {
      'content-type': result.type,
      ...(result.filename ? { 'content-disposition': `attachment; filename="${result.filename}"` } : {}),
    });
    return res.end(result.text);
  }
  return sendJson(res, result.status, result.body);
});

server.listen(PORT, HOST, () => {
  const s = stats(database);
  if (seeded) console.log(`Database created from data/seed.json: ${seeded} suppliers`);
  console.log(`Supplier Archive: http://localhost:${PORT}`);
  console.log(`  suppliers ${s.suppliers} (distributors ${s.distributors}, direct ${s.direct})`);
  console.log(`  brands ${s.brands}, links ${s.links}, contacts ${s.contacts}`);
  console.log(`  database: ${DB_FILE}`);
  if (!PASSWORD) {
    console.log('\n  WARNING: no password set — anyone with the link can open and edit the archive.');
    console.log('  Set ARCHIVE_PASSWORD before publishing it on the internet.');
  }
  if (PASSWORD && !process.env.ARCHIVE_SECRET) {
    console.log('\n  Hint: set ARCHIVE_SECRET, otherwise every restart signs everyone out.');
  }
});
