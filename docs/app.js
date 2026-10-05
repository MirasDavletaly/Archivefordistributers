// Архив поставщиков: роутер и экраны.
import { h, clear, toast, modal, confirmBox, highlight, debounce } from './ui.js';
import { api, isDemo, download } from './transport.js';
import { t, tError, getLang, setLang, kindLabel, statusLabel, statusClass } from './i18n.js';

const view = document.getElementById('view');
const gate = document.getElementById('gate');
const app = document.getElementById('app');

const state = {
  q: '',
  kind: '',
  stats: null,
  brandNames: [],     // для подсказок при добавлении бренда
};

/* ---------- маршрутизация ---------- */

function parseRoute() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}

const go = (hash) => { location.hash = hash; };

async function route() {
  const { parts, params } = parseRoute();
  try {
    if (parts[0] === 's' && parts[1]) return await viewSupplier(Number(parts[1]), params.get('edit') === '1');
    if (parts[0] === 'b' && parts[1]) return await viewBrand(Number(parts[1]));
    if (parts[0] === 'brands') return await viewBrands();
    if (!parts.length && params.has('q')) state.q = params.get('q');
    return viewSearch();
  } catch (err) {
    clear(view).append(h('div', { class: 'empty' },
      h('strong', { text: t('common.loadFailed') }),
      tError(err)));
  }
}

/* ---------- экран поиска ---------- */

function viewSearch() {
  const input = h('input', {
    type: 'search', id: 'q', placeholder: t('search.placeholder'),
    autocomplete: 'off', spellcheck: 'false', value: state.q,
  });
  const resultBox = h('div');
  const countLine = h('p', { class: 'result-count' });

  const chip = (label, kind) => h('button', {
    class: 'chip', 'aria-pressed': state.kind === kind ? 'true' : 'false',
    onclick: (e) => {
      state.kind = kind;
      e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      e.target.setAttribute('aria-pressed', 'true');
      run();
    },
  }, label);

  const run = async () => {
    const q = state.q;
    // Ссылку на поиск можно переслать, но перерисовку это не вызывает.
    history.replaceState(null, '', q ? `#/?q=${encodeURIComponent(q)}` : '#/');
    let data;
    try {
      data = await api(`/api/search?q=${encodeURIComponent(q)}&kind=${state.kind}&limit=80`);
    } catch (err) {
      clear(countLine).append(tError(err));
      return;
    }
    if (q !== state.q) return; // пришёл ответ на устаревший запрос

    const tokens = q.split(/\s+/).filter(Boolean);
    clear(resultBox);

    if (q && data.brands.length) resultBox.append(brandHits(data.brands, tokens));

    clear(countLine).append(q
      ? t('search.found', { n: data.total, capped: data.total >= 80 })
      : t('search.total', { n: data.total }));

    if (!data.suppliers.length) {
      resultBox.append(h('div', { class: 'empty' },
        h('strong', { text: t('search.emptyTitle') }),
        t('search.emptyHint')));
      return;
    }
    resultBox.append(h('div', { class: 'cards' }, data.suppliers.map((s) => supplierCard(s, tokens))));
  };

  input.addEventListener('input', debounce(() => { state.q = input.value; run(); }, 130));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { input.value = ''; state.q = ''; run(); }
  });

  clear(view).append(
    h('div', { class: 'search' },
      h('span', { class: 'icon' }, '⌕'),
      input,
      h('div', { class: 'tools' }, h('kbd', { text: '/' }))),
    h('div', { class: 'filters' },
      chip(t('search.all'), ''), chip(t('search.distributors'), 'distributor'), chip(t('search.direct'), 'direct')),
    countLine,
    resultBox,
  );

  input.focus();
  run();
}

function brandHits(brands, tokens) {
  return h('div', { class: 'brand-hits' },
    h('h2', { text: t(brands.length === 1 ? 'search.brandHitOne' : 'search.brandHitMany') }),
    brands.map((b) => h('div', { class: 'brand-hit' },
      h('a', { class: 'bname', href: `#/b/${b.id}` }, highlight(b.name, tokens)),
      h('span', { class: 'carriers' },
        t('search.carriedBy', { n: b.suppliers.length }),
        b.suppliers.map((s, i) => h('span', {},
          i > 0 ? ', ' : '',
          h('a', { href: `#/s/${s.id}` }, s.name))),
      ))),
  );
}

