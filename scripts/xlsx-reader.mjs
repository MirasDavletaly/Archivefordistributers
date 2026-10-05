// Минимальный читатель .xlsx без внешних зависимостей.
// Распаковывает zip через node:zlib и достаёт значения ячеек листа.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Читает zip-архив в map { имя файла -> Buffer }. */
function unzip(buf) {
  // Ищем End of Central Directory с конца файла.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Это не zip/xlsx: не найден End of Central Directory');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Повреждён центральный каталог zip');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // Длины в локальном заголовке могут отличаться — читаем их оттуда.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeEntities = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

/** Склеивает текст из <si> общей таблицы строк, сохраняя переводы строк. */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let text = '';
    const inner = m[1];
    const partRe = /<(t|br)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/\1>)/g;
    let p;
    while ((p = partRe.exec(inner))) {
      if (p[1] === 'br') text += '\n';
      else text += decodeEntities(p[2] ?? '');
    }
    out.push(text);
  }
  return out;
}

const colToNum = (letters) => {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

/**
 * Читает первый лист книги.
 * @returns {{rows: Map<number, Map<number,string>>, maxRow: number}}
 *   rows: номер строки -> (номер колонки -> значение). Пустые ячейки отсутствуют.
 */
export function readSheet(path) {
  const files = unzip(readFileSync(path));
  const pick = (re) => [...files.keys()].find((k) => re.test(k));
  const sheetName = pick(/^xl\/worksheets\/sheet1\.xml$/) || pick(/^xl\/worksheets\/.*\.xml$/);
  if (!sheetName) throw new Error('В книге не найден лист');

  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8'));
  const xml = files.get(sheetName).toString('utf8');

  const rows = new Map();
  let maxRow = 0;
  const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let c;
  while ((c = cellRe.exec(xml))) {
    const attrs = c[1];
    const body = c[2] ?? '';
    const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const type = /t="([^"]+)"/.exec(attrs)?.[1];

    let value = '';
    if (type === 's') {
      const idx = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      value = idx != null ? (shared[+idx] ?? '') : '';
    } else if (type === 'inlineStr') {
      const parts = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
      value = parts.map((p) => decodeEntities(p[1])).join('');
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      value = v != null ? decodeEntities(v) : '';
    }

    value = value.replace(/\r\n/g, '\n').trim();
    if (!value) continue;

    const row = +ref[2];
    const col = colToNum(ref[1]);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row).set(col, value);
    if (row > maxRow) maxRow = row;
  }
  return { rows, maxRow };
}
