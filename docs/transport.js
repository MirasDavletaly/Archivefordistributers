// Единая точка обращения к API.
//
// В обычном режиме запросы уходят на сервер. В демо-версии (GitHub Pages, где
// сервера нет) сюда подставляется локальный обработчик, и приложение работает
// точно так же, просто данные лежат в браузере.

let localBackend = null;

/** Включает демо-режим: все вызовы api() пойдут в этот обработчик. */
export function useLocalBackend(handler) {
  localBackend = handler;
}

export const isDemo = () => localBackend !== null;

/**
 * Запрос к API. Возвращает разобранный JSON, а для CSV — строку.
 * Бросает Error с полем code, чтобы интерфейс перевёл сообщение.
 */
export async function api(path, { method = 'GET', body } = {}) {
  if (localBackend) {
    const result = await localBackend(path, { method, body });
    if (result.status >= 400) {
      const err = new Error(result.body?.error || `HTTP ${result.status}`);
      err.code = result.body?.code;
      throw err;
    }
    return result.text !== undefined ? result.text : result.body;
  }

  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) {
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text;
  }

  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') window.dispatchEvent(new Event('archive:unauthorized'));
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.code = data?.code;
    throw err;
  }
  return data;
}

/** Отдаёт пользователю файл, собранный на клиенте. */
export function download(text, filename, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
