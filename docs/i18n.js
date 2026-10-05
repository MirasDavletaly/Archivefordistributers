// Переводы интерфейса. Основной язык — английский, русский переключается в шапке.
// Значение словаря — строка или функция от параметров.

const DICT = {
  en: {
    'app.title': 'Supplier Archive',
    'app.counts': ({ suppliers, brands, contacts }) =>
      `${suppliers} suppliers · ${brands} brands · ${contacts} contacts`,

    'gate.prompt': 'Enter the access password',
    'gate.password': 'Password',
    'gate.submit': 'Sign in',
    'gate.expired': 'Your session expired, please sign in again',

    'nav.add': '+ Add supplier',
    'nav.brands': 'Brands',
    'nav.export': 'Export CSV',
    'nav.logout': 'Sign out',
    'nav.language': 'Русский',
    'nav.languageTitle': 'Switch to Russian',

    'search.placeholder': 'Search: supplier, brand, contact, email, phone…',
    'search.all': 'All',
    'search.distributors': 'Distributors',
    'search.direct': 'Direct suppliers',
    'search.total': ({ n }) => `Total suppliers: ${n}`,
    'search.found': ({ n, capped }) => `Found: ${n}${capped ? ' (first 80 shown)' : ''}`,
    'search.emptyTitle': 'Nothing found',
    'search.emptyHint': 'Search tolerates typos but does not translate between languages — try another word or part of a name.',
    'search.brandHitOne': 'Brand match',
    'search.brandHitMany': 'Brand matches',
    'search.carriedBy': ({ n }) => (n === 1 ? 'carried by: ' : `carried by (${n}): `),
    'search.foundVia': 'matched on:',
    'search.noBrands': 'no brands yet',

    'card.direct': 'direct',
    'card.edit': 'Edit',
    'card.editTitle': 'Open and edit',
    'card.more': ({ n }) => `${n} more`,
    'card.counts': ({ brands, contacts }) =>
      `${brands} ${brands === 1 ? 'brand' : 'brands'} · ${contacts} ${contacts === 1 ? 'contact' : 'contacts'}`,

    'detail.back': '← Back to search',
    'detail.backSearch': '← Search',
    'detail.allBrands': 'All brands',
    'detail.edit': 'Edit',
    'detail.delete': 'Delete',
    'detail.details': 'Details',
    'detail.editing': 'Editing',
    'detail.save': 'Save',
    'detail.cancel': 'Cancel',
    'detail.create': 'Create',
    'detail.empty': '—',

    'field.name': 'Name',
    'field.kind': 'Type',
    'field.status': 'Status',
    'field.city': 'City',
    'field.country': 'Country',
    'field.phone': 'Phone',
    'field.email': 'General email',
    'field.website': 'Website',
    'field.terms': 'Terms, payment, lead time',
    'field.notes': 'Notes',
    'field.updated': 'Updated',
    'field.contactName': 'Name',
    'field.role': 'Role',
    'field.contactEmail': 'Email',
    'field.note': 'Note',

    'kind.distributor': 'distributor',
    'kind.direct': 'direct supplier',
    'status.active': 'active',
    'status.reserve': 'reserve',
    'status.blacklist': 'blacklist',

    'brands.section': ({ n }) => `Brands — ${n}`,
    'brands.add': '+ Add brand',
    'brands.namePlaceholder': 'Brand name',
    'brands.none': 'nothing linked yet',
    'brands.remove': ({ name }) => `Remove ${name}`,
    'brands.added': ({ name }) => `Brand “${name}” added`,
    'brands.title': 'Brands',
    'brands.inArchive': ({ n }) => `${n} ${n === 1 ? 'brand' : 'brands'} in the archive`,
    'brands.filter': 'Filter by brand name',
    'brands.colBrand': 'Brand',
    'brands.colSuppliers': 'Suppliers',
    'brands.nothingFound': 'Nothing found',
    'brands.rename': 'Rename',
    'brands.renameTitle': 'Rename brand',
    'brands.nameLabel': 'Brand name',
    'brands.mergeHint': 'If a brand with this name already exists, the records will be merged.',
    'brands.renamed': 'Brand renamed',
    'brands.carriers': ({ n }) =>
      `${n} ${n === 1 ? 'supplier carries' : 'suppliers carry'} this brand`,
    'brands.noCarriers': 'This brand is not linked to anyone',

    'contacts.section': ({ n }) => `Contacts — ${n}`,
    'contacts.add': '+ Add contact',
    'contacts.none': 'No contacts yet.',
    'contacts.unnamed': '(no name)',
    'contacts.new': 'New contact',
    'contacts.edit': 'Edit contact',
    'contacts.deleteTitle': 'Delete contact?',
    'contacts.deleted': 'Contact deleted',
    'contacts.needOne': 'Fill in at least a name, email or phone',

    'supplier.new': 'New supplier',
    'supplier.added': 'Supplier added — now link brands and contacts',
    'supplier.deleteTitle': 'Delete supplier?',
    'supplier.deleteBody': ({ name }) =>
      `“${name}” will be deleted together with its contacts and brand links. This cannot be undone.`,
    'supplier.deleted': 'Supplier deleted',

    'demo.notice': 'Demo version: the data is real, but your changes are saved only in this browser and are visible to nobody else.',
    'demo.reset': 'Reset demo',
    'demo.resetTitle': 'Reset the demo?',
    'demo.resetBody': 'All changes made in this browser will be discarded and the original data restored.',
    'demo.resetDone': 'Demo data restored',

    'common.saved': 'Saved',
    'common.delete': 'Delete',
    'common.cancel': 'Cancel',
    'common.loadFailed': 'Could not load',
    'common.close': 'Close',

    'error.name_required': 'Name is required',
    'error.brand_name_required': 'Enter a brand name',
    'error.not_found': 'Not found',
    'error.unknown_route': 'Unknown API route',
    'error.wrong_password': 'Wrong password',
    'error.unauthorized': 'Please sign in',
    'error.bad_json': 'Malformed JSON',
    'error.too_large': 'Request too large',
    'error.server': 'Server error',
  },

  ru: {
    'app.title': 'Архив поставщиков',
    'app.counts': ({ suppliers, brands, contacts }) =>
      `${suppliers} поставщиков · ${brands} брендов · ${contacts} контактов`,

    'gate.prompt': 'Введите пароль доступа',
    'gate.password': 'Пароль',
    'gate.submit': 'Войти',
    'gate.expired': 'Сессия истекла, войдите заново',

    'nav.add': '+ Добавить поставщика',
    'nav.brands': 'Бренды',
    'nav.export': 'Экспорт CSV',
    'nav.logout': 'Выйти',
    'nav.language': 'English',
    'nav.languageTitle': 'Переключить на английский',

    'search.placeholder': 'Поиск: поставщик, бренд, контакт, почта, телефон…',
    'search.all': 'Все',
    'search.distributors': 'Дистрибьюторы',
    'search.direct': 'Прямые поставщики',
    'search.total': ({ n }) => `Всего поставщиков: ${n}`,
    'search.found': ({ n, capped }) => `Найдено: ${n}${capped ? ' (показаны первые 80)' : ''}`,
    'search.emptyTitle': 'Ничего не найдено',
    'search.emptyHint': 'Поиск терпит опечатки, но не переводит между языками: попробуйте другое слово или часть названия.',
    'search.brandHitOne': 'Совпадение по бренду',
    'search.brandHitMany': 'Совпадения по брендам',
    'search.carriedBy': ({ n }) => (n === 1 ? 'возит: ' : `возят (${n}): `),
    'search.foundVia': 'найдено по:',
    'search.noBrands': 'брендов пока нет',

    'card.direct': 'прямой',
    'card.edit': 'Изменить',
    'card.editTitle': 'Открыть и изменить',
    'card.more': ({ n }) => `ещё ${n}`,
    'card.counts': ({ brands, contacts }) =>
      `${brands} ${plural(brands, ['бренд', 'бренда', 'брендов'])} · ${contacts} ${plural(contacts, ['контакт', 'контакта', 'контактов'])}`,

    'detail.back': '← Назад к поиску',
    'detail.backSearch': '← Поиск',
    'detail.allBrands': 'Все бренды',
    'detail.edit': 'Изменить',
    'detail.delete': 'Удалить',
    'detail.details': 'Реквизиты',
    'detail.editing': 'Редактирование',
    'detail.save': 'Сохранить',
    'detail.cancel': 'Отмена',
    'detail.create': 'Создать',
    'detail.empty': '—',

    'field.name': 'Название',
    'field.kind': 'Вид',
    'field.status': 'Статус',
    'field.city': 'Город',
    'field.country': 'Страна',
    'field.phone': 'Телефон',
    'field.email': 'Общая почта',
    'field.website': 'Сайт',
    'field.terms': 'Условия, оплата, сроки',
    'field.notes': 'Заметки',
    'field.updated': 'Обновлён',
    'field.contactName': 'Имя',
    'field.role': 'Должность',
    'field.contactEmail': 'Почта',
    'field.note': 'Примечание',

    'kind.distributor': 'дистрибьютор',
    'kind.direct': 'прямой поставщик',
    'status.active': 'активный',
    'status.reserve': 'резерв',
    'status.blacklist': 'чёрный список',

    'brands.section': ({ n }) => `Бренды — ${n}`,
    'brands.add': '+ Добавить бренд',
    'brands.namePlaceholder': 'Название бренда',
    'brands.none': 'пока ничего не привязано',
    'brands.remove': ({ name }) => `Убрать ${name}`,
    'brands.added': ({ name }) => `Бренд «${name}» добавлен`,
    'brands.title': 'Бренды',
    'brands.inArchive': ({ n }) => `${n} ${plural(n, ['бренд', 'бренда', 'брендов'])} в архиве`,
    'brands.filter': 'Фильтр по названию бренда',
    'brands.colBrand': 'Бренд',
    'brands.colSuppliers': 'Поставщиков',
    'brands.nothingFound': 'Ничего не найдено',
    'brands.rename': 'Переименовать',
    'brands.renameTitle': 'Переименовать бренд',
    'brands.nameLabel': 'Название бренда',
    'brands.mergeHint': 'Если бренд с таким названием уже есть, записи будут объединены.',
    'brands.renamed': 'Бренд переименован',
    'brands.carriers': ({ n }) =>
      `${n} ${plural(n, ['поставщик возит', 'поставщика возят', 'поставщиков возят'])} этот бренд`,
    'brands.noCarriers': 'Этот бренд ни к кому не привязан',

    'contacts.section': ({ n }) => `Контакты — ${n}`,
    'contacts.add': '+ Добавить контакт',
    'contacts.none': 'Контактов пока нет.',
    'contacts.unnamed': '(без имени)',
    'contacts.new': 'Новый контакт',
    'contacts.edit': 'Изменить контакт',
    'contacts.deleteTitle': 'Удалить контакт?',
    'contacts.deleted': 'Контакт удалён',
    'contacts.needOne': 'Заполните хотя бы имя, почту или телефон',

    'supplier.new': 'Новый поставщик',
    'supplier.added': 'Поставщик добавлен — теперь привяжите бренды и контакты',
    'supplier.deleteTitle': 'Удалить поставщика?',
    'supplier.deleteBody': ({ name }) =>
      `«${name}» будет удалён вместе со своими контактами и связями с брендами. Действие необратимо.`,
    'supplier.deleted': 'Поставщик удалён',

    'demo.notice': 'Демо-версия: данные настоящие, но ваши правки сохраняются только в этом браузере и никому больше не видны.',
    'demo.reset': 'Сбросить демо',
    'demo.resetTitle': 'Сбросить демо?',
    'demo.resetBody': 'Все правки, сделанные в этом браузере, будут отменены, а исходные данные восстановлены.',
    'demo.resetDone': 'Исходные данные восстановлены',

    'common.saved': 'Сохранено',
    'common.delete': 'Удалить',
    'common.cancel': 'Отмена',
    'common.loadFailed': 'Не удалось загрузить',
    'common.close': 'Закрыть',

    'error.name_required': 'Название обязательно',
    'error.brand_name_required': 'Укажите название бренда',
    'error.not_found': 'Не найдено',
    'error.unknown_route': 'Неизвестный метод API',
    'error.wrong_password': 'Неверный пароль',
    'error.unauthorized': 'Нужно войти',
    'error.bad_json': 'Некорректный JSON',
    'error.too_large': 'Слишком большой запрос',
    'error.server': 'Внутренняя ошибка',
  },
};

