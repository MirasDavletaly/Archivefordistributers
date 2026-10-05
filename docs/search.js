// Поиск по архиву: терпит опечатки, ищет сразу по поставщикам, брендам и контактам.
//
// Как считается: каждое слово запроса ищется во всех полях записи. Берётся
// лучшее совпадение по каждому слову, они складываются. Если какое-то слово
// не нашлось нигде — запись не выдаётся (логика «И», а не «ИЛИ»).

const WEIGHTS = {
  name: 10,
  brand: 6,
  contact_name: 4,
  contact_email: 4,
  city: 3,
  phone: 4,
  notes: 2,
};

const FUZZY_MIN = 0.5;       // ниже этого похожесть не считается совпадением
const FUZZY_PENALTY = 0.6;   // во сколько раз нечёткое совпадение слабее точного

export const normalize = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}@.+]+/gu, ' ')
  .trim()
  .replace(/\s{2,}/g, ' ');

export const tokenize = (q) => normalize(q).split(' ').filter(Boolean);

const digitsOf = (s) => String(s ?? '').replace(/\D+/g, '');

function trigrams(word) {
  const padded = `  ${word} `;
  const set = new Set();
  for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Расстояние Левенштейна с отсечением: если больше max, возвращает max + 1. */
export function levenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const allowedTypos = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

/** Насколько слово похоже на токен: 0 — не похоже, 1 — точное совпадение. */
export function similarity(token, word) {
  if (!token || !word) return 0;
  if (token === word) return 1;

  const max = allowedTypos(token.length);
  let byEdit = 0;
  if (max > 0) {
    const d = levenshtein(token, word, max);
    if (d <= max) byEdit = 1 - d / (token.length + 1);
  }
  const byTrigram = dice(trigrams(token), trigrams(word)) * 0.95;
  return Math.max(byEdit, byTrigram);
}

/**
 * Оценивает одно поле против одного токена.
 * @returns {number} 0..1.4 — качество совпадения
 */
function matchField(token, value) {
  if (!value) return 0;
  if (value === token) return 1.4;

  const words = value.split(' ');
  if (words.some((w) => w === token)) return 1.25;
  if (words.some((w) => w.startsWith(token))) return 1.15;
  if (value.includes(token)) return 1;

  let best = 0;
  for (const w of words) {
    const s = similarity(token, w);
    if (s > best) best = s;
  }
  // Длинные многословные значения сверяем ещё и целиком.
  if (words.length > 1) best = Math.max(best, similarity(token, value.replace(/ /g, '')));
  // Нечёткое совпадение всегда слабее точного вхождения, даже в поле с меньшим весом:
  // иначе «ptskz» найдёт PTS по похожести названия и не покажет, что совпала почта.
  return best >= FUZZY_MIN ? best * FUZZY_PENALTY : 0;
}

// Статус и вид хранятся кодами, а искать их хочется словами — и по-русски, и по-английски.
const STATUS_WORDS = {
  active: 'active активный',
  reserve: 'reserve резерв',
  blacklist: 'blacklist чёрный список',
};
const KIND_WORDS = {
  distributor: 'distributor дистрибьютор',
  direct: 'direct прямой поставщик',
};

/** Готовит записи к поиску: заранее нормализует все текстовые поля. */
export function buildIndex(suppliers) {
  return suppliers.map((s) => ({
    id: s.id,
    supplier: s,
    fields: [
      { kind: 'name', weight: WEIGHTS.name, value: normalize(s.name), display: s.name },
      { kind: 'city', weight: WEIGHTS.city, value: normalize([s.city, s.country].filter(Boolean).join(' ')), display: [s.city, s.country].filter(Boolean).join(', ') },
      { kind: 'notes', weight: WEIGHTS.notes, display: '',
        value: normalize([s.terms, s.notes, STATUS_WORDS[s.status] || s.status, KIND_WORDS[s.kind]].filter(Boolean).join(' ')) },
      { kind: 'phone', weight: WEIGHTS.phone, value: digitsOf(s.phone), display: s.phone, digits: true },
      { kind: 'contact_email', weight: WEIGHTS.contact_email, value: normalize(s.email), display: s.email },
      ...(s.brands || []).map((b) => ({ kind: 'brand', weight: WEIGHTS.brand, value: normalize(b.name), display: b.name, brandId: b.id })),
      ...(s.contacts || []).flatMap((c) => [
        c.name && { kind: 'contact_name', weight: WEIGHTS.contact_name, value: normalize(c.name), display: c.name, contactId: c.id },
        c.email && { kind: 'contact_email', weight: WEIGHTS.contact_email, value: normalize(c.email), display: c.email, contactId: c.id },
        c.phone && { kind: 'phone', weight: WEIGHTS.phone, value: digitsOf(c.phone), display: c.phone, contactId: c.id, digits: true },
      ].filter(Boolean)),
    ].filter((f) => f.value),
  }));
}

/**
 * Ищет по индексу.
 * @param {ReturnType<buildIndex>} index
 * @param {string} query
 * @param {{limit?: number, kind?: string}} [opts]
 * @returns {{id:number, score:number, supplier:object, hits:{kind:string,display:string}[]}[]}
 */
export function search(index, query, opts = {}) {
  const { limit = 50, kind = '' } = opts;
  const tokens = tokenize(query);
  const pool = kind ? index.filter((d) => d.supplier.kind === kind) : index;

  if (!tokens.length) {
    return pool
      .slice(0, limit)
      .map((d) => ({ id: d.id, score: 0, supplier: d.supplier, hits: [] }));
  }

  const results = [];
  for (const doc of pool) {
    let total = 0;
    const hits = new Map();
    let missed = false;

    for (const token of tokens) {
      const numeric = /^\d+$/.test(token);
      let bestScore = 0;
      let bestField = null;

      for (const f of doc.fields) {
        if (f.digits && !numeric) continue;
        const quality = f.digits
          ? (f.value.includes(token) ? 1.2 : 0)
          : matchField(token, f.value);
        if (!quality) continue;
        const score = quality * f.weight;
        if (score > bestScore) { bestScore = score; bestField = f; }
      }

      if (!bestScore) { missed = true; break; }
      total += bestScore;
      // Совпадение в названии показывать не нужно — его и так видно.
      if (bestField && bestField.kind !== 'name' && bestField.display) {
        hits.set(`${bestField.kind}:${bestField.display}`, { kind: bestField.kind, display: bestField.display });
      }
    }

    if (missed) continue;
    // Короткие названия при равном счёте показываем выше: точнее попадание.
    const score = total - Math.min(doc.fields.length, 60) * 0.004;
    results.push({ id: doc.id, score, supplier: doc.supplier, hits: [...hits.values()] });
  }

  results.sort((a, b) => b.score - a.score || a.supplier.name.localeCompare(b.supplier.name, 'ru'));
  return results.slice(0, limit);
}

/**
 * Бренды, подходящие под запрос, с числом поставщиков у каждого.
 * Нужно для ответа на вопрос «кто возит бренд X».
 */
export function searchBrands(index, query, limit = 12) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const byBrand = new Map();
  for (const doc of index) {
    for (const f of doc.fields) {
      if (f.kind !== 'brand') continue;
      let total = 0;
      for (const t of tokens) {
        const q = matchField(t, f.value);
        if (!q) { total = 0; break; }
        total += q;
      }
      if (!total) continue;
      const key = f.brandId ?? f.display.toUpperCase();
      const entry = byBrand.get(key) || { id: f.brandId, name: f.display, score: total, suppliers: [] };
      entry.score = Math.max(entry.score, total);
      entry.suppliers.push({ id: doc.supplier.id, name: doc.supplier.name, kind: doc.supplier.kind });
      byBrand.set(key, entry);
    }
  }

  return [...byBrand.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit);
}