function supplierCard(s, tokens) {
  const shown = s.brands.slice(0, 10);
  const rest = s.brands.length - shown.length;

  return h('div', {
    class: 'card', onclick: (e) => { if (!e.target.closest('button')) go(`#/s/${s.id}`); },
  },
    h('div', { class: 'card-head' },
      h('span', { class: 'name' }, highlight(s.name, tokens)),
      s.kind === 'direct' && h('span', { class: 'badge badge-direct', text: t('card.direct') }),
      s.status && s.status !== 'active'
        && h('span', { class: `badge ${statusClass(s.status)}`, text: statusLabel(s.status) }),
      s.city && h('span', { class: 'meta' }, highlight([s.city, s.country].filter(Boolean).join(', '), tokens)),
      h('span', { style: 'flex:1' }),
      h('button', {
        class: 'btn btn-quiet btn-sm', title: t('card.editTitle'),
        onclick: () => go(`#/s/${s.id}?edit=1`),
      }, t('card.edit'))),

    s.brands.length
      ? h('div', { class: 'brand-tags' },
        shown.map((b) => h('span', { class: 'tag' }, highlight(b, tokens))),
        rest > 0 && h('span', { class: 'tag tag-more', text: t('card.more', { n: rest }) }))
      : h('div', { class: 'why' }, h('span', { class: 'label', text: t('search.noBrands') })),

    s.hits?.length
      ? h('div', { class: 'why' },
        h('span', { class: 'label', text: t('search.foundVia') }),
        s.hits.slice(0, 4).map((hit) => h('span', {}, highlight(hit.display, tokens))))
      : null,

    h('div', { class: 'why' },
      h('span', { class: 'label', text: t('card.counts', { brands: s.brandCount, contacts: s.contactCount }) })),
  );
}

/* ---------- карточка поставщика ---------- */

const supplierFormSpec = () => [
  { key: 'name', label: t('field.name'), wide: true },
  {
    key: 'kind',
    label: t('field.kind'),
    options: [['distributor', kindLabel('distributor')], ['direct', kindLabel('direct')]],
  },
  {
    key: 'status',
    label: t('field.status'),
    options: [['active', statusLabel('active')], ['reserve', statusLabel('reserve')], ['blacklist', statusLabel('blacklist')]],
  },
  { key: 'city', label: t('field.city') },
  { key: 'country', label: t('field.country') },
  { key: 'phone', label: t('field.phone') },
  { key: 'email', label: t('field.email') },
  { key: 'website', label: t('field.website'), wide: true },
  { key: 'terms', label: t('field.terms'), area: true, wide: true },
  { key: 'notes', label: t('field.notes'), area: true, wide: true },
];

const contactFormSpec = () => [
  { key: 'name', label: t('field.contactName') },
  { key: 'role', label: t('field.role') },
  { key: 'email', label: t('field.contactEmail') },
  { key: 'phone', label: t('field.phone') },
  { key: 'note', label: t('field.note'), area: true, wide: true },
];

function formFields(spec, data) {
  return spec.map((f) => {
    let control;
    if (f.options) {
      control = h('select', { name: f.key },
        f.options.map(([v, label]) => h('option', { value: v, selected: (data[f.key] || '') === v }, label)));
    } else if (f.area) {
      control = h('textarea', { name: f.key }, data[f.key] || '');
    } else {
      control = h('input', { name: f.key, value: data[f.key] || '' });
    }
    return h('div', { class: `field${f.wide ? ' wide' : ''}` }, h('label', { text: f.label }), control);
  });
}

const formValues = (form) => Object.fromEntries(
  [...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]),
);

