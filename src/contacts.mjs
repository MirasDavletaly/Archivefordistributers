// Разбор колонки «DIRECT CONTACTS» из исходного Excel.
// В одной ячейке встречаются форматы:
//   okan@nako-kz.com
//   Okan Arslan <okan@nako-kz.com>
//   Caterina Tassinari -\nsales@centerkit.net      (имя строкой выше)
//   Grant Stott - gstott@hubbell.com
//   'Лавренко Ира' <a@b.kz>; 'Иванова Елена' <c@d.kz>
//   <azamat@ibemo-kz.com>
//   Dmitriy, KAZAKOV [ANCON]\ncmd@ancon.kz

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Убирает кавычки, угловые скобки и висящие разделители вокруг имени. */
export function cleanName(raw) {
  let s = String(raw || '').replace(/[<>]/g, ' ').trim();
  // Кавычки и разделители могут чередоваться («Имя» ,) — снимаем, пока снимается.
  for (let prev = null; prev !== s; ) {
    prev = s;
    s = s
      .replace(/^['"`«]+/, '').replace(/['"`»]+$/, '')
      .replace(/^[\s,;:–—-]+/, '').replace(/[\s,;:–—-]+$/, '');
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Разбирает ячейку в список контактов.
 * @param {string} cell
 * @returns {{name: string, email: string}[]}
 */
export function parseContactCell(cell) {
  const out = [];
  if (!cell) return out;

  const pieces = String(cell)
    .replace(/\r\n/g, '\n')
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let pendingName = '';

  for (const piece of pieces) {
    const emails = piece.match(EMAIL) || [];

    if (emails.length === 0) {
      // Строка без почты — это имя, которое относится к следующей строке.
      const name = cleanName(piece);
      if (name) pendingName = name;
      continue;
    }

    const head = cleanName(piece.slice(0, piece.indexOf(emails[0])));
    const name = head || pendingName;
    pendingName = '';

    emails.forEach((email, i) => {
      const e = email.toLowerCase();
      if (out.some((c) => c.email === e)) return;
      out.push({ name: i === 0 ? name : '', email: e });
    });
  }

  // Имя без почты тоже сохраняем — лучше, чем потерять контакт.
  if (pendingName && out.length === 0) out.push({ name: pendingName, email: '' });

  return out;
}
