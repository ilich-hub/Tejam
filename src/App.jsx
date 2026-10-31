import { useEffect, useMemo, useState } from 'react'
import { sb, tg, api, fmt, compare, T, haptic, openLink, shareText, routeUrl, freshness, PRESETS } from './lib'

const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }
const CENTER = { lat: 42.46, lng: 59.61 }
const monthKey = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth() }

const ICONS = {
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  compare: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z',
  wallet: 'M3 7a2 2 0 012-2h13v4M3 7v10a2 2 0 002 2h15V9H5a2 2 0 01-2-2M16 14h.01',
  store: 'M3 9l1.5-5h15L21 9v2H3zM5 11v9h14v-9M10 20v-5h4v5',
  pin: 'M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11zM12 10h.01',
  check: 'M5 12l5 5 9-10',
}
const Icon = ({ n }) => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[n]} /></svg>
)

// Плавный счётчик: число «набегает», это усиливает ощущение выгоды.
function CountUp({ n }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setV(n)
    let raf; const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 800)
      setV(Math.round(n * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [n])
  return <>{fmt(v)}</>
}

export default function App() {
  const [lang, setLang] = useState(() => ls('lang', tg?.initDataUnsafe?.user?.language_code === 'uz' ? 'uz' : 'ru'))
  const [tab, setTab] = useState('list')
  const [db, setDb] = useState({ state: 'loading', products: [], stores: [], prices: [] })
  const [list, setList] = useState(() => ls('list', {}))
  const [last, setLast] = useState(() => ls('last', {}))
  const [loc, setLoc] = useState(() => ls('loc', null))
  const [rate, setRate] = useState(() => ls('rate', 1500))
  const [purchases, setPurchases] = useState(() => ls('purchases', []))
  const [limit, setLimit] = useState(() => ls('limit', 0))
  const [mine, setMine] = useState([])
  const [done, setDone] = useState(null)
  const t = T[lang]

  useEffect(() => {
    try {
      tg?.ready(); tg?.expand()
      tg?.setHeaderColor?.('#0f2a24'); tg?.setBackgroundColor?.('#f6f3ea'); tg?.disableVerticalSwipes?.()
    } catch { /* ignore */ }
    load()
    if (tg?.initData) api('my_stores').then((r) => setMine(r.stores || []))
  }, [])
  useEffect(() => put('lang', lang), [lang])
  useEffect(() => put('list', list), [list])
  useEffect(() => put('last', last), [last])
  useEffect(() => put('loc', loc), [loc])
  useEffect(() => put('rate', rate), [rate])
  useEffect(() => put('purchases', purchases), [purchases])
  useEffect(() => put('limit', limit), [limit])

  async function load() {
    const [p, s, pr] = await Promise.all([
      sb.from('products').select('*').order('name_ru'),
      sb.from('stores').select('id,name,address,lat,lng,is_demo').eq('is_active', true),
      sb.from('prices').select('*'),
    ])
    if (p.error || s.error || pr.error) setDb((d) => ({ ...d, state: 'error' }))
    else setDb({ state: 'ok', products: p.data, stores: s.data, prices: pr.data })
  }

  const pname = (p) => (lang === 'uz' && p.name_uz) || p.name_ru
  const count = Object.keys(list).length
  const month = useMemo(() => {
    const cur = monthKey(Date.now())
    const mp = purchases.filter((p) => monthKey(p.ts) === cur)
    return { spent: mp.reduce((a, p) => a + p.total, 0), saved: mp.reduce((a, p) => a + p.saved, 0), n: mp.length }
  }, [purchases])

  function bought(rec) {
    setPurchases((p) => [...p, rec])
    setLast(list)
    setList({})
    setDone(rec)
    haptic('success')
  }

  const tabs = [['list', t.tabList, 'list', count], ['compare', t.tabCompare, 'compare', 0], ['budget', t.tabBudget, 'wallet', 0]]
  if (mine.length) tabs.push(['shop', t.tabShop, 'store', 0])

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark" aria-hidden="true">T</span>TEJAM</div>
        <div className="lang" role="group" aria-label="Language">
          {['ru', 'uz'].map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <main key={tab}>
        {month.saved > 0 && tab !== 'budget' && (
          <button className="chip-saved" onClick={() => setTab('budget')}>
            <span>{t.savedMonth}</span><b>{fmt(month.saved)} {t.sum}</b>
          </button>
        )}
        {db.state === 'loading' && <Skeleton />}
        {db.state === 'error' && <p className="note err">{t.err}</p>}
        {db.state === 'ok' && tab === 'list' && (
          <ListScreen {...{ t, db, list, setList, last, pname, count, loc, rate }} go={() => setTab('compare')} />
        )}
        {db.state === 'ok' && tab === 'compare' && (
          <CompareScreen {...{ t, db, list, loc, setLoc, rate, setRate, pname, bought }} back={() => setTab('list')} />
        )}
        {db.state === 'ok' && tab === 'budget' && (
          <BudgetScreen {...{ t, purchases, month, limit, setLimit }} />
        )}
        {db.state === 'ok' && tab === 'shop' && <ShopScreen {...{ t, db, pname, mine, reload: load }} />}
      </main>

      <nav className="tabs" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(([id, label, icon, n]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => { haptic('light'); setTab(id) }}>
            <Icon n={icon} /><span>{label}</span>{n > 0 && <i>{n}</i>}
          </button>
        ))}
      </nav>

      {done && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="coins" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((i) => <u key={i} style={{ '--i': i }} />)}</div>
            <h2>{t.doneTitle}</h2>
            {done.saved > 0
              ? <p className="big">{t.doneSaved.replace('{n}', '')}<strong><CountUp n={done.saved} /> {t.sum}</strong></p>
              : <p className="big">{t.doneZero}</p>}
            <p className="muted">{t.doneNote}</p>
            <div className="acts">
              {done.saved > 0 && <button className="primary" onClick={() => shareText(t.shareText.replace('{n}', fmt(done.saved)))}>{t.share}</button>}
              <button className="ghost" onClick={() => { setDone(null); setTab('budget') }}>{t.toBudget}</button>
            </div>
            <button className="close" onClick={() => setDone(null)}>{t.close}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return <div className="skel" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} />)}</div>
}

