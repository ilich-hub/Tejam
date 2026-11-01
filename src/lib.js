import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const sb = createClient(URL || 'http://localhost', KEY || 'missing-key')
export const tg = window.Telegram?.WebApp

export const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+$)/g, ' ')

// Запросы к Edge Function. initData подтверждает, что запрос пришёл из Telegram.
export async function api(action, body = {}) {
  try {
    const r = await fetch(`${URL}/functions/v1/tejam-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ action, initData: tg?.initData || '', ...body }),
    })
    let j = null
    try { j = await r.json() } catch { /* не JSON */ }
    if (j && typeof j === 'object' && r.ok) return j
    return { error: (j && (j.error || j.message)) || `http_${r.status}` }
  } catch {
    return { error: 'network' }
  }
}

export function dist(a, b) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// list: { [productId]: qty }. Дорога = расстояние по прямой x 1.3, туда и обратно.
export function compare(list, stores, prices, loc, rate) {
  const ids = Object.keys(list).map(Number)
  const byStore = {}
  for (const p of prices) (byStore[p.store_id] ||= {})[p.product_id] = p
  const rows = stores.map((s) => {
    let sum = 0
    const missing = []
    const lines = []
    for (const id of ids) {
      const p = byStore[s.id]?.[id]
      if (p && p.in_stock) {
        sum += p.price * list[id]
        lines.push({ id, price: p.price, qty: list[id] })
      } else missing.push(id)
    }
    const km = loc && s.lat != null ? dist(loc, s) : null
    const road = km == null ? 0 : Math.round(km * 1.3 * 2 * rate)
    return { store: s, sum, missing, lines, km, road, net: sum + road }
  })
  rows.sort((a, b) => a.missing.length - b.missing.length || a.net - b.net)
  return rows
}

// Сжатие фото на телефоне перед отправкой: до 900 px, JPEG. Возвращает base64.
export async function compressImage(file, max = 900, quality = 0.8) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality))
  return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob) })
}

export const haptic = (kind = 'light') => {
  try { kind === 'success' ? tg?.HapticFeedback?.notificationOccurred('success') : tg?.HapticFeedback?.impactOccurred(kind) } catch { /* ignore */ }
}
export const openLink = (url) => (tg?.openLink ? tg.openLink(url) : window.open(url, '_blank'))
export const shareText = (text) => {
  const link = import.meta.env.VITE_BOT_LINK || window.location.origin
  const u = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
  tg?.openTelegramLink ? tg.openTelegramLink(u) : window.open(u, '_blank')
}
export const routeUrl = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`

// Свежесть цены: сегодня / вчера / N дней. level: ok | warn | old
export function freshness(ts, t) {
  if (!ts) return { level: 'old', text: t.freshNone }
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days <= 0) return { level: 'ok', text: t.freshToday }
  if (days === 1) return { level: 'ok', text: t.freshYday }
  return { level: days <= 7 ? 'warn' : 'old', text: t.freshDays.replace('{n}', days) }
}

// Готовые корзины: снимают трение первого шага (эффект «по умолчанию»).
export const PRESETS = [
  { key: 'pBasic', names: ['яйца', 'молоко', 'рис', 'сахар', 'масло', 'мука'] },
  { key: 'pVeg', names: ['картофель', 'лук', 'морковь'] },
  { key: 'pTea', names: ['чай', 'сахар', 'лепёшка'] },
]

const CAT_UZ = { 'Молочное и яйца': 'Sut mahsulotlari va tuxum', 'Хлеб': 'Non', 'Крупы и макароны': 'Yormalar va makaron', 'Бакалея': 'Baqqollik', 'Овощи': 'Sabzavotlar', 'Фрукты': 'Mevalar', 'Мясо и птица': 'Goʻsht va parranda', 'Напитки': 'Ichimliklar', 'Сладости': 'Shirinliklar', 'Бытовая химия': 'Maishiy kimyo', 'Гигиена': 'Gigiyena' }
export const catName = (c, lang) => (lang === 'uz' && CAT_UZ[c]) || c

export const T = {
  ru: {
    shopTitle: 'Кабинет магазина', filled: 'Заполнено {a} из {b}', onlyEmptyLbl: 'Без цены', qtyLabel: 'Остаток, шт', addPhoto: 'Фото', change: 'Заменить',
    needPrice: 'Сначала укажите цену', photoSaved: 'Фото сохранено', photoFail: 'Не удалось загрузить фото. Попробуйте ещё раз.', saveN: 'Сохранить ({n})', nothingToSave: 'Нет изменений',
    notOwner: 'Этот раздел для владельцев магазинов. Чтобы подключить магазин, напишите нам.', openInTg: 'Откройте приложение внутри Telegram.', only: 'Осталось {n}', stockOk: 'в наличии',
    tabNearby: 'Рядом', nearbyHint: 'Магазины рядом и что в них есть', r1: 'до 1 км', r3: 'до 3 км', rAll: 'Все',
    goodsN: 'товаров: {n}', back: 'Назад', storeEmpty: 'Магазин пока не добавил цены.', noStores: 'В выбранном радиусе нет магазинов.',
    addToList: 'В список', noPrices: 'пока нет цен', searchInStore: 'Поиск в магазине',
    tabList: 'Список', tabCompare: 'Сравнение', tabBudget: 'Бюджет', tabShop: 'Магазин',
    search: 'Найти товар', all: 'Все', loading: 'Загрузка…', err: 'Не удалось загрузить данные. Проверьте интернет и откройте снова.',
    heroTitle: 'Где корзина дешевле?', heroText: 'Составьте список. TEJAM найдёт магазин с лучшей ценой и учтёт дорогу.',
    step1: 'Список', step2: 'Сравнение', step3: 'Экономия', quick: 'Быстрый старт',
    pBasic: 'Базовая корзина', pVeg: 'Овощи', pTea: 'К чаю', repeat: 'Повторить прошлую покупку',
    emptyList: 'Ничего не нашли. Попробуйте другое слово.', from: 'от', toCompare: 'Сравнить цены', compareSave: 'Сравнить · экономия ~{n} сум',
    clear: 'Очистить', demo: 'Демо-цены: реальные добавят магазины.', sum: 'сум',
    where: 'Откуда считать дорогу', locate: 'Определить мой адрес', located: 'Адрес определён', center: 'Считаем от центра Нукуса',
    locFail: 'Не удалось определить адрес, считаем от центра.', rate: 'Дорога, сум за 1 км (туда и обратно)',
    savesYou: 'Вы экономите', instead: 'вместо', goods: 'Товары', road: 'Дорога', total: 'Итого', best: 'Лучший выбор',
    missing: 'нет в наличии', notAll: 'нет {n} из {m}', km: 'км', details: 'Цены в магазине', moreInfo: 'Подробнее',
    wrongPrice: 'Сообщить о неверной цене', complaints: 'жалоб: {n}', thanks: 'Спасибо, проверим', repLimit: 'Сегодня уже достаточно жалоб',
    hintCheaper: 'Дешевле по цене в «{s}», но дорога съедает выгоду.', single: 'Нужны цены хотя бы двух магазинов, чтобы сравнивать.',
    noneFull: 'Ни в одном магазине нет всех товаров из списка.', noList: 'Список пуст. Сначала выберите товары.',
    route: 'Маршрут', bought: 'Купил здесь', freshToday: 'цены обновлены сегодня', freshYday: 'цены обновлены вчера',
    freshDays: 'цены обновлены {n} дн. назад', freshNone: 'дата обновления неизвестна',
    doneTitle: 'Отличная покупка!', doneSaved: 'Вы сэкономили {n} сум', doneZero: 'Покупка записана в бюджет', doneNote: 'Она уже в вашем бюджете.',
    share: 'Поделиться', toBudget: 'К бюджету', close: 'Закрыть', shareText: 'Я сэкономил {n} сум на продуктах с TEJAM',
    savedMonth: 'Сэкономлено в этом месяце', budgetTitle: 'Бюджет на месяц', limit: 'Лимит на месяц, сум', setLimit: 'Задайте лимит, и мы покажем, сколько можно тратить в день.',
    spent: 'Потрачено', left: 'Осталось', perDay: 'Можно тратить в день: {n} сум', over: 'Лимит превышен на {n} сум',
    purchases: 'Последние покупки', noPurch: 'Пока нет покупок. Нажмите «Купил здесь» в сравнении, и покупка появится тут.',
    saved: 'Цены обновлены', saveFail: 'Не удалось сохранить. Проверьте цены и попробуйте снова.',
    becomeShop: 'Вы владелец магазина? Напишите нам, чтобы подключиться.',
    shopIntro: 'Обновляйте цены магазина. Покупатели увидят их сразу.', price: 'Цена, сум', inStock: 'В наличии', save: 'Сохранить цены', myStores: 'Мои магазины',
  },
  uz: {
    shopTitle: 'Doʻkon kabineti', filled: 'Toʻldirildi {a} / {b}', onlyEmptyLbl: 'Narxsiz', qtyLabel: 'Qoldiq, dona', addPhoto: 'Rasm', change: 'Almashtirish',
    needPrice: 'Avval narxni kiriting', photoSaved: 'Rasm saqlandi', photoFail: 'Rasmni yuklab boʻlmadi. Qayta urining.', saveN: 'Saqlash ({n})', nothingToSave: 'Oʻzgarish yoʻq',
    notOwner: 'Bu boʻlim doʻkon egalari uchun. Doʻkonni ulash uchun bizga yozing.', openInTg: 'Ilovani Telegram ichida oching.', only: 'Qoldi {n} ta', stockOk: 'mavjud',
    tabNearby: 'Yaqin', nearbyHint: 'Yaqin doʻkonlar va ulardagi mahsulotlar', r1: '1 km gacha', r3: '3 km gacha', rAll: 'Hammasi',
    goodsN: 'mahsulot: {n}', back: 'Orqaga', storeEmpty: 'Doʻkon hali narx kiritmagan.', noStores: 'Tanlangan radiusda doʻkon yoʻq.',
    addToList: 'Roʻyxatga', noPrices: 'hozircha narx yoʻq', searchInStore: 'Doʻkonda qidirish',
    tabList: 'Roʻyxat', tabCompare: 'Taqqoslash', tabBudget: 'Byudjet', tabShop: 'Doʻkon',
    search: 'Mahsulot qidirish', all: 'Hammasi', loading: 'Yuklanmoqda…', err: 'Maʼlumotlarni yuklab boʻlmadi. Internetni tekshirib, qayta oching.',
    heroTitle: 'Savat qayerda arzon?', heroText: 'Roʻyxat tuzing. TEJAM eng yaxshi narxli doʻkonni topadi va yoʻlni hisobga oladi.',
    step1: 'Roʻyxat', step2: 'Taqqoslash', step3: 'Tejash', quick: 'Tez boshlash',
    pBasic: 'Asosiy savat', pVeg: 'Sabzavotlar', pTea: 'Choyga', repeat: 'Oxirgi xaridni takrorlash',
    emptyList: 'Hech narsa topilmadi. Boshqa soʻz yozing.', from: 'dan', toCompare: 'Narxlarni taqqoslash', compareSave: 'Taqqoslash · tejam ~{n} soʻm',
    clear: 'Tozalash', demo: 'Demo narxlar: haqiqiylarini doʻkonlar kiritadi.', sum: 'soʻm',
    where: 'Yoʻlni qayerdan hisoblash', locate: 'Manzilimni aniqlash', located: 'Manzil aniqlandi', center: 'Nukus markazidan hisoblaymiz',
    locFail: 'Manzilni aniqlab boʻlmadi, markazdan hisoblaymiz.', rate: 'Yoʻl, 1 km uchun soʻm (borib-kelish)',
    savesYou: 'Tejaysiz', instead: 'oʻrniga', goods: 'Mahsulotlar', road: 'Yoʻl', total: 'Jami', best: 'Eng yaxshi tanlov',
    missing: 'mavjud emas', notAll: '{m} tadan {n} tasi yoʻq', km: 'km', details: 'Doʻkondagi narxlar', moreInfo: 'Batafsil',
    wrongPrice: 'Narx notoʻgʻri deb xabar berish', complaints: 'shikoyat: {n}', thanks: 'Rahmat, tekshiramiz', repLimit: 'Bugun shikoyatlar yetarli',
    hintCheaper: 'Narxi «{s}» doʻkonida arzon, lekin yoʻl xarajati foydani yeydi.', single: 'Taqqoslash uchun kamida ikkita doʻkon narxi kerak.',
    noneFull: 'Hech bir doʻkonda roʻyxatdagi barcha mahsulot yoʻq.', noList: 'Roʻyxat boʻsh. Avval mahsulot tanlang.',
    route: 'Yoʻnalish', bought: 'Shu yerdan oldim', freshToday: 'narxlar bugun yangilangan', freshYday: 'narxlar kecha yangilangan',
    freshDays: 'narxlar {n} kun oldin yangilangan', freshNone: 'yangilanish sanasi nomaʼlum',
    doneTitle: 'Ajoyib xarid!', doneSaved: 'Siz {n} soʻm tejadingiz', doneZero: 'Xarid byudjetga yozildi', doneNote: 'U allaqachon byudjetingizda.',
    share: 'Ulashish', toBudget: 'Byudjetga', close: 'Yopish', shareText: 'Men TEJAM bilan oziq-ovqatda {n} soʻm tejadim',
    savedMonth: 'Shu oyda tejaldi', budgetTitle: 'Oylik byudjet', limit: 'Oylik limit, soʻm', setLimit: 'Limitni belgilang, kuniga qancha sarflash mumkinligini koʻrsatamiz.',
    spent: 'Sarflandi', left: 'Qoldi', perDay: 'Kuniga sarflash mumkin: {n} soʻm', over: 'Limit {n} soʻmga oshdi',
    purchases: 'Oxirgi xaridlar', noPurch: 'Hozircha xarid yoʻq. Taqqoslashda «Shu yerdan oldim» tugmasini bosing.',
    saved: 'Narxlar yangilandi', saveFail: 'Saqlab boʻlmadi. Narxlarni tekshirib, qayta urining.',
    becomeShop: 'Doʻkon egasimisiz? Ulanish uchun bizga yozing.',
    shopIntro: 'Doʻkon narxlarini yangilang. Xaridorlar darhol koʻradi.', price: 'Narx, soʻm', inStock: 'Mavjud', save: 'Narxlarni saqlash', myStores: 'Mening doʻkonlarim',
  },
}
