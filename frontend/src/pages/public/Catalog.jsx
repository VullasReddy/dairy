import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, inr } from '../../api'
import { useAuth, useCart, useFetch, useReveal, useToast } from '../../context'
import { I } from '../../components/Icons'
import { PlanCard } from '../../components/cards'
import { useLocation2, locateByGps } from '../../components/Location'
import { Empty, ErrorBox, SectionTitle, Skeleton, Spinner } from '../../components/ui'

export function PageHero({ title, sub, crumbs }) {
  return (
    <section className="page-hero">
      <div className="container">
        {crumbs && <div className="crumbs"><Link to="/">Home</Link> / {crumbs}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </section>
  )
}

export function Qty({ value, onChange, min = 0, max = 10, label }) {
  return (
    <div className="qty" role="group" aria-label={label || 'Quantity'}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">−</button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">+</button>
    </div>
  )
}

/* ------------------------------------------------------------------ products */
export function Products() {
  const { data, loading, error, reload } = useFetch('/api/public/products')
  useReveal()
  return (
    <>
      <PageHero title="Our Products" sub="Farm-fresh Cow Milk and Buffalo Milk, chilled and sealed within hours of milking." crumbs="Products" />
      <div className="page-bg"><section className="section container">
        <ErrorBox error={error} retry={reload} />
        <div className="grid-2">
          {loading && [0, 1].map((i) => <Skeleton key={i} h={420} />)}
          {data?.map((p) => (
            <article key={p.id} className="card card-cream reveal" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr' }}>
                <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 260 }} />
                <div style={{ padding: 22 }}>
                  <h2 className="serif" style={{ fontSize: 26, marginBottom: 2 }}>{p.name}</h2>
                  <p className="muted" style={{ marginTop: 0, fontWeight: 500 }}>{p.tagline}</p>
                  <p style={{ fontSize: 14 }}>{p.description}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 16px' }}>
                    {p.variants.map((v) => <span key={v.id} className="pill blue">{v.label} · {inr(v.price)}</span>)}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link to={`/products/${p.slug}`} className="btn btn-navy btn-sm">View Details <I.arrow size={15} /></Link>
                    <Link to="/subscriptions" className="btn btn-cream btn-sm">Subscribe</Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="card reveal" style={{ marginTop: 26, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <I.truck size={36} style={{ color: 'var(--navy)' }} />
          <div style={{ flex: 1, minWidth: 240 }}><b className="serif" style={{ color: 'var(--navy)', fontSize: 18 }}>Not sure yet? Start with a free 1-day trial.</b><div className="muted">One free trial per customer · up to 2 packets · no payment needed.</div></div>
          <Link to="/subscriptions" className="btn btn-gold">Claim Free Trial</Link>
        </div>
      </section></div>
    </>
  )
}

export function ProductDetail() {
  const { slug } = useParams()
  const { data: p, loading, error } = useFetch(`/api/public/products/${slug}`)
  const [vid, setVid] = useState(null)
  const [qty, setQty] = useState(1)
  const cart = useCart()
  const toast = useToast()
  const nav = useNavigate()
  useEffect(() => { if (p?.variants?.length) setVid(p.variants[0].id) }, [p])
  if (loading) return <><PageHero title="Loading…" /><div className="container section"><Skeleton h={380} /></div></>
  if (error) return <><PageHero title="Product not found" /><div className="container section"><Empty title="We couldn't find that product" action={<Link className="btn btn-navy" to="/products">See all products</Link>} /></div></>
  const v = p.variants.find((x) => x.id === vid)
  const nutrition = Object.entries(p.nutrition || {})
  const add = (go) => {
    if (!v) return
    cart.add({ ...v, product_name: p.name }, qty)
    toast.success(`${qty} × ${p.name} ${v.label} per day added`)
    if (go) nav('/cart')
  }
  return (
    <>
      <PageHero title={p.name} sub={p.tagline} crumbs={<><Link to="/products">Products</Link> / {p.name}</>} />
      <div className="page-bg"><section className="section container">
        <div className="product-big">
          <div className="img float"><img src={p.image} alt={p.name} /></div>
          <div className="card">
            <h2 className="serif" style={{ fontSize: 28 }}>{p.name}</h2>
            <p>{p.description}</p>
            <h4 style={{ margin: '16px 0 0' }}>Choose packet size</h4>
            <div className="variant-list" role="radiogroup">
              {p.variants.map((x) => (
                <div key={x.id} role="radio" tabIndex={0} aria-checked={x.id === vid} className={`variant ${x.id === vid ? 'on' : ''}`}
                  onClick={() => setVid(x.id)} onKeyDown={(e) => e.key === 'Enter' && setVid(x.id)}>
                  <span><b>{x.label}</b> packet</span>
                  <span><span className="p">{inr(x.price)}</span>{x.mrp > x.price && <s>{inr(x.mrp)}</s>}</span>
                </div>
              ))}
              {!p.variants.length && <div className="notice warn">Currently unavailable.</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ fontWeight: 600 }}>Packets per day</span>
              <Qty value={qty} onChange={setQty} min={1} />
              {v && <span className="muted">= {inr(v.price * qty)} / day</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-navy" onClick={() => add(true)} disabled={!v}>Subscribe <I.arrow size={16} /></button>
              <button className="btn btn-cream" onClick={() => add(false)} disabled={!v}>Add to Cart</button>
            </div>
            <h4 style={{ marginTop: 24 }}>Nutrition information</h4>
            {nutrition.length ? (
              <table className="t" style={{ maxWidth: 380 }}><tbody>{nutrition.map(([k, val]) => <tr key={k}><td>{k}</td><td className="strong">{val}</td></tr>)}</tbody></table>
            ) : <p className="muted" style={{ fontSize: 13.5 }}>Lab-verified nutrition values will be published here once our latest test report is available. See <Link to="/quality">Quality</Link>.</p>}
          </div>
        </div>
      </section></div>
    </>
  )
}

/* ------------------------------------------------------------------ live quote */
export function useQuote(items, planId, startDate) {
  const { user } = useAuth()
  const [state, setState] = useState({ q: null, loading: false, error: null })
  const key = JSON.stringify([items.map((i) => [i.variant_id, i.daily_qty]), planId, startDate, user?.id])
  const timer = useRef()
  useEffect(() => {
    if (!items.length || !planId) { setState({ q: null, loading: false, error: null }); return }
    setState((s) => ({ ...s, loading: true }))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const path = user?.role === 'customer' ? '/api/me/quote' : '/api/public/quote'
      api.post(path, { items: items.map(({ variant_id, daily_qty }) => ({ variant_id, daily_qty })), plan_id: planId, start_date: startDate || undefined })
        .then((q) => setState({ q, loading: false, error: null }))
        .catch((e) => setState({ q: null, loading: false, error: e }))
    }, 250)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export function QuoteSummary({ q, loading, error, children }) {
  const [pop, setPop] = useState(false)
  useEffect(() => { if (q) { setPop(true); const t = setTimeout(() => setPop(false), 400); return () => clearTimeout(t) } }, [q?.total])
  return (
    <div className="card summary">
      <h3 style={{ fontSize: 18 }}>Order Summary</h3>
      {error && <div className="notice err" style={{ marginBottom: 10 }}>{error.message}</div>}
      {!q && !error && <p className="muted" style={{ fontSize: 14 }}>{loading ? 'Calculating…' : 'Choose a plan and add milk to see your total.'}</p>}
      {q && (
        <>
          <div className="pill blue" style={{ marginBottom: 10 }}>{q.plan.name} · {q.plan.duration_days} day{q.plan.duration_days > 1 ? 's' : ''}</div>
          {q.lines.map((l) => (
            <div className="line" key={l.variant_id}>
              <span>{l.product} {l.size}<br /><small className="muted">{inr(l.unit_price)} × {l.daily_qty}/day × {l.days} days</small></span>
              <b>{inr(l.line_total)}</b>
            </div>
          ))}
          <div className="line"><span>Subtotal</span><span>{inr(q.subtotal)}</span></div>
          {q.discount > 0 && <div className="line" style={{ color: 'var(--green)' }}><span>{q.plan.is_trial ? 'Free trial' : `Plan discount (${q.plan.discount_percent}%)`}</span><span>− {inr(q.discount)}</span></div>}
          <div className="line"><span>Delivery</span><span style={{ color: 'var(--green)' }}>Free</span></div>
          <div className={`line total ${pop ? 'price-pop' : ''}`}><span>Total</span><span>{loading ? <Spinner /> : inr(q.total)}</span></div>
          {q.start_date && <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Deliveries: {q.start_date} → {q.end_date}</p>}
          {q.trial_eligibility && !q.trial_eligibility.eligible && <div className="notice warn" style={{ marginTop: 10 }}>{q.trial_eligibility.reason}</div>}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Final amount is calculated on our server using current prices.</p>
        </>
      )}
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ subscription builder */
export function Subscriptions() {
  const { loc, openPicker, setLocation, available } = useLocation2()
  const [gpsBusy, setGpsBusy] = useState(false)
  const { data: plans } = useFetch('/api/public/plans')
  const { data: products } = useFetch('/api/public/products')
  const [params] = useSearchParams()
  const cart = useCart()
  const nav = useNavigate()
  const [pin, setPin] = useState(loc?.pincode || '')
  const [pinRes, setPinRes] = useState(null)
  useReveal()

  useEffect(() => {
    const pp = Number(params.get('plan'))
    if (plans?.length) {
      if (pp && plans.find((p) => p.id === pp)) cart.setPlan(pp)
      else if (!cart.cart.plan_id || !plans.find((p) => p.id === cart.cart.plan_id)) cart.setPlan(plans.find((p) => p.is_popular)?.id || plans[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans])

  const variants = useMemo(() => (products || []).flatMap((p) => p.variants.map((v) => ({ ...v, product_name: p.name, image: p.image }))), [products])
  const plan = plans?.find((p) => p.id === cart.cart.plan_id)
  const { q, loading, error } = useQuote(cart.cart.items, cart.cart.plan_id)
  const qtyOf = (vid) => cart.cart.items.find((i) => i.variant_id === vid)?.daily_qty || 0
  const setQty = (v, n) => { if (!qtyOf(v.id) && n > 0) cart.add(v, n); else cart.setQty(v.id, n) }
  const cityList = available.map((c) => c.name).join(', ')
  const checkPin = async (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin)) { setPinRes({ ok: false, msg: 'Enter a 6-digit PIN code.' }); return }
    try {
      const r = await api.get(`/api/public/pincode/${pin}`)
      if (r.serviceable) {
        setLocation({ city: r.city, area: r.area, pincode: pin, available: true, source: 'pin' })
        setPinRes({ ok: true, msg: `Great news! We deliver to ${r.area}, ${r.city}.` })
      } else {
        setPinRes({ ok: false, msg: `Sorry, we don't deliver to ${pin} yet. We deliver in ${cityList}.` })
      }
    } catch (e2) { setPinRes({ ok: false, msg: e2.message }) }
  }
  const useGps = async () => {
    setGpsBusy(true); setPinRes(null)
    try {
      const l = await locateByGps()
      setLocation(l)
      setPinRes(l.available
        ? { ok: true, msg: `📍 You're in ${l.city}. Great news – we deliver here! Enter your PIN code to confirm your exact area.` }
        : { ok: false, msg: `📍 Sorry, we don't deliver to ${l.city} yet.${l.nearest ? ` Nearest service city: ${l.nearest}${l.nearestKm ? ` (${Math.round(l.nearestKm)} km)` : ''}.` : ''} We deliver in ${cityList}.` })
    } catch (e) { setPinRes({ ok: false, msg: e.message }) } finally { setGpsBusy(false) }
  }

  return (
    <>
      <PageHero title="Subscription Plans" sub="Pick a plan, choose your milk and daily quantity – we'll deliver fresh every morning." crumbs="Subscriptions" />
      <div className="page-bg"><section className="section container">
        {loc && (
          <div className={`notice ${loc.available ? 'ok' : 'warn'} mb-6 flex flex-wrap items-center gap-3`}>
            <span className="flex-1"><I.pin size={18} />{loc.available ? <>Delivering to <b>{loc.area ? `${loc.area}, ` : ''}{loc.city}</b></> : <>We don't deliver to <b>{loc.city}</b> yet – you can still explore plans and prices.</>}</span>
            <button className="btn btn-sm btn-outline" onClick={openPicker}>Change location</button>
          </div>
        )}
        <SectionTitle title="1. Choose your plan" sub="Advance payment for paid plans · free 1-day trial for new customers" />
        <div className="plan-row reveal" style={{ maxWidth: 820, margin: '0 auto 34px' }}>
          {plans ? plans.map((p) => <PlanCard key={p.id} plan={p} selected={p.id === cart.cart.plan_id} onSelect={() => cart.setPlan(p.id)} />)
            : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={170} />)}
        </div>
        <div className="builder">
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18 }}>2. Choose milk & packets per day</h3>
              {plan?.is_trial && <div className="notice info" style={{ marginBottom: 12 }}>Free trial: up to {plan.trial_max_packets} packets for 1 day, one trial per customer.</div>}
              {!variants.length && <Skeleton h={140} />}
              {variants.map((v) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid #F0F2F5' }}>
                  <img src={v.image} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}><b style={{ color: 'var(--navy-ink)' }}>{v.product_name} – {v.label}</b><div className="muted" style={{ fontSize: 13 }}>{inr(v.price)} per packet</div></div>
                  <Qty value={qtyOf(v.id)} onChange={(n) => setQty(v, n)} label={`${v.product_name} ${v.label} packets per day`} />
                </div>
              ))}
            </div>
            <div className="card">
              <h3 style={{ fontSize: 18 }}>Check delivery availability</h3>
              <p className="muted text-sm mt-0">We deliver in <b className="text-navy-ink">Vijayawada, Hyderabad, Bengaluru and Chennai</b>.</p>
              <button type="button" className="gps-btn mb-3" onClick={useGps} disabled={gpsBusy}>
                <span className="gps-ic">{gpsBusy ? <Spinner /> : <I.pin size={20} />}</span>
                <span><b>Use my current location</b><small>{gpsBusy ? 'Detecting your location…' : 'Check instantly using GPS'}</small></span>
              </button>
              <div className="or-line !mt-1 !mb-3"><span>or enter your PIN code</span></div>
              <form onSubmit={checkPin} style={{ display: 'flex', gap: 10 }}>
                <input className="input" style={{ flex: 1, minWidth: 0, maxWidth: 320 }} inputMode="numeric" maxLength={6} placeholder="Enter PIN code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN code" />
                <button className="btn btn-outline">Check</button>
              </form>
              {pinRes && <div className={`notice ${pinRes.ok ? 'ok' : 'warn'}`} style={{ marginTop: 12 }}>{pinRes.msg}</div>}
            </div>
          </div>
          <QuoteSummary q={q} loading={loading} error={error}>
            <button className="btn btn-navy btn-block btn-lg" style={{ marginTop: 14 }} disabled={!q || (loc && !loc.available)} onClick={() => nav('/checkout')}>
              Proceed to Checkout <I.arrow size={16} />
            </button>
            {loc && !loc.available && <p className="text-center text-sm muted mt-2 mb-0">Checkout opens once we deliver in {loc.city}. <button type="button" className="text-navy font-semibold bg-transparent border-0 cursor-pointer p-0" onClick={openPicker}>Change location</button></p>}
            <Link to="/cart" className="btn btn-ghost btn-block" style={{ marginTop: 6 }}>View cart</Link>
          </QuoteSummary>
        </div>
      </section></div>
    </>
  )
}

/* ------------------------------------------------------------------ cart */
export function Cart() {
  const cart = useCart()
  const { data: plans } = useFetch('/api/public/plans')
  const { q, loading, error } = useQuote(cart.cart.items, cart.cart.plan_id)
  const nav = useNavigate()
  useEffect(() => { if (plans?.length && !cart.cart.plan_id) cart.setPlan(plans.find((p) => p.is_popular)?.id || plans[0].id) /* eslint-disable-next-line */ }, [plans])
  return (
    <>
      <PageHero title="Your Cart" crumbs="Cart" />
      <div className="page-bg"><section className="section container">
        {!cart.cart.items.length ? (
          <div className="card"><Empty icon="cart" title="Your cart is empty" text="Add Cow Milk or Buffalo Milk to start your subscription." action={<Link to="/subscriptions" className="btn btn-navy">Build my subscription</Link>} /></div>
        ) : (
          <div className="builder">
            <div className="card">
              <h3 style={{ fontSize: 18 }}>Daily milk</h3>
              {cart.cart.items.map((i) => (
                <div key={i.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F0F2F5', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}><b>{i.product} – {i.size}</b><div className="muted" style={{ fontSize: 13 }}>{inr(i.price)} per packet</div></div>
                  <Qty value={i.daily_qty} onChange={(n) => cart.setQty(i.variant_id, n)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => cart.remove(i.variant_id)} aria-label="Remove"><I.trash size={18} /></button>
                </div>
              ))}
              <h3 style={{ fontSize: 18, marginTop: 20 }}>Plan</h3>
              <select className="input" value={cart.cart.plan_id || ''} onChange={(e) => cart.setPlan(Number(e.target.value))} aria-label="Plan">
                {plans?.map((p) => <option key={p.id} value={p.id}>{p.name} – {p.duration_days} day{p.duration_days > 1 ? 's' : ''}{p.discount_percent ? ` (save ${p.discount_percent}%)` : ''}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Link to="/subscriptions" className="btn btn-cream btn-sm">+ Add more milk</Link>
                <button className="btn btn-ghost btn-sm" onClick={cart.clear}>Clear cart</button>
              </div>
            </div>
            <QuoteSummary q={q} loading={loading} error={error}>
              <button className="btn btn-navy btn-block btn-lg" style={{ marginTop: 14 }} disabled={!q} onClick={() => nav('/checkout')}>Checkout <I.arrow size={16} /></button>
            </QuoteSummary>
          </div>
        )}
      </section></div>
    </>
  )
}