async function viewSupplier(id, startInEdit) {
  const s = await api(`/api/suppliers/${id}`);
  await loadBrandNames();

  const container = h('div');
  const render = (editing) => {
    clear(container).append(
      h('div', { class: 'breadcrumbs' }, h('a', { href: '#/' }, t('detail.back'))),

      h('div', { class: 'detail-head' },
        h('h2', { text: s.name }),
        s.kind === 'direct' && h('span', { class: 'badge badge-direct', text: kindLabel('direct') }),
        s.status && h('span', { class: `badge ${statusClass(s.status)}`, text: statusLabel(s.status) }),
        h('span', { style: 'flex:1' }),
        !editing && h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', onclick: () => render(true) }, t('detail.edit')),
          h('button', { class: 'btn btn-danger', onclick: removeSupplier }, t('detail.delete')))),

      h('p', { class: 'detail-sub' },
        [kindLabel(s.kind), [s.city, s.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')),

      editing ? detailsForm() : detailsView(),
      brandsSection(),
      contactsSection(),
    );
  };

  const field = (label, value, node) => [
    h('dt', { text: label }),
    node || h('dd', { class: value ? '' : 'empty-val', text: value || t('detail.empty') }),
  ];

  const detailsView = () => h('div', { class: 'section' },
    h('div', { class: 'section-head' }, h('h3', { text: t('detail.details') })),
    h('dl', { class: 'kv' },
      field(t('field.kind'), kindLabel(s.kind)),
      field(t('field.city'), s.city),
      field(t('field.country'), s.country),
      field(t('field.phone'), s.phone, s.phone
        ? h('dd', {}, h('a', { href: `tel:${s.phone.replace(/[^+\d]/g, '')}` }, s.phone)) : null),
      field(t('field.email'), s.email, s.email
        ? h('dd', {}, h('a', { href: `mailto:${s.email}` }, s.email)) : null),
      field(t('field.website'), s.website, s.website
        ? h('dd', {}, h('a', {
          href: /^https?:/i.test(s.website) ? s.website : `https://${s.website}`,
          target: '_blank', rel: 'noopener',
        }, s.website)) : null),
      field(t('field.terms'), s.terms),
      field(t('field.notes'), s.notes),
      field(t('field.updated'), s.updated_at)),
  );

  const detailsForm = () => {
    const error = h('p', { class: 'form-error hidden' });
    const form = h('form', { class: 'form-grid' }, formFields(supplierFormSpec(), s));
    const showError = (message) => { error.textContent = message; error.classList.remove('hidden'); };
    const save = async () => {
      const values = formValues(form);
      if (!values.name) { showError(t('error.name_required')); return; }
      try {
        Object.assign(s, await api(`/api/suppliers/${id}`, { method: 'PATCH', body: values }));
        toast(t('common.saved'));
        render(false);
      } catch (err) { showError(tError(err)); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

    return h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', { text: t('detail.editing') })),
      form,
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', onclick: save }, t('detail.save')),
        h('button', { class: 'btn', onclick: () => render(false) }, t('detail.cancel')),
        error),
    );
  };

  /* бренды */
  const brandsSection = () => {
    const addInput = h('input', {
      list: 'brand-suggestions', placeholder: t('brands.namePlaceholder'), style: 'max-width:260px',
    });
    const add = async () => {
      const name = addInput.value.trim();
      if (!name) return;
      try {
        Object.assign(s, await api(`/api/suppliers/${id}/brands`, { method: 'POST', body: { name } }));
        addInput.value = '';
        await loadBrandNames(true);
        toast(t('brands.added', { name }));
        render(false);
      } catch (err) { toast(tError(err)); }
    };
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    return h('div', { class: 'section' },
      h('div', { class: 'section-head' }, h('h3', { text: t('brands.section', { n: s.brands.length }) })),
      h('div', { class: 'chips-edit' },
        s.brands.map((b) => h('span', { class: 'chip-brand' },
          h('a', { href: `#/b/${b.id}`, text: b.name }),
          h('button', {
            class: 'x', title: t('brands.remove', { name: b.name }),
            onclick: async () => {
              Object.assign(s, await api(`/api/suppliers/${id}/brands/${b.id}`, { method: 'DELETE' }));
              render(false);
            },
          }, '✕'))),
        !s.brands.length && h('span', { class: 'meta', text: t('brands.none') })),
      h('div', { class: 'form-actions' },
        addInput,
        h('button', { class: 'btn btn-sm', onclick: add }, t('brands.add')),
        h('datalist', { id: 'brand-suggestions' },
          state.brandNames.map((n) => h('option', { value: n })))),
    );
  };

  /* контакты */
  const contactsSection = () => h('div', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h3', { text: t('contacts.section', { n: s.contacts.length }) }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: () => contactForm(null) }, t('contacts.add'))),
    s.contacts.length
      ? h('div', { class: 'people' }, s.contacts.map((c) => h('div', { class: 'person' },
        h('div', { class: 'who' },
          h('div', { class: 'pname', text: c.name || t('contacts.unnamed') }),
          h('div', { class: 'plines' },
            c.role && h('span', {}, c.role, ' · '),
            c.email && h('a', { href: `mailto:${c.email}` }, c.email),
            c.email && c.phone && ' · ',
            c.phone && h('a', { href: `tel:${c.phone.replace(/[^+\d]/g, '')}` }, c.phone)),
          c.note && h('div', { class: 'plines', text: c.note })),
        h('div', { class: 'person-actions' },
          h('button', { class: 'btn btn-quiet btn-sm', onclick: () => contactForm(c) }, t('detail.edit')),
          h('button', {
            class: 'btn btn-quiet btn-sm btn-danger',
            onclick: async () => {
              const ok = await confirmBox(t('contacts.deleteTitle'), c.name || c.email || t('contacts.unnamed'),
                { confirmLabel: t('common.delete'), cancelLabel: t('common.cancel') });
              if (!ok) return;
              await api(`/api/contacts/${c.id}`, { method: 'DELETE' });
              s.contacts = s.contacts.filter((x) => x.id !== c.id);
              toast(t('contacts.deleted'));
              render(false);
            },
          }, t('detail.delete'))))))
      : h('div', { class: 'meta', text: t('contacts.none') }),
  );

  const contactForm = (contact) => {
    modal(contact ? t('contacts.edit') : t('contacts.new'), (close) => {
      const error = h('p', { class: 'form-error hidden' });
      const form = h('form', { class: 'form-grid' }, formFields(contactFormSpec(), contact || {}));
      const showError = (message) => { error.textContent = message; error.classList.remove('hidden'); };
      const save = async () => {
        const values = formValues(form);
        if (!values.name && !values.email && !values.phone) { showError(t('contacts.needOne')); return; }
        try {
          if (contact) {
            await api(`/api/contacts/${contact.id}`, { method: 'PATCH', body: values });
            Object.assign(contact, values);
          } else {
            Object.assign(s, await api(`/api/suppliers/${id}/contacts`, { method: 'POST', body: values }));
          }
          toast(t('common.saved'));
          close();
          render(false);
        } catch (err) { showError(tError(err)); }
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
      return h('div', {}, form,
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', onclick: save }, t('detail.save')),
          h('button', { class: 'btn', onclick: close }, t('detail.cancel')),
          error));
    }, { closeLabel: t('common.close') });
  };

  async function removeSupplier() {
    const ok = await confirmBox(t('supplier.deleteTitle'), t('supplier.deleteBody', { name: s.name }),
      { confirmLabel: t('common.delete'), cancelLabel: t('common.cancel') });
    if (!ok) return;
    await api(`/api/suppliers/${id}`, { method: 'DELETE' });
    await refreshStats();
    toast(t('supplier.deleted'));
    go('#/');
  }

  render(Boolean(startInEdit));
  clear(view).append(container);
}

/* ---------- бренд ---------- */

async function viewBrand(id) {
  const b = await api(`/api/brands/${id}`);
  const rename = () => {
    modal(t('brands.renameTitle'), (close) => {
      const error = h('p', { class: 'form-error hidden' });
      const input = h('input', { value: b.name });
      const save = async () => {
        try {
          const updated = await api(`/api/brands/${id}`, { method: 'PATCH', body: { name: input.value.trim() } });
          close();
          toast(t('brands.renamed'));
          if (updated.id !== id) go(`#/b/${updated.id}`); else viewBrand(id);
        } catch (err) { error.textContent = tError(err); error.classList.remove('hidden'); }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      return h('div', {},
        h('div', { class: 'field' }, h('label', { text: t('brands.nameLabel') }), input,
          h('span', { class: 'help', text: t('brands.mergeHint') })),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', onclick: save }, t('detail.save')),
          h('button', { class: 'btn', onclick: close }, t('detail.cancel')),
          error));
    }, { closeLabel: t('common.close') });
  };

  clear(view).append(
    h('div', { class: 'breadcrumbs' },
      h('a', { href: '#/' }, t('detail.backSearch')), ' · ', h('a', { href: '#/brands' }, t('detail.allBrands'))),
    h('div', { class: 'detail-head' },
      h('h2', { text: b.name }),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn', onclick: rename }, t('brands.rename'))),
    h('p', { class: 'detail-sub' },
      b.suppliers.length ? t('brands.carriers', { n: b.suppliers.length }) : t('brands.noCarriers')),
    h('div', { class: 'cards' },
      b.suppliers.map((s) => h('div', { class: 'card', onclick: () => go(`#/s/${s.id}`) },
        h('div', { class: 'card-head' },
          h('span', { class: 'name', text: s.name }),
          s.kind === 'direct' && h('span', { class: 'badge badge-direct', text: t('card.direct') }),
          s.city && h('span', { class: 'meta', text: s.city })),
        s.note && h('div', { class: 'why', text: s.note })))),
  );
}

/* ---------- все бренды ---------- */

async function viewBrands() {
  const { brands } = await api('/api/brands');
  const filter = h('input', {
    placeholder: t('brands.filter'), style: 'max-width:320px', autocomplete: 'off',
  });
  const tbody = h('tbody');

  const draw = () => {
    const needle = filter.value.trim().toLowerCase();
    const rows = brands.filter((b) => !needle || b.name.toLowerCase().includes(needle));
    // append принимает узлы по одному: массив он превратил бы в строку.
    clear(tbody).append(...rows.map((b) => h('tr', { onclick: () => go(`#/b/${b.id}`), style: 'cursor:pointer' },
      h('td', {}, h('a', { href: `#/b/${b.id}`, text: b.name })),
      h('td', { class: 'meta', text: String(b.suppliers) }))));
    if (!rows.length) {
      tbody.append(h('tr', {}, h('td', { colspan: '2', class: 'meta', text: t('brands.nothingFound') })));
    }
  };
  filter.addEventListener('input', draw);

  clear(view).append(
    h('div', { class: 'breadcrumbs' }, h('a', { href: '#/' }, t('detail.back'))),
    h('div', { class: 'detail-head' }, h('h2', { text: t('brands.title') }), h('span', { style: 'flex:1' })),
    h('p', { class: 'detail-sub', text: t('brands.inArchive', { n: brands.length }) }),
    h('div', { style: 'margin-bottom:14px' }, filter),
    h('table', { class: 'brand-table' },
      h('thead', {}, h('tr', {},
        h('th', { text: t('brands.colBrand') }),
        h('th', { text: t('brands.colSuppliers') }))),
      tbody),
  );
  draw();
}

/* ---------- добавление поставщика ---------- */

function addSupplierDialog() {
  modal(t('supplier.new'), (close) => {
    const error = h('p', { class: 'form-error hidden' });
    const form = h('form', { class: 'form-grid' },
      formFields(supplierFormSpec(), { kind: 'distributor', status: 'active' }));
    const showError = (message) => { error.textContent = message; error.classList.remove('hidden'); };
    const save = async () => {
      const values = formValues(form);
      if (!values.name) { showError(t('error.name_required')); return; }
      try {
        const created = await api('/api/suppliers', { method: 'POST', body: values });
        await refreshStats();
        close();
        toast(t('supplier.added'));
        go(`#/s/${created.id}`);
      } catch (err) { showError(tError(err)); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    return h('div', {}, form,
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', onclick: save }, t('detail.create')),
        h('button', { class: 'btn', onclick: close }, t('detail.cancel')),
        error));
  }, { closeLabel: t('common.close') });
}

/* ---------- общее состояние ---------- */

async function loadBrandNames(force = false) {
  if (state.brandNames.length && !force) return;
  try {
    const { brands } = await api('/api/brands');
    state.brandNames = brands.map((b) => b.name);
  } catch { /* подсказки не критичны */ }
}

async function refreshStats() {
  try {
    state.stats = await api('/api/stats');
  } catch { /* счётчики не критичны */ }
  drawStats();
}

function drawStats() {
  const s = state.stats;
  document.getElementById('counts').textContent = s ? t('app.counts', s) : '';
}

/* ---------- язык ---------- */

/** Проставляет подписи статической разметки и подписи кнопок языка. */
function applyStaticTexts() {
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  for (const id of ['language', 'gate-language']) {
    const button = document.getElementById(id);
    button.textContent = t('nav.language');
    button.title = t('nav.languageTitle');
  }
  if (isDemo()) drawDemoBanner();
}

/** Предупреждение в демо-версии: правки никуда не уходят. */
function drawDemoBanner() {
  const banner = document.getElementById('demo-banner');
  banner.classList.remove('hidden');
  clear(banner).append(
    h('span', { text: t('demo.notice') }),
    h('button', {
      class: 'btn btn-sm',
      onclick: async () => {
        const sure = await confirmBox(t('demo.resetTitle'), t('demo.resetBody'),
          { confirmLabel: t('demo.reset'), cancelLabel: t('common.cancel') });
        if (!sure) return;
        await api('/api/reset', { method: 'POST' });
        await refreshStats();
        toast(t('demo.resetDone'));
        route();
      },
    }, t('demo.reset')),
  );
}

function toggleLanguage() {
  setLang(getLang() === 'en' ? 'ru' : 'en');
  applyStaticTexts();
  drawStats();
  const error = document.getElementById('gate-error');
  if (!error.classList.contains('hidden')) error.classList.add('hidden');
  if (!app.classList.contains('hidden')) route();
}

/* ---------- вход ---------- */

function showGate(message) {
  app.classList.add('hidden');
  gate.classList.remove('hidden');
  const error = document.getElementById('gate-error');
  if (message) { error.textContent = message; error.classList.remove('hidden'); }
  document.getElementById('gate-password').focus();
}

async function start() {
  const session = await api('/api/session');
  if (!session.authed) { showGate(); return; }

  gate.classList.add('hidden');
  app.classList.remove('hidden');
  document.getElementById('logout').classList.toggle('hidden', !session.protected);

  await refreshStats();
  await route();
}

document.getElementById('gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('gate-password');
  try {
    await api('/api/login', { method: 'POST', body: { password: input.value } });
    document.getElementById('gate-error').classList.add('hidden');
    input.value = '';
    await start();
  } catch (err) { showGate(tError(err)); }
});

document.getElementById('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.hash = '#/';
  showGate();
});

document.getElementById('add-supplier').addEventListener('click', addSupplierDialog);

// Выгрузка собирается тем же вызовом API и в серверном, и в демо-режиме.
document.getElementById('export').addEventListener('click', async () => {
  try {
    const csv = await api(`/api/export.csv?lang=${getLang()}`);
    download(csv, 'supplier-archive.csv');
  } catch (err) { toast(tError(err)); }
});
document.getElementById('language').addEventListener('click', toggleLanguage);
document.getElementById('gate-language').addEventListener('click', toggleLanguage);

window.addEventListener('hashchange', route);
window.addEventListener('archive:unauthorized', () => showGate(t('gate.expired')));

// «/» ставит курсор в поиск, если не печатают в поле.
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    const input = document.getElementById('q');
    if (input) { e.preventDefault(); input.focus(); input.select(); }
  }
});

applyStaticTexts();
start();
