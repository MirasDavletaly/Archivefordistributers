// REST API архива. Чистые функции: получают разобранный запрос, отдают объект ответа.
import * as db from './db.mjs';
import { buildIndex, search, searchBrands } from './search.mjs';

const json = (body, status = 200) => ({ status, body, type: 'application/json' });
// Код нужен клиенту, чтобы показать сообщение на языке интерфейса; message — для прямых вызовов API.
const fail = (status, code, message) => json({ error: message, code }, status);

/** Держит поисковый индекс и пересобирает его после изменений. */
export function createStore(database) {
  let index = null;
  return {
    db: database,
    get index() {
      if (!index) index = buildIndex(db.allSuppliers(database));
      return index;
    },
    invalidate() { index = null; },
  };
}

// Подписи для выгрузки: CSV отдаётся на языке, который попросил интерфейс.
const CSV_LABELS = {
  en: {
    head: ['Supplier', 'Type', 'City', 'Country', 'Website', 'Phone', 'Email', 'Terms', 'Status', 'Brands', 'Contacts'],
    kind: { distributor: 'distributor', direct: 'direct supplier' },
    status: { active: 'active', reserve: 'reserve', blacklist: 'blacklist' },
  },
  ru: {
    head: ['Поставщик', 'Вид', 'Город', 'Страна', 'Сайт', 'Телефон', 'Почта', 'Условия', 'Статус', 'Бренды', 'Контакты'],
    kind: { distributor: 'дистрибьютор', direct: 'прямой поставщик' },
    status: { active: 'активный', reserve: 'резерв', blacklist: 'чёрный список' },
  },
};

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv(store, lang = 'en') {
  const L = CSV_LABELS[lang] || CSV_LABELS.en;
  const rows = [L.head];
  for (const s of db.allSuppliers(store.db)) {
    rows.push([
      s.name,
      L.kind[s.kind] || s.kind,
      s.city, s.country, s.website, s.phone, s.email, s.terms, L.status[s.status] || s.status,
      s.brands.map((b) => b.name).join(', '),
      s.contacts.map((c) => [c.name, c.role, c.email, c.phone].filter(Boolean).join(' ')).join('; '),
    ]);
  }
  // BOM, чтобы Excel не ломал кириллицу.
  return { status: 200, type: 'text/csv; charset=utf-8', text: '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n'), filename: 'archive.csv' };
}

const shallow = (s) => ({
  id: s.id, name: s.name, kind: s.kind, city: s.city, country: s.country,
  status: s.status, website: s.website, phone: s.phone, email: s.email,
  brands: s.brands.map((b) => b.name),
  brandCount: s.brands.length,
  contactCount: s.contacts.length,
});

/**
 * Обрабатывает запрос к API.
 * @param {object} store результат createStore
 * @param {{method: string, path: string, query: URLSearchParams, body: any}} req
 */
export function handleApi(store, { method, path, query, body }) {
  const d = store.db;
  const seg = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [root, a, b, c] = seg;
  const after = (v) => { store.invalidate(); return v; };

  try {
    /* --- поиск --- */
    if (root === 'search' && method === 'GET') {
      const q = query.get('q') || '';
      const kind = query.get('kind') || '';
      const limit = Math.min(Number(query.get('limit')) || 60, 300);
      const found = search(store.index, q, { limit, kind });
      return json({
        query: q,
        total: found.length,
        suppliers: found.map((r) => ({ ...shallow(r.supplier), hits: r.hits, score: Math.round(r.score * 100) / 100 })),
        brands: searchBrands(store.index, q),
      });
    }

    if (root === 'stats' && method === 'GET') return json(db.stats(d));

    if (root === 'export.csv' && method === 'GET') return exportCsv(store, query.get('lang') === 'ru' ? 'ru' : 'en');

    /* --- поставщики --- */
    if (root === 'suppliers') {
      if (!a) {
        if (method === 'GET') return json({ suppliers: db.allSuppliers(d).map(shallow) });
        if (method === 'POST') {
          const id = after(db.createSupplier(d, body || {}));
          return json(db.getSupplier(d, id), 201);
        }
      }

      const id = Number(a);
      if (!Number.isInteger(id)) return fail(404, 'not_found', 'Not found');

      if (!b) {
        if (method === 'GET') {
          const s = db.getSupplier(d, id);
          return s ? json(s) : fail(404, 'not_found', 'Supplier not found');
        }
        if (method === 'PATCH' || method === 'PUT') {
          if (!db.getSupplier(d, id)) return fail(404, 'not_found', 'Supplier not found');
          after(db.updateSupplier(d, id, body || {}));
          return json(db.getSupplier(d, id));
        }
        if (method === 'DELETE') {
          const ok = after(db.deleteSupplier(d, id));
          return ok ? json({ deleted: true }) : fail(404, 'not_found', 'Supplier not found');
        }
      }

      if (b === 'brands') {
        if (method === 'POST') {
          if (!body?.name?.trim()) return fail(400, 'brand_name_required', 'Brand name is required');
          after(db.attachBrand(d, id, body.name, body.note || ''));
          return json(db.getSupplier(d, id), 201);
        }
        if (method === 'DELETE' && c) {
          after(db.detachBrand(d, id, Number(c)));
          return json(db.getSupplier(d, id));
        }
      }

      if (b === 'contacts' && method === 'POST') {
        after(db.createContact(d, id, body || {}));
        return json(db.getSupplier(d, id), 201);
      }
    }

    /* --- контакты --- */
    if (root === 'contacts' && a) {
      const id = Number(a);
      if (method === 'PATCH' || method === 'PUT') {
        const ok = after(db.updateContact(d, id, body || {}));
        return ok ? json({ updated: true }) : fail(404, 'not_found', 'Contact not found');
      }
      if (method === 'DELETE') {
        const ok = after(db.deleteContact(d, id));
        return ok ? json({ deleted: true }) : fail(404, 'not_found', 'Contact not found');
      }
    }

    /* --- бренды --- */
    if (root === 'brands') {
      if (!a && method === 'GET') return json({ brands: db.listBrands(d) });
      const id = Number(a);
      if (Number.isInteger(id)) {
        if (method === 'GET') {
          const brand = db.getBrand(d, id);
          return brand ? json(brand) : fail(404, 'not_found', 'Brand not found');
        }
        if (method === 'PATCH' || method === 'PUT') {
          if (!body?.name?.trim()) return fail(400, 'brand_name_required', 'Brand name is required');
          const newId = after(db.renameBrand(d, id, body.name));
          return json(db.getBrand(d, newId));
        }
      }
    }

    return fail(404, 'unknown_route', 'Unknown API route');
  } catch (err) {
    return fail(400, err.code || 'bad_request', err.message || 'Bad request');
  }
}
