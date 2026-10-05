// Демо-версия без сервера: те же маршруты API, но данные лежат в браузере.
// Используется на GitHub Pages, где запустить Node нельзя.
//
// Правила совпадают с серверными (src/db.mjs и src/api.mjs): бренды уникальны
// без учёта регистра, бренд без поставщиков удаляется, удаление поставщика
// уносит его контакты и связи. Набор тестов один и тот же для обеих реализаций.

import { buildIndex, search, searchBrands } from './search.js';

const STORAGE_KEY = 'archive.demo.v1';

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

const SUPPLIER_FIELDS = ['name', 'kind', 'city', 'country', 'website', 'phone', 'email', 'terms', 'notes', 'status'];
const CONTACT_FIELDS = ['name', 'role', 'email', 'phone', 'note', 'sort'];

const ok = (body, status = 200) => ({ status, body });
const err = (status, code, error) => ({ status, body: { error, code } });
const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Создаёт демо-хранилище.
 * @param {object} seed данные вида { suppliers, brands, links, contacts }
 * @param {{persist?: boolean, storage?: Storage}} [options]
 */
export function createDemoStore(seed, { persist = true, storage } = {}) {
  const store = typeof storage !== 'undefined' ? storage
    : (typeof localStorage !== 'undefined' ? localStorage : null);

  const blank = () => ({
    suppliers: structuredClone(seed.suppliers),
    brands: structuredClone(seed.brands),
    links: structuredClone(seed.links),
    contacts: structuredClone(seed.contacts),
  });

  let data = blank();
  if (persist && store) {
    try {
      const saved = store.getItem(STORAGE_KEY);
      if (saved) data = JSON.parse(saved);
    } catch { /* повреждённое хранилище — просто начинаем с исходных данных */ }
  }

  let index = null;
  const save = () => {
    index = null;
    if (!persist || !store) return;
    try { store.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* переполнено — работаем в памяти */ }
  };

  const nextId = (rows) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const brandsOf = (supplierId) => data.links
    .filter((l) => l.supplier_id === supplierId)
    .map((l) => ({ ...data.brands.find((b) => b.id === l.brand_id), note: l.note }))
    .filter((b) => b.id !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const contactsOf = (supplierId) => data.contacts
    .filter((c) => c.supplier_id === supplierId)
    .sort((a, b) => a.sort - b.sort || a.id - b.id);

  const full = (s) => ({ ...s, brands: brandsOf(s.id), contacts: contactsOf(s.id) });
  const allFull = () => [...data.suppliers]
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(full);

  const getIndex = () => {
    if (!index) index = buildIndex(allFull());
    return index;
  };

  const shallow = (s) => {
    const brands = brandsOf(s.id);
    return {
      id: s.id, name: s.name, kind: s.kind, city: s.city, country: s.country,
      status: s.status, website: s.website, phone: s.phone, email: s.email,
      brands: brands.map((b) => b.name),
      brandCount: brands.length,
      contactCount: contactsOf(s.id).length,
    };
  };

  const pick = (fields, src) => {
    const out = {};
    for (const f of fields) if (src?.[f] !== undefined && src[f] !== null) out[f] = src[f];
    return out;
  };

  const upsertBrand = (name) => {
    const clean = String(name).trim();
    const key = clean.toUpperCase();
    const found = data.brands.find((b) => b.name_key === key);
    if (found) return found;
    const brand = { id: nextId(data.brands), name: clean, name_key: key };
    data.brands.push(brand);
    return brand;
  };

  const dropOrphanBrand = (brandId) => {
    if (data.links.some((l) => l.brand_id === brandId)) return;
    data.brands = data.brands.filter((b) => b.id !== brandId);
  };

  function exportCsv(lang) {
    const L = CSV_LABELS[lang] || CSV_LABELS.en;
    const rows = [L.head];
    for (const s of allFull()) {
      rows.push([
        s.name,
        L.kind[s.kind] || s.kind,
        s.city, s.country, s.website, s.phone, s.email, s.terms, L.status[s.status] || s.status,
        s.brands.map((b) => b.name).join(', '),
        s.contacts.map((c) => [c.name, c.role, c.email, c.phone].filter(Boolean).join(' ')).join('; '),
      ]);
    }
    return { status: 200, text: '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') };
  }

  /** Возвращает данные к исходному состоянию. */
  function reset() {
    data = blank();
    save();
  }

  /** Обработчик запросов — совпадает по форме с серверным API. */
  function request(path, { method = 'GET', body } = {}) {
    const [rawPath, qs] = String(path).split('?');
    const query = new URLSearchParams(qs || '');
    const seg = rawPath.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const [root, a, b, c] = seg;

    if (root === 'session') return ok({ authed: true, protected: false, demo: true });
    if (root === 'login' || root === 'logout') return ok({ authed: true });

    if (root === 'search' && method === 'GET') {
      const q = query.get('q') || '';
      const kind = query.get('kind') || '';
      const limit = Math.min(Number(query.get('limit')) || 60, 300);
      const found = search(getIndex(), q, { limit, kind });
      return ok({
        query: q,
        total: found.length,
        suppliers: found.map((r) => ({
          ...shallow(r.supplier), hits: r.hits, score: Math.round(r.score * 100) / 100,
        })),
        brands: searchBrands(getIndex(), q),
      });
    }

    if (root === 'stats' && method === 'GET') {
      return ok({
        suppliers: data.suppliers.length,
        distributors: data.suppliers.filter((s) => s.kind === 'distributor').length,
        direct: data.suppliers.filter((s) => s.kind === 'direct').length,
        brands: data.brands.length,
        links: data.links.length,
        contacts: data.contacts.length,
        demo: true,
      });
    }

    if (root === 'export.csv' && method === 'GET') {
      return exportCsv(query.get('lang') === 'ru' ? 'ru' : 'en');
    }

    if (root === 'reset' && method === 'POST') { reset(); return ok({ reset: true }); }

    if (root === 'suppliers') {
      if (!a) {
        if (method === 'GET') return ok({ suppliers: allFull().map(shallow) });
        if (method === 'POST') {
          const row = { name: '', kind: 'distributor', status: 'active', ...pick(SUPPLIER_FIELDS, body) };
          if (!String(row.name).trim()) return err(400, 'name_required', 'Name is required');
          const supplier = {
            id: nextId(data.suppliers),
            city: '', country: '', website: '', phone: '', email: '', terms: '', notes: '',
            ...row,
            created_at: nowStamp(), updated_at: nowStamp(),
          };
          data.suppliers.push(supplier);
          save();
          return ok(full(supplier), 201);
        }
      }

      const id = Number(a);
      const supplier = data.suppliers.find((s) => s.id === id);

      if (!b) {
        if (!supplier) return err(404, 'not_found', 'Supplier not found');
        if (method === 'GET') return ok(full(supplier));
        if (method === 'PATCH' || method === 'PUT') {
          const row = pick(SUPPLIER_FIELDS, body);
          if ('name' in row && !String(row.name).trim()) return err(400, 'name_required', 'Name is required');
          Object.assign(supplier, row, { updated_at: nowStamp() });
          save();
          return ok(full(supplier));
        }
        if (method === 'DELETE') {
          data.suppliers = data.suppliers.filter((s) => s.id !== id);
          data.contacts = data.contacts.filter((x) => x.supplier_id !== id);
          const touched = data.links.filter((l) => l.supplier_id === id).map((l) => l.brand_id);
          data.links = data.links.filter((l) => l.supplier_id !== id);
          touched.forEach(dropOrphanBrand);
          save();
          return ok({ deleted: true });
        }
      }

      if (!supplier) return err(404, 'not_found', 'Supplier not found');

      if (b === 'brands') {
        if (method === 'POST') {
          if (!body?.name?.trim()) return err(400, 'brand_name_required', 'Brand name is required');
          const brand = upsertBrand(body.name);
          if (!data.links.some((l) => l.supplier_id === id && l.brand_id === brand.id)) {
            data.links.push({ supplier_id: id, brand_id: brand.id, note: body.note || '' });
          }
          save();
          return ok(full(supplier), 201);
        }
        if (method === 'DELETE' && c) {
          const brandId = Number(c);
          data.links = data.links.filter((l) => !(l.supplier_id === id && l.brand_id === brandId));
          dropOrphanBrand(brandId);
          save();
          return ok(full(supplier));
        }
      }

      if (b === 'contacts' && method === 'POST') {
        data.contacts.push({
          id: nextId(data.contacts),
          supplier_id: id,
          name: '', role: '', email: '', phone: '', note: '', sort: 0,
          ...pick(CONTACT_FIELDS, body),
        });
        save();
        return ok(full(supplier), 201);
      }
    }

    if (root === 'contacts' && a) {
      const id = Number(a);
      const contact = data.contacts.find((x) => x.id === id);
      if (!contact) return err(404, 'not_found', 'Contact not found');
      if (method === 'PATCH' || method === 'PUT') {
        Object.assign(contact, pick(CONTACT_FIELDS, body));
        save();
        return ok({ updated: true });
      }
      if (method === 'DELETE') {
        data.contacts = data.contacts.filter((x) => x.id !== id);
        save();
        return ok({ deleted: true });
      }
    }

    if (root === 'brands') {
      if (!a && method === 'GET') {
        return ok({
          brands: [...data.brands]
            .sort((x, y) => x.name.localeCompare(y.name, 'ru'))
            .map((brand) => ({
              id: brand.id,
              name: brand.name,
              suppliers: data.links.filter((l) => l.brand_id === brand.id).length,
            })),
        });
      }
      const id = Number(a);
      const brand = data.brands.find((x) => x.id === id);
      if (!brand) return err(404, 'not_found', 'Brand not found');

      if (method === 'GET') {
        return ok({
          ...brand,
          suppliers: data.links
            .filter((l) => l.brand_id === id)
            .map((l) => {
              const s = data.suppliers.find((x) => x.id === l.supplier_id);
              return s && { id: s.id, name: s.name, kind: s.kind, city: s.city, note: l.note };
            })
            .filter(Boolean)
            .sort((x, y) => x.name.localeCompare(y.name, 'ru')),
        });
      }

      if (method === 'PATCH' || method === 'PUT') {
        const clean = String(body?.name || '').trim();
        if (!clean) return err(400, 'brand_name_required', 'Brand name is required');
        const key = clean.toUpperCase();
        const clash = data.brands.find((x) => x.name_key === key && x.id !== id);
        if (clash) {
          // Такой бренд уже есть — переносим связи и убираем дубль.
          for (const link of data.links.filter((l) => l.brand_id === id)) {
            if (!data.links.some((l) => l.brand_id === clash.id && l.supplier_id === link.supplier_id)) {
              link.brand_id = clash.id;
            }
          }
          data.links = data.links.filter((l) => l.brand_id !== id);
          data.brands = data.brands.filter((x) => x.id !== id);
          save();
          return request(`/api/brands/${clash.id}`);
        }
        brand.name = clean;
        brand.name_key = key;
        save();
        return request(`/api/brands/${id}`);
      }
    }

    return err(404, 'unknown_route', 'Unknown API route');
  }

  return { request, reset };
}
