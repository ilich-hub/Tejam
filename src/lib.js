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
    return await r.json()
  } catch {
    return { error: 'network' }
  }
}

function dist(a, b) {
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

export const T = {
  ru: {
    tabList: 'Список', tabCompare: 'Сравнение', tabShop: 'Магазин',
    search: 'Найти товар', loading: 'Загрузка…', err: 'Не удалось загрузить данные. Проверьте интернет и откройте снова.',
    emptyList: 'Добавьте товары, и мы найдём, где корзина выгоднее с учётом дороги.',
    from: 'от', toCompare: 'Сравнить цены', clear: 'Очистить список', demo: 'Демо-цены: реальные добавят магазины.',
    where: 'Откуда считать дорогу', locate: 'Определить мой адрес', located: 'Адрес определён', center: 'Считаем от центра Нукуса',
    locFail: 'Не удалось определить адрес, считаем от центра.', rate: 'Дорога, сум за 1 км (туда и обратно)',
    savesYou: 'Выгоднее на', goods: 'Товары', road: 'Дорога', total: 'Итого', best: 'Лучший выбор',
    missing: 'нет в наличии', notAll: 'нет {n} из {m}', km: 'км', details: 'Цены в магазине',
    wrongPrice: 'Цена неверна', thanks: 'Спасибо, проверим', repLimit: 'Сегодня уже достаточно жалоб',
    hintCheaper: 'Дешевле по цене в «{s}», но дорога съедает выгоду.', single: 'Нужны цены хотя бы двух магазинов, чтобы сравнивать.',
    noList: 'Список пуст. Сначала выберите товары.', shopIntro: 'Обновляйте цены магазина. Покупатели увидят их сразу.',
    notOwner: 'Этот раздел для владельцев магазинов. Чтобы подключить магазин, напишите нам.',
    openInTg: 'Откройте приложение внутри Telegram, чтобы войти как магазин.', price: 'Цена, сум', inStock: 'В наличии',
    save: 'Сохранить цены', saved: 'Цены обновлены', saveFail: 'Не удалось сохранить. Проверьте цены и попробуйте снова.',
    myStores: 'Мои магазины', pcs: 'шт',
  },
  uz: {
    tabList: 'Roʻyxat', tabCompare: 'Taqqoslash', tabShop: 'Doʻkon',
    search: 'Mahsulot qidirish', loading: 'Yuklanmoqda…', err: 'Maʼlumotlarni yuklab boʻlmadi. Internetni tekshirib, qayta oching.',
    emptyList: 'Mahsulot qoʻshing, yoʻl xarajatini hisobga olib qayerda arzonligini topamiz.',
    from: 'dan', toCompare: 'Narxlarni taqqoslash', clear: 'Roʻyxatni tozalash', demo: 'Demo narxlar: haqiqiylarini doʻkonlar kiritadi.',
    where: 'Yoʻlni qayerdan hisoblash', locate: 'Manzilimni aniqlash', located: 'Manzil aniqlandi', center: 'Nukus markazidan hisoblaymiz',
    locFail: 'Manzilni aniqlab boʻlmadi, markazdan hisoblaymiz.', rate: 'Yoʻl, 1 km uchun soʻm (borib-kelish)',
    savesYou: 'Tejam', goods: 'Mahsulotlar', road: 'Yoʻl', total: 'Jami', best: 'Eng yaxshi tanlov',
    missing: 'mavjud emas', notAll: '{m} tadan {n} tasi yoʻq', km: 'km', details: 'Doʻkondagi narxlar',
    wrongPrice: 'Narx notoʻgʻri', thanks: 'Rahmat, tekshiramiz', repLimit: 'Bugun shikoyatlar yetarli',
    hintCheaper: 'Narxi «{s}» doʻkonida arzon, lekin yoʻl xarajati foydani yeydi.', single: 'Taqqoslash uchun kamida ikkita doʻkon narxi kerak.',
    noList: 'Roʻyxat boʻsh. Avval mahsulot tanlang.', shopIntro: 'Doʻkon narxlarini yangilang. Xaridorlar darhol koʻradi.',
    notOwner: 'Bu boʻlim doʻkon egalari uchun. Doʻkonni ulash uchun bizga yozing.',
    openInTg: 'Doʻkon sifatida kirish uchun ilovani Telegram ichida oching.', price: 'Narx, soʻm', inStock: 'Mavjud',
    save: 'Narxlarni saqlash', saved: 'Narxlar yangilandi', saveFail: 'Saqlab boʻlmadi. Narxlarni tekshirib, qayta urining.',
    myStores: 'Mening doʻkonlarim', pcs: 'dona',
  },
}
