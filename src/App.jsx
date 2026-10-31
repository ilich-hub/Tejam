import { useEffect, useMemo, useState } from 'react'
import { sb, tg, api, fmt, compare, T } from './lib'

const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }
const CENTER = { lat: 42.46, lng: 59.61 }

export default function App() {
  const [lang, setLang] = useState(() => ls('lang', tg?.initDataUnsafe?.user?.language_code === 'uz' ? 'uz' : 'ru'))
  const [tab, setTab] = useState('list')
  const [db, setDb] = useState({ state: 'loading', products: [], stores: [], prices: [] })
  const [list, setList] = useState(() => ls('list', {}))
  const [loc, setLoc] = useState(() => ls('loc', null))
  const [rate, setRate] = useState(() => ls('rate', 1500))
  const t = T[lang]

  useEffect(() => { tg?.ready(); tg?.expand(); load() }, [])
  useEffect(() => put('lang', lang), [lang])
  useEffect(() => put('list', list), [list])
  useEffect(() => put('loc', loc), [loc])
  useEffect(() => put('rate', rate), [rate])

  async function load() {
    const [p, s, pr] = await Promise.all([
      sb.from('products').select('*').order('name_ru'),
      sb.from('stores').select('id,name,address,lat,lng,is_demo').eq('is_active', true),
      sb.from('prices').select('*'),
    ])
    if (p.error || s.error || pr.error) setDb((d) => ({ ...d, state: 'error' }))
    else setDb({ state: 'ok', products: p.data, stores: s.data, prices: pr.data })
  }

  const count = Object.keys(list).length
  const pname = (p) => (lang === 'uz' && p.name_uz) || p.name_ru

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

      <main>
        {db.state === 'loading' && <p className="note">{t.loading}</p>}
        {db.state === 'error' && <p className="note err">{t.err}</p>}
        {db.state === 'ok' && tab === 'list' && (
          <ListScreen {...{ t, db, list, setList, pname, count }} go={() => setTab('compare')} />
        )}
        {db.state === 'ok' && tab === 'compare' && (
          <CompareScreen {...{ t, db, list, loc, setLoc, rate, setRate, pname }} back={() => setTab('list')} />
        )}
        {db.state === 'ok' && tab === 'shop' && <ShopScreen {...{ t, db, pname, reload: load }} />}
      </main>

      <nav className="tabs">
        {[['list', t.tabList, count], ['compare', t.tabCompare, 0], ['shop', t.tabShop, 0]].map(([id, label, n]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{n > 0 && <i>{n}</i>}
          </button>
        ))}
      </nav>
    </div>
  )
}

function ListScreen({ t, db, list, setList, pname, count, go }) {
  const [q, setQ] = useState('')
  const minPrice = useMemo(() => {
    const m = {}
    for (const p of db.prices) if (p.in_stock && (m[p.product_id] == null || p.price < m[p.product_id])) m[p.product_id] = p.price
    return m
  }, [db.prices])
  const items = db.products.filter((p) => (pname(p) + ' ' + p.name_ru).toLowerCase().includes(q.trim().toLowerCase()))
  const set = (id, d) => setList((l) => {
    const n = { ...l }
    const v = (n[id] || 0) + d
    if (v <= 0) delete n[id]; else n[id] = Math.min(v, 99)
    return n
  })

  return (
    <section>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} />
      {count === 0 && !q && <p className="hint">{t.emptyList}</p>}
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
          <button className="primary" onClick={go}>{t.toCompare} ({count})</button>
        </div>
      )}
    </section>
  )
}