/** Русские формы множественного числа: 1 бренд, 2 бренда, 5 брендов. */
function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export const LANGS = ['en', 'ru'];
export const DICTIONARIES = DICT;   // нужно тестам, чтобы сверять полноту переводов
const STORAGE_KEY = 'archive.lang';

// Доступ к DOM и localStorage обёрнут: этот модуль импортируют и тесты в Node.
const setHtmlLang = (lang) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
};

let current = 'en';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (LANGS.includes(saved)) current = saved;
} catch { /* приватный режим или Node — остаёмся на языке по умолчанию */ }

export const getLang = () => current;

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* не критично */ }
  setHtmlLang(lang);
}

/** Перевод по ключу. Неизвестный ключ возвращается как есть — заметно при проверке. */
export function t(key, params) {
  const value = DICT[current][key] ?? DICT.en[key];
  if (value == null) return key;
  return typeof value === 'function' ? value(params || {}) : value;
}

/** Текст ошибки API: по коду, иначе исходное сообщение сервера. */
export const tError = (err) =>
  (err?.code && DICT[current][`error.${err.code}`] ? t(`error.${err.code}`) : err?.message) || t('error.server');

export const kindLabel = (kind) => t(kind === 'direct' ? 'kind.direct' : 'kind.distributor');

export const statusLabel = (status) => (status ? t(`status.${status}`) : '');

export const statusClass = (status) => ({
  blacklist: 'badge-bad',
  reserve: 'badge-warn',
  active: 'badge-ok',
}[status] || '');

setHtmlLang(current);
