import { useEffect, useMemo, useState } from 'react'
import { sb, tg, api, T, catName, haptic, compressImage } from './lib'

const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }
const num = (v) => (v === '' || v == null ? null : parseInt(v, 10))

export default function Shop() {
  const [lang, setLang] = useState(() => ls('lang', 'ru'))
  const [state, setState] = useState('loading') // loading | noauth | notowner | ready | error
  const [stores, setStores] = useState([])
  const [sid, setSid] = useState(null)
  const [products, setProducts] = useState([])
  const [rows, setRows] = useState({}) // сохранённые строки prices по product_id
  const [edit, setEdit] = useState({}) // то, что сейчас в полях: { pid: { price, qty } }
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [busy, setBusy] = useState({})
  const [msg, setMsg] = useState('')
  const [why, setWhy] = useState('')
  const t = T[lang]
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2800) }
  const pname = (p) => (lang === 'uz' && p.name_uz) || p.name_ru

  useEffect(() => { try { localStorage.setItem('lang', JSON.stringify(lang)) } catch { /* ignore */ } }, [lang])
  useEffect(() => {
    try { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#0f2a24'); tg?.setBackgroundColor?.('#f6f3ea') } catch { /* ignore */ }
    if (!tg?.initData) return setState('noauth')
    Promise.all([api('my_stores'), sb.from('products').select('*').order('name_ru')]).then(([r, p]) => {
      if (p.error || r.error) { setWhy(String(r.error || p.error?.message || '')); return setState('error') }
      setProducts(p.data)
      if (!r.stores?.length) return setState('notowner')
      setStores(r.stores); setSid(r.stores[0].id); setState('ready')
    })
  }, [])

  async function loadRows(id, resetEdit) {
    const { data, error } = await sb.from('prices').select('*').eq('store_id', id)
    if (error) return
    const m = {}; for (const r of data) m[r.product_id] = r
    setRows(m)
    if (resetEdit) {
      const e = {}
      for (const r of data) e[r.product_id] = { price: String(r.price), qty: r.qty == null ? '' : String(r.qty) }
      setEdit(e)
    }
  }
  useEffect(() => { if (sid) loadRows(sid, true) }, [sid])

  const saved = (pid) => ({ price: rows[pid] ? String(rows[pid].price) : '', qty: rows[pid]?.qty == null ? '' : String(rows[pid].qty) })
  const cur = (pid) => edit[pid] || { price: '', qty: '' }
  const isDirty = (pid) => { const a = cur(pid), b = saved(pid); return a.price !== b.price || a.qty !== b.qty }
  const upd = (pid, patch) => setEdit((e) => ({ ...e, [pid]: { price: '', qty: '', ...e[pid], ...patch } }))

  const dirtyItems = useMemo(() => products
    .filter((p) => isDirty(p.id) && num(cur(p.id).price) > 0)
    .map((p) => ({ product_id: p.id, price: num(cur(p.id).price), qty: num(cur(p.id).qty) })), [products, edit, rows])
  const filled = products.filter((p) => rows[p.id]).length
  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products])

  async function saveAll() {
    if (!dirtyItems.length) return flash(t.nothingToSave)
    const r = await api('update_prices', { store_id: sid, items: dirtyItems })
    if (r.ok) { await loadRows(sid, false); flash(t.saved); haptic('success') } else flash(t.saveFail)
  }

  async function pickPhoto(p, file) {
    const price = num(cur(p.id).price)
    if (!(price > 0)) return flash(t.needPrice)
    setBusy((b) => ({ ...b, [p.id]: true }))
    try {
      const first = await api('update_prices', { store_id: sid, items: [{ product_id: p.id, price, qty: num(cur(p.id).qty) }] })
      if (!first.ok) throw new Error('price')
      const image = await compressImage(file)
      const r = await api('upload_photo', { store_id: sid, product_id: p.id, image })
      if (!r.ok) throw new Error('photo')
      await loadRows(sid, false); flash(t.photoSaved); haptic('success')
    } catch { flash(t.photoFail) }
    setBusy((b) => ({ ...b, [p.id]: false }))
  }

  const items = products.filter((p) =>
    (cat === 'all' || p.category === cat) &&
    (!onlyEmpty || !rows[p.id]) &&
    (pname(p) + ' ' + p.name_ru).toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark" aria-hidden="true">T</span>{t.shopTitle}</div>
        <div className="lang" role="group" aria-label="Language">
          {['ru', 'uz'].map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
        </div>
      </header>

      <main className="shop-main">
        {state === 'loading' && <p className="note">{t.loading}</p>}
        {state === 'error' && <p className="note err">{t.err}<br /><small>{why}</small></p>}
        {state === 'noauth' && <p className="hint">{t.openInTg}</p>}
        {state === 'notowner' && <p className="hint">{t.notOwner}</p>}
        {state === 'ready' && (
          <>
            {stores.length > 1 && (
              <select className="search" value={sid || ''} onChange={(e) => setSid(e.target.value)} aria-label={t.myStores}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <div className="prog">
              <b>{t.filled.replace('{a}', filled).replace('{b}', products.length)}</b>
              <div className="bar ok"><i style={{ width: (products.length ? (filled / products.length) * 100 : 0) + '%' }} /></div>
            </div>
            <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
            <div className="chips scroll">
              <button className={'chip' + (onlyEmpty ? ' on' : '')} onClick={() => setOnlyEmpty(!onlyEmpty)}>{t.onlyEmptyLbl}</button>
              {['all', ...cats].map((c) => (
                <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c === 'all' ? t.all : catName(c, lang)}</button>
              ))}
            </div>
            <ul className="srows">
              {items.map((p) => {
                const r = rows[p.id]
                return (
                  <li key={p.id} className={'srow' + (isDirty(p.id) ? ' dirty' : '')}>
                    <label className="photo">
                      {r?.photo_url ? <img src={r.photo_url} alt="" /> : <span aria-hidden="true">{p.emoji || '📷'}</span>}
                      <i>{busy[p.id] ? '…' : r?.photo_url ? t.change : t.addPhoto}</i>
                      <input className="vh" type="file" accept="image/*" disabled={!!busy[p.id]}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickPhoto(p, f) }} />
                    </label>
                    <div className="inf"><b>{pname(p)}</b><small>{p.unit}</small></div>
                    <div className="flds">
                      <label>{t.price}
                        <input type="number" inputMode="numeric" min="0" value={cur(p.id).price} onChange={(e) => upd(p.id, { price: e.target.value })} />
                      </label>
                      <label>{t.qtyLabel}
                        <input type="number" inputMode="numeric" min="0" value={cur(p.id).qty} onChange={(e) => upd(p.id, { qty: e.target.value })} />
                      </label>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {msg && <p className="toast">{msg}</p>}
      </main>

      {state === 'ready' && (
        <div className="dock"><div className="cta">
          <button className="primary wide" disabled={!dirtyItems.length} onClick={saveAll}>{t.saveN.replace('{n}', dirtyItems.length)}</button>
        </div></div>
      )}
    </div>
  )
}