function CompareScreen({ t, db, list, loc, setLoc, rate, setRate, pname, back }) {
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2600) }
  const origin = loc || CENTER
  const rows = useMemo(() => compare(list, db.stores, db.prices, origin, rate), [list, db, origin, rate])
  const nList = Object.keys(list).length
  const prod = (id) => db.products.find((p) => p.id === id)

  if (!nList) return <section><p className="hint">{t.noList}</p><button className="primary wide" onClick={back}>{t.tabList}</button></section>

  const full = rows.filter((r) => r.missing.length === 0)
  const best = full[0]
  const worst = full[full.length - 1]
  const saving = best && worst ? worst.net - best.net : 0
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

  return (
    <section>
      {best && full.length > 1 && (
        <div className="stamp" role="status">
          <small>{t.savesYou}</small>
          <strong>{fmt(saving)}</strong>
          <small>сум</small>
        </div>
      )}
      {full.length === 1 && <p className="hint">{t.single}</p>}
      {best && cheapest && cheapest !== best && (
        <p className="warn">{t.hintCheaper.replace('{s}', cheapest.store.name)}</p>
      )}

      <div className="where">
        <button className="ghost" onClick={locate}>{loc ? t.located : t.locate}</button>
        <label>{t.rate}<input type="number" inputMode="numeric" min="0" value={rate} onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))} /></label>
        {!loc && <small>{t.center}</small>}
      </div>
      {msg && <p className="toast">{msg}</p>}

      <ul className="stores">
        {rows.map((r) => {
          const isBest = r === best && full.length > 1
          return (
            <li key={r.store.id} className={isBest ? 'best' : ''}>
              <button className="head" onClick={() => setOpen(open === r.store.id ? null : r.store.id)} aria-expanded={open === r.store.id}>
                <span className="nm">
                  <b>{r.store.name}</b>
                  <small>
                    {r.km != null ? `${r.km.toFixed(1)} ${t.km}` : r.store.address}
                    {r.missing.length > 0 && ` · ${t.notAll.replace('{n}', r.missing.length).replace('{m}', nList)}`}
                  </small>
                </span>
                <span className="sum">{fmt(r.net)}<small>сум</small></span>
              </button>
              {isBest && <div className="tag">{t.best}</div>}
              <dl className="receipt">
                <div><dt>{t.goods}</dt><dd>{fmt(r.sum)}</dd></div>
                <div><dt>{t.road}</dt><dd>{fmt(r.road)}</dd></div>
                <div className="tot"><dt>{t.total}</dt><dd>{fmt(r.net)}</dd></div>
              </dl>
              {open === r.store.id && (
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
        })}
      </ul>
    </section>
  )
}

function ShopScreen({ t, db, pname, reload }) {
  const [mine, setMine] = useState(null)
  const [sid, setSid] = useState(null)
  const [edit, setEdit] = useState({})
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2600) }

  useEffect(() => {
    if (!tg?.initData) return setMine([])
    api('my_stores').then((r) => { setMine(r.stores || []); if (r.stores?.length) setSid(r.stores[0].id) })
  }, [])
  useEffect(() => {
    const e = {}
    for (const p of db.prices) if (p.store_id === sid) e[p.product_id] = { price: String(p.price), in_stock: p.in_stock }
    setEdit(e)
  }, [sid, db.prices])

  if (mine === null) return <p className="note">{t.loading}</p>
  if (!tg?.initData) return <p className="hint">{t.openInTg}</p>
  if (!mine.length) return <p className="hint">{t.notOwner}</p>

  const upd = (id, patch) => setEdit((e) => ({ ...e, [id]: { price: '', in_stock: true, ...e[id], ...patch } }))
  async function save() {
    const items = Object.entries(edit)
      .map(([id, v]) => ({ product_id: Number(id), price: parseInt(v.price, 10), in_stock: v.in_stock }))
      .filter((i) => i.price > 0)
    const r = await api('update_prices', { store_id: sid, items })
    if (r.ok) { flash(t.saved); reload() } else flash(t.saveFail)
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
        {db.products.map((p) => (
          <li key={p.id}>
            <div><b>{pname(p)}</b><span>{p.unit}</span></div>
            <div className="pe">
              <input type="number" inputMode="numeric" placeholder={t.price} value={edit[p.id]?.price ?? ''} onChange={(e) => upd(p.id, { price: e.target.value })} />
              <label><input type="checkbox" checked={edit[p.id]?.in_stock ?? true} onChange={(e) => upd(p.id, { in_stock: e.target.checked })} />{t.inStock}</label>
            </div>
          </li>
        ))}
      </ul>
      {msg && <p className="toast">{msg}</p>}
      <div className="cta"><button className="primary wide" onClick={save}>{t.save}</button></div>
    </section>
  )
}