function ListScreen({ t, db, list, setList, last, pname, count, loc, rate, go }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [seen, setSeen] = useState(() => ls('seen', false))
  const origin = loc || CENTER
  const cats = useMemo(() => [...new Set(db.products.map((p) => p.category).filter(Boolean))], [db.products])
  const minPrice = useMemo(() => {
    const m = {}
    for (const p of db.prices) if (p.in_stock && (m[p.product_id] == null || p.price < m[p.product_id])) m[p.product_id] = p.price
    return m
  }, [db.prices])
  const est = useMemo(() => {
    if (!count) return 0
    const full = compare(list, db.stores, db.prices, origin, rate).filter((r) => !r.missing.length)
    return full.length > 1 ? full[full.length - 1].net - full[0].net : 0
  }, [list, db, origin, rate, count])

  const items = db.products.filter((p) =>
    (cat === 'all' || p.category === cat) &&
    (pname(p) + ' ' + p.name_ru).toLowerCase().includes(q.trim().toLowerCase()))
  const set = (id, d) => { haptic('light'); setList((l) => {
    const n = { ...l }; const v = (n[id] || 0) + d
    if (v <= 0) delete n[id]; else n[id] = Math.min(v, 99)
    return n
  }) }
  const fill = (names) => {
    const n = {}
    for (const nm of names) { const p = db.products.find((x) => x.name_ru.toLowerCase().includes(nm)); if (p) n[p.id] = 1 }
    if (Object.keys(n).length) { haptic('light'); setList((l) => ({ ...l, ...n })) }
  }
  const presets = PRESETS.map((p) => ({ ...p, n: p.names.filter((nm) => db.products.some((x) => x.name_ru.toLowerCase().includes(nm))).length })).filter((p) => p.n >= 2)
  const lastValid = Object.fromEntries(Object.entries(last).filter(([id]) => db.products.some((p) => String(p.id) === id)))
  const hasLast = Object.keys(lastValid).length > 0

  return (
    <section>
      {!seen && count === 0 && (
        <div className="intro">
          <h1>{t.heroTitle}</h1>
          <p>{t.heroText}</p>
          <ol>
            <li><Icon n="list" />{t.step1}</li>
            <li><Icon n="compare" />{t.step2}</li>
            <li><Icon n="wallet" />{t.step3}</li>
          </ol>
          <button className="mini" onClick={() => { setSeen(true); put('seen', true) }}>OK</button>
        </div>
      )}

      {count === 0 && (presets.length > 0 || hasLast) && (
        <div className="quick">
          <p className="label">{t.quick}</p>
          <div className="chips">
            {hasLast && <button className="chip hot" onClick={() => setList(lastValid)}>{t.repeat}</button>}
            {presets.map((p) => <button key={p.key} className="chip" onClick={() => fill(p.names)}>{t[p.key]}</button>)}
          </div>
        </div>
      )}

      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
      {cats.length > 1 && (
        <div className="chips scroll">
          {['all', ...cats].map((c) => (
            <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c === 'all' ? t.all : c}</button>
          ))}
        </div>
      )}
      {items.length === 0 && <p className="hint">{t.emptyList}</p>}
      <ul className="goods">
        {items.map((p) => (
          <li key={p.id} className={list[p.id] ? 'in' : ''}>
            <div>
              <b>{pname(p)}</b>
              <span>{p.unit}{minPrice[p.id] ? ` · ${t.from} ${fmt(minPrice[p.id])}` : ''}</span>
            </div>
            <div className="qty">
              {list[p.id] ? (
                <>
                  <button aria-label="−" onClick={() => set(p.id, -1)}>−</button>
                  <em>{list[p.id]}</em>
                  <button aria-label="+" onClick={() => set(p.id, 1)}>+</button>
                </>
              ) : (
                <button className="add" aria-label="+" onClick={() => set(p.id, 1)}>+</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {db.stores.some((s) => s.is_demo) && <p className="demo">{t.demo}</p>}
      {count > 0 && (
        <div className="cta">
          <button className="ghost" onClick={() => setList({})}>{t.clear}</button>
          <button className="primary" onClick={go}>
            {est > 0 ? t.compareSave.replace('{n}', fmt(est)) : `${t.toCompare} (${count})`}
          </button>
        </div>
      )}
    </section>
  )
}

function StoreCard({ r, hero, worst, fresh, open, toggle, buy, report, t, pname, prod, nList }) {
  return (
    <li className={'store' + (hero ? ' hero' : '')}>
      {hero && <div className="tag">{t.best}</div>}
      <button className="head" onClick={toggle} aria-expanded={open}>
        <span className="nm">
          <b>{r.store.name}</b>
          <small>
            {r.km != null ? `${r.km.toFixed(1)} ${t.km}` : r.store.address}
            {r.missing.length > 0 && ` · ${t.notAll.replace('{n}', r.missing.length).replace('{m}', nList)}`}
          </small>
          <small className={'fresh ' + fresh.level}><i />{fresh.text}</small>
        </span>
        <span className="sum">
          {hero && worst && worst.net > r.net && <s>{fmt(worst.net)}</s>}
          {fmt(r.net)}<small>{t.sum}</small>
        </span>
      </button>
      <dl className="receipt">
        <div><dt>{t.goods}</dt><dd>{fmt(r.sum)}</dd></div>
        <div><dt>{t.road}</dt><dd>{fmt(r.road)}</dd></div>
        <div className="tot"><dt>{t.total}</dt><dd>{fmt(r.net)}</dd></div>
      </dl>
      {(hero || open) && (
        <div className="acts pad">
          {r.store.lat != null && <button className="ghost" onClick={() => openLink(routeUrl(r.store))}><Icon n="pin" />{t.route}</button>}
          {r.missing.length === 0 && <button className="primary" onClick={buy}><Icon n="check" />{t.bought}</button>}
        </div>
      )}
      {open && (
        <div className="more">
          <p>{t.details}</p>
          <ul>
            {r.lines.map((l) => (
              <li key={l.id}>
                <span>{pname(prod(l.id))} × {l.qty}</span>
                <span>{fmt(l.price * l.qty)}</span>
                <button onClick={() => report(r.store.id, l.id)}>{t.wrongPrice}</button>
              </li>
            ))}
            {r.missing.map((id) => (
              <li key={id} className="out"><span>{pname(prod(id))}</span><span>{t.missing}</span></li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function CompareScreen({ t, db, list, loc, setLoc, rate, setRate, pname, bought, back }) {
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2600) }
  const origin = loc || CENTER
  const rows = useMemo(() => compare(list, db.stores, db.prices, origin, rate), [list, db, origin, rate])
  const freshMap = useMemo(() => {
    const m = {}
    for (const p of db.prices) if (!m[p.store_id] || p.updated_at > m[p.store_id]) m[p.store_id] = p.updated_at
    return m
  }, [db.prices])
  const nList = Object.keys(list).length
  const prod = (id) => db.products.find((p) => p.id === id)

  if (!nList) return <section><p className="hint">{t.noList}</p><button className="primary wide" onClick={back}>{t.tabList}</button></section>

  const full = rows.filter((r) => r.missing.length === 0)
  const best = full.length > 1 ? full[0] : null
  const worst = full.length > 1 ? full[full.length - 1] : null
  const saving = best ? worst.net - best.net : 0
  const cheapest = [...full].sort((a, b) => a.sum - b.sum)[0]

  function locate() {
    if (!navigator.geolocation) return flash(t.locFail)
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); flash(t.located) },
      () => flash(t.locFail),
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }
  async function report(storeId, productId) {
    const r = await api('report', { store_id: storeId, product_id: productId })
    flash(r.ok ? t.thanks : r.error === 'limit' ? t.repLimit : t.err)
  }
  const buy = (r) => bought({
    ts: Date.now(), store: r.store.name, total: r.sum,
    saved: worst ? Math.max(0, worst.net - r.net) : 0,
  })

  return (
    <section>
      {best && (
        <div className="stamp" role="status">
          <small>{t.savesYou}</small>
          <strong><CountUp n={saving} /></strong>
          <small>{t.sum}</small>
        </div>
      )}
      {full.length === 1 && <p className="hint">{t.single}</p>}
      {full.length === 0 && <p className="warn">{t.noneFull}</p>}
      {best && cheapest && cheapest !== best && <p className="warn">{t.hintCheaper.replace('{s}', cheapest.store.name)}</p>}

      <div className="where">
        <button className="ghost" onClick={locate}><Icon n="pin" />{loc ? t.located : t.locate}</button>
        <label>{t.rate}<input type="number" inputMode="numeric" min="0" value={rate} onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))} /></label>
        {!loc && <small>{t.center}</small>}
      </div>
      {msg && <p className="toast">{msg}</p>}

      <ul className="stores">
        {rows.map((r) => (
          <StoreCard key={r.store.id} r={r} hero={r === best} worst={worst}
            fresh={freshness(freshMap[r.store.id], t)} open={open === r.store.id}
            toggle={() => setOpen(open === r.store.id ? null : r.store.id)}
            buy={() => buy(r)} report={report} {...{ t, pname, prod, nList }} />
        ))}
      </ul>
    </section>
  )
}

function BudgetScreen({ t, purchases, month, limit, setLimit }) {
  const now = new Date()
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = dim - now.getDate() + 1
  const left = limit - month.spent
  const pct = limit > 0 ? Math.min(100, (month.spent / limit) * 100) : 0
  const level = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok'
  const recent = [...purchases].reverse().slice(0, 10)

  return (
    <section>
      <div className="saved-card">
        <small>{t.savedMonth}</small>
        <strong><CountUp n={month.saved} /> <span>{t.sum}</span></strong>
      </div>

      <div className="card">
        <h2>{t.budgetTitle}</h2>
        <label className="fld">{t.limit}
          <input type="number" inputMode="numeric" min="0" value={limit || ''} placeholder="1 500 000"
            onChange={(e) => setLimit(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        {limit > 0 ? (
          <>
            <div className={'bar ' + level} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct)}><i style={{ width: pct + '%' }} /></div>
            <div className="two">
              <div><small>{t.spent}</small><b>{fmt(month.spent)}</b></div>
              <div><small>{t.left}</small><b>{fmt(Math.max(0, left))}</b></div>
            </div>
            <p className={left < 0 ? 'warn' : 'muted'}>
              {left < 0 ? t.over.replace('{n}', fmt(-left)) : t.perDay.replace('{n}', fmt(left / daysLeft))}
            </p>
          </>
        ) : <p className="muted">{t.setLimit}</p>}
      </div>

      <h3 className="sub">{t.purchases}</h3>
      {recent.length === 0 && <p className="hint">{t.noPurch}</p>}
      <ul className="hist">
        {recent.map((p, i) => (
          <li key={i}>
            <span><b>{p.store}</b><small>{new Date(p.ts).toLocaleDateString()}</small></span>
            <span className="r">{fmt(p.total)}{p.saved > 0 && <em>−{fmt(p.saved)}</em>}</span>
          </li>
        ))}
      </ul>
      {import.meta.env.VITE_CONTACT && (
        <button className="link" onClick={() => openLink(import.meta.env.VITE_CONTACT)}>{t.becomeShop}</button>
      )}
    </section>
  )
}

function ShopScreen({ t, db, pname, mine, reload }) {
  const [sid, setSid] = useState(mine[0]?.id || null)
  const [edit, setEdit] = useState({})
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2600) }

  useEffect(() => {
    const e = {}
    for (const p of db.prices) if (p.store_id === sid) e[p.product_id] = { price: String(p.price), in_stock: p.in_stock }
    setEdit(e)
  }, [sid, db.prices])

  const upd = (id, patch) => setEdit((e) => ({ ...e, [id]: { price: '', in_stock: true, ...e[id], ...patch } }))
  async function save() {
    const items = Object.entries(edit)
      .map(([id, v]) => ({ product_id: Number(id), price: parseInt(v.price, 10), in_stock: v.in_stock }))
      .filter((i) => i.price > 0)
    const r = await api('update_prices', { store_id: sid, items })
    if (r.ok) { flash(t.saved); reload(); haptic('success') } else flash(t.saveFail)
  }

  return (
    <section>
      <p className="hint">{t.shopIntro}</p>
      {mine.length > 1 && (
        <select className="search" value={sid || ''} onChange={(e) => setSid(e.target.value)} aria-label={t.myStores}>
          {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <ul className="goods edit">
      
