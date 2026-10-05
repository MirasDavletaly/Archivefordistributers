// Мелкие помощники: построение DOM, запросы к API, модальные окна, подсветка.
// Данные вставляются только текстом, через innerHTML ничего не проходит.

/**
 * Создаёт элемент. h('div', {class:'card', onclick:fn}, 'текст', childNode)
 * Значения null/false/undefined среди детей пропускаются.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(3)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

/** Запрос к API. Бросает Error с текстом из ответа. */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') window.dispatchEvent(new Event('archive:unauthorized'));
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.code = data?.code;          // код нужен, чтобы перевести сообщение на языке интерфейса
    throw err;
  }
  return data;
}

let toastTimer = null;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = h('div', { class: 'toast', text: message });
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 2200);
}

/**
 * Открывает модальное окно. Возвращает { close }.
 * content — функция, получающая close, чтобы форма могла закрыться сама.
 */
export function modal(title, content, { onClose, closeLabel = 'Close' } = {}) {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const box = h('div', { class: 'modal' },
    h('header', {},
      h('h2', { text: title }),
      h('button', { class: 'btn btn-quiet', onclick: close, 'aria-label': closeLabel }, '✕')),
    h('div', { class: 'body' }, content(close)));

  overlay.append(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  overlay.querySelector('input,textarea,select')?.focus();
  return { close };
}

/** Подтверждение действия. Возвращает Promise<boolean>. */
export function confirmBox(title, message, { confirmLabel, cancelLabel } = {}) {
  return new Promise((done) => {
    let answered = false;
    // Закрытие крестиком или Escape считается отказом.
    const finish = (value) => { if (!answered) { answered = true; done(value); } };
    modal(title, (close) => h('div', {},
      h('p', { text: message, style: 'margin:0 0 18px' }),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', onclick: () => { finish(true); close(); } }, confirmLabel),
        h('button', { class: 'btn', onclick: () => { finish(false); close(); } }, cancelLabel))),
    { onClose: () => finish(false), closeLabel: cancelLabel });
  });
}

const normalize = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');

/**
 * Возвращает фрагмент с подсвеченными вхождениями слов запроса.
 * Подсвечиваются только прямые вхождения — нечёткие совпадения не выделяем,
 * чтобы не красить половину текста.
 */
export function highlight(text, tokens) {
  const frag = document.createDocumentFragment();
  const value = String(text ?? '');
  const list = (tokens || []).filter((t) => t && t.length >= 2);
  if (!list.length) { frag.append(document.createTextNode(value)); return frag; }

  const hay = normalize(value);
  const marks = [];
  for (const token of list) {
    const needle = normalize(token);
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      marks.push([at, at + needle.length]);
      from = at + needle.length;
    }
  }
  if (!marks.length) { frag.append(document.createTextNode(value)); return frag; }

  marks.sort((a, b) => a[0] - b[0]);
  const merged = [marks[0]];
  for (const [start, end] of marks.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) frag.append(document.createTextNode(value.slice(cursor, start)));
    frag.append(h('mark', { text: value.slice(start, end) }));
    cursor = end;
  }
  if (cursor < value.length) frag.append(document.createTextNode(value.slice(cursor)));
  return frag;
}

export const debounce = (fn, ms = 120) => {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};
