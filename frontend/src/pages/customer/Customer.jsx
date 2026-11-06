import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, addDays, fmtDate, fmtDateTime, inr, todayISO } from '../../api'
import { useAuth, useCart, useFetch, useSite, useToast } from '../../context'
import { I } from '../../components/Icons'
import { Empty, ErrorBox, Field, Modal, SkeletonRows, Spinner, Status } from '../../components/ui'
import { PageHead, Stat } from '../../components/Shell'
import { useConfirm } from '../../components/Confirm'
import { QuoteSummary, useQuote, PageHero } from '../public/Catalog'

/* ================================================================ dashboard */
export function Dashboard() {
  const { data: d, loading, error, reload } = useFetch('/api/me/dashboard')
  if (loading) return <SkeletonRows n={6} />
  if (error) return <ErrorBox error={error} retry={reload} />
  const active = d.active_subscriptions
  return (
    <>
      <PageHead title={`Hello, ${d.user.name.split(' ')[0]} 👋`} sub="Here's your milk at a glance.">
        <Link to="/subscriptions" className="btn btn-navy"><I.plus size={16} /> New subscription</Link>
      </PageHead>
      {!d.user.email_verified && <VerifyBanner />}
      <div className="stats">
        <Stat icon="box" value={active.length} label="Active plans" />
        <Stat icon="truck" value={d.stats.delivered} label="Deliveries received" tone="green" delay={1} />
        <Stat icon="card" value={inr(d.stats.total_paid)} label="Total paid" tone="gold" delay={2} />
        <Stat icon="calendar" value={active.reduce((n, x) => Math.max(n, x.remaining_days), 0)} label="Days remaining" delay={3} />
      </div>
      <div className="cols-2">
        <div>
          <div className="hero-card" style={{ marginBottom: 20 }}>
            {d.next_delivery ? (
              <>
                <div style={{ opacity: .8, fontSize: 13 }}>Next delivery</div>
                <h3 style={{ fontSize: 24, margin: '4px 0 10px' }}>{fmtDate(d.next_delivery.date, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{d.next_delivery.items.map((i) => <span key={i.variant_id} className="pill" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>{i.daily_qty} × {i.product} {i.size}</span>)}</div>
                <Link to={`/account/subscriptions/${d.next_delivery.subscription_id}`} className="btn btn-gold btn-sm" style={{ marginTop: 16 }}>Manage · skip a day</Link>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 22 }}>No upcoming deliveries</h3>
                <p style={{ opacity: .85 }}>{d.trial.eligible ? 'Start with a free 1-day trial – no payment needed.' : 'Start a new plan to keep fresh milk coming.'}</p>
                <Link to="/subscriptions" className="btn btn-gold btn-sm">{d.trial.eligible ? 'Claim free trial' : 'Choose a plan'}</Link>
              </>
            )}
          </div>
          {!d.today_delivery && active.length > 0 && <div className="panel"><div className="panel-head"><h3>Today's delivery</h3><span className="pill grey">No delivery today</span></div></div>}
          {d.today_delivery && (
            <div className="panel"><div className="panel-head"><h3>Today's delivery</h3><Status s={d.today_delivery.status} /></div>
              <div className="panel-body"><ul className="timeline-v">{d.today_delivery.tracking.map((t, i) => <li key={i}><b style={{ textTransform: 'capitalize' }}>{t.status.replace(/_/g, ' ')}</b> <span className="muted">· {fmtDateTime(t.created_at)}</span>{t.note && <div className="muted">{t.note}</div>}</li>)}</ul></div>
            </div>
          )}
          {active[0] && (
            <div className="panel"><div className="panel-head"><h3>Active subscription</h3><Status s={active[0].status} /></div>
              <div className="panel-body grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><div className="muted text-xs">Plan</div><b className="text-navy-ink">{active[0].plan}</b></div>
                <div><div className="muted text-xs">Milk type & packet</div><b className="text-navy-ink">{active[0].items.map((i) => `${i.product} ${i.size}`).join(', ')}</b></div>
                <div><div className="muted text-xs">Daily quantity</div><b className="text-navy-ink">{active[0].items.reduce((n, i) => n + i.daily_qty, 0)} packet(s)</b></div>
                <div><div className="muted text-xs">Remaining days</div><b className="text-navy-ink text-xl">{active[0].remaining_days}</b> <span className="muted">of {active[0].duration_days}</span></div>
              </div>
            </div>
          )}
          <div className="panel">
            <div className="panel-head"><h3>My plans</h3><Link to="/account/subscriptions" className="btn btn-ghost btn-sm">View all</Link></div>
            {active.length ? active.map((s) => <SubRow key={s.id} s={s} />) : <Empty icon="calendar" title="No active plans" />}
          </div>
        </div>
        <div>
          <div className="panel">
            <div className="panel-head"><h3>Notifications</h3><Link to="/account/notifications" className="btn btn-ghost btn-sm">All</Link></div>
            <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
              {d.notifications.length ? d.notifications.map((n) => <div key={n.id} style={{ fontSize: 13.5 }}><b style={{ color: n.is_read ? 'var(--muted)' : 'var(--navy-ink)' }}>{n.title}</b><div className="muted">{n.message}</div></div>) : <span className="muted">Nothing yet.</span>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Recent payments</h3><Link to="/account/payments" className="btn btn-ghost btn-sm">All</Link></div>
            <div className="table-wrap"><table className="t"><tbody>{d.recent_payments.map((p) => <tr key={p.id}><td>{fmtDate(p.created_at)}<div className="small">{p.order_number}</div></td><td className="strong">{inr(p.amount)}</td><td><Status s={p.status} /></td></tr>)}</tbody></table></div>
            {!d.recent_payments.length && <div className="panel-body muted">No payments yet.</div>}
          </div>
        </div>
      </div>
    </>
  )
}

function VerifyBanner() {
  const toast = useToast()
  const [sent, setSent] = useState(null)
  const send = async () => { try { const r = await api.post('/api/auth/resend-verification'); setSent(r); toast.success(r.message) } catch (e) { toast.error(e) } }
  return (
    <div className="notice warn" style={{ marginBottom: 18, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>Please verify your email address to secure your account.</span>
      {sent?.dev_verify_token ? <Link to={`/verify-email?token=${sent.dev_verify_token}`}>(Dev) Verify now</Link> : <button className="btn btn-sm btn-outline" onClick={send}>Send link</button>}
    </div>
  )
}

function SubRow({ s }) {
  const total = s.duration_days
  const start = new Date(s.start_date), end = new Date(s.end_date)
  const span = (end - start) / 864e5 + 1
  const done = Math.max(0, Math.min(span, (new Date(todayISO()) - start) / 864e5))
  return (
    <Link to={`/account/subscriptions/${s.id}`} style={{ display: 'block', padding: '14px 20px', borderBottom: '1px solid #F1F4F7', color: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div><b style={{ color: 'var(--navy-ink)' }}>{s.plan}</b> <span className="muted" style={{ fontSize: 13 }}>#{s.id}</span><div className="muted" style={{ fontSize: 13 }}>{s.items.map((i) => `${i.daily_qty}× ${i.product} ${i.size}`).join(' · ')}</div></div>
        <Status s={s.status} />
      </div>
      <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${(done / span) * 100}%` }} /></div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{fmtDate(s.start_date)} → {fmtDate(s.end_date)} · {total}-day plan{['active', 'paused'].includes(s.status) && ` · ${s.remaining_days} days left`}</div>
    </Link>
  )
}

/* ================================================================ addresses */
const EMPTY_ADDR = { label: 'Home', line1: '', line2: '', landmark: '', area: '', city: '', pincode: '', instructions: '', is_default: false }

export function AddressForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState({ ...EMPTY_ADDR, ...(initial || {}) })
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)
  const [pinInfo, setPinInfo] = useState(null)
  const toast = useToast()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  useEffect(() => {
    if (/^\d{6}$/.test(f.pincode)) api.get(`/api/public/pincode/${f.pincode}`).then((r) => { setPinInfo(r); if (r.serviceable) setF((x) => ({ ...x, area: x.area || r.area, city: r.city })) }).catch(() => {})
    else setPinInfo(null)
    // eslint-disable-next-line
  }, [f.pincode])
  const save = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.line1.trim()) v.line1 = 'Required'
    if (!/^\d{6}$/.test(f.pincode)) v.pincode = 'Enter a 6-digit PIN code'
    setErr(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const r = initial?.id ? await api.put(`/api/me/addresses/${initial.id}`, f) : await api.post('/api/me/addresses', f)
      toast.success('Address saved'); onSaved(r)
    } catch (e2) { setErr({ [e2.field || 'form']: e2.message }) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} noValidate>
      {err.form && <div className="notice err">{err.form}</div>}
      <div className="form-row">
        <Field label="Label" id="a-l"><select id="a-l" className="input" value={f.label} onChange={set('label')}><option>Home</option><option>Work</option><option>Parents</option><option>Other</option></select></Field>
        <Field label="PIN code" error={err.pincode} id="a-pin" hint={pinInfo ? (pinInfo.serviceable ? `✓ We deliver to ${pinInfo.area}, ${pinInfo.city}` : '✗ Not serviceable yet') : ''}><input id="a-pin" className={`input ${err.pincode ? 'err' : ''}`} inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <Field label="House / flat, building, street" error={err.line1} id="a-1"><input id="a-1" className={`input ${err.line1 ? 'err' : ''}`} value={f.line1} onChange={set('line1')} /></Field>
      <Field label="Road / colony" id="a-2"><input id="a-2" className="input" value={f.line2 || ''} onChange={set('line2')} /></Field>
      <div className="form-row">
        <Field label="Landmark" id="a-lm"><input id="a-lm" className="input" value={f.landmark || ''} onChange={set('landmark')} /></Field>
        <Field label="Area" id="a-ar"><input id="a-ar" className="input" value={f.area || ''} onChange={set('area')} /></Field>
      </div>
      <Field label="City" id="a-city" hint="Filled in from the PIN code"><input id="a-city" className="input" value={f.city || ''} readOnly placeholder="Enter a PIN code above" /></Field>
      <Field label="Delivery instructions" id="a-in"><input id="a-in" className="input" placeholder="e.g. leave at the door, ring once" value={f.instructions || ''} onChange={set('instructions')} /></Field>
      <label className="check"><input type="checkbox" checked={!!f.is_default} onChange={set('is_default')} /> Make this my default address</label>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-navy" disabled={busy}>{busy && <Spinner />} Save address</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

export function Addresses() {
  const { data, loading, reload } = useFetch('/api/me/addresses')
  const [edit, setEdit] = useState(null)
  const toast = useToast()
  const confirm = useConfirm()
  const del = async (a) => {
    if (!(await confirm({ title: `Remove address “${a.label}”?`, message: a.full, confirmLabel: 'Remove', danger: true }))) return
    try { await api.del(`/api/me/addresses/${a.id}`); toast.success('Address removed'); reload() } catch (e) { toast.error(e) }
  }
  return (
    <>
      <PageHead title="My Addresses" sub="Save home, work or family addresses for delivery."><button className="btn btn-navy" onClick={() => setEdit({})}><I.plus size={16} /> Add address</button></PageHead>
      {loading ? <SkeletonRows /> : !data.length ? <div className="panel"><Empty icon="map" title="No saved addresses" action={<button className="btn btn-navy" onClick={() => setEdit({})}>Add address</button>} /></div> : (
        <div className="cols-even">
          {data.map((a) => (
            <div key={a.id} className="panel"><div className="panel-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <b style={{ color: 'var(--navy-ink)' }}>{a.label} {a.is_default && <span className="pill blue">Default</span>}</b>
                {a.serviceable ? <span className="pill green">Serviceable</span> : <span className="pill red">Not serviceable</span>}
              </div>
              <p style={{ fontSize: 14, margin: '8px 0' }}>{a.full}</p>
              {a.instructions && <p className="muted" style={{ fontSize: 13, margin: 0 }}>“{a.instructions}”</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-sm btn-outline" onClick={() => setEdit(a)}><I.edit size={15} /> Edit</button><button className="btn btn-sm btn-danger" onClick={() => del(a)}><I.trash size={15} /> Delete</button></div>
            </div></div>
          ))}
        </div>
      )}
      {edit && <Modal title={edit.id ? 'Edit address' : 'Add address'} onClose={() => setEdit(null)}><AddressForm initial={edit.id ? edit : null} onSaved={() => { setEdit(null); reload() }} onCancel={() => setEdit(null)} /></Modal>}
    </>
  )
}

/* ================================================================ checkout */
export function Checkout() {
  const cart = useCart()
  const nav = useNavigate()
  const toast = useToast()
  const { data: addresses, reload } = useFetch('/api/me/addresses')
  const { data: plans } = useFetch('/api/public/plans')
  const [addressId, setAddressId] = useState(null)
  const [start, setStart] = useState(addDays(1))
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const idem = useRef(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())
  const { q, loading, error } = useQuote(cart.cart.items, cart.cart.plan_id, start)
  const offline = useSite().payment_provider === 'offline'
  useEffect(() => { if (addresses?.length && !addressId) setAddressId((addresses.find((a) => a.is_default && a.serviceable) || addresses.find((a) => a.serviceable) || addresses[0]).id) }, [addresses, addressId])
  const addr = addresses?.find((a) => a.id === addressId)

  if (!cart.cart.items.length) return <><PageHero title="Checkout" /><div className="container section"><div className="card"><Empty icon="cart" title="Your cart is empty" action={<Link to="/subscriptions" className="btn btn-navy">Choose milk</Link>} /></div></div></>

  const place = async () => {
    if (!addr) { toast.error('Please add a delivery address'); return }
    if (!addr.serviceable) { toast.error(`We don't deliver to ${addr.pincode} yet`); return }
    setBusy(true)
    try {
      const r = await api.post('/api/me/checkout', { items: cart.cart.items.map(({ variant_id, daily_qty }) => ({ variant_id, daily_qty })), plan_id: cart.cart.plan_id, start_date: start, address_id: addressId }, { headers: { 'Idempotency-Key': idem.current } })
      cart.clear()
      if (r.payment) nav(`/pay/${r.payment.provider_order_id}`, { state: { payment: r.payment } })
      else { toast.success('Free trial booked!'); nav(`/account/subscriptions/${r.subscription.id}?new=1`) }
    } catch (e) { toast.error(e); idem.current = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHero title="Checkout" sub="Confirm address, start date and pay securely." crumbs={<><Link to="/cart">Cart</Link> / Checkout</>} />
      <div className="page-bg"><section className="section container">
        <div className="builder">
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ fontSize: 18, margin: 0 }}>1. Delivery address</h3><button className="btn btn-sm btn-outline" onClick={() => setAdding(true)}><I.plus size={15} /> New</button></div>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {addresses?.map((a) => (
                  <div key={a.id} className={`addr-card ${a.id === addressId ? 'on' : ''}`} role="radio" aria-checked={a.id === addressId} tabIndex={0} onClick={() => setAddressId(a.id)} onKeyDown={(e) => e.key === 'Enter' && setAddressId(a.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{a.label}</b>{a.serviceable ? <span className="pill green">Delivers</span> : <span className="pill red">Not serviceable</span>}</div>
                    <div style={{ fontSize: 13.5 }}>{a.full}</div>
                  </div>
                ))}
                {addresses && !addresses.length && <div className="notice info">Add your delivery address to continue.</div>}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18 }}>2. Plan & start date</h3>
              <div className="form-row">
                <Field label="Plan" id="co-plan"><select id="co-plan" className="input" value={cart.cart.plan_id || ''} onChange={(e) => cart.setPlan(Number(e.target.value))}>{plans?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.duration_days} day{p.duration_days > 1 ? 's' : ''})</option>)}</select></Field>
                <Field label="Start date" id="co-start" hint="Deliveries start from tomorrow"><input id="co-start" type="date" className="input" min={addDays(1)} max={addDays(30)} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{cart.cart.items.map((i) => `${i.daily_qty} × ${i.product} ${i.size}`).join(' · ')} per day · <Link to="/cart">edit</Link></div>
            </div>
            <div className="notice info"><I.lock /> {offline ? 'After you confirm, pay by UPI or cash. Your plan is activated as soon as our team verifies the payment.' : 'Paid plans are confirmed only after your payment is verified by our server.'} You can skip days or pause later from your dashboard.</div>
          </div>
          <QuoteSummary q={q} loading={loading} error={error}>
            <button className="btn btn-navy btn-block btn-lg" style={{ marginTop: 14 }} disabled={!q || busy || !addr?.serviceable} onClick={place}>
              {busy && <Spinner />} {q?.total === 0 ? 'Confirm free trial' : offline ? `Confirm booking · ${q ? inr(q.total) : ''}` : `Pay ${q ? inr(q.total) : ''} securely`}
            </button>
          </QuoteSummary>
        </div>
      </section></div>
      {adding && <Modal title="Add address" onClose={() => setAdding(false)}><AddressForm onSaved={(a) => { setAdding(false); reload(); setAddressId(a.id) }} onCancel={() => setAdding(false)} /></Modal>}
    </>
  )
}

/* ================================================================ payment */
function loadRazorpay() {
  return new Promise((res, rej) => {
    if (window.Razorpay) return res()
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window'))
    document.body.appendChild(s)
  })
}

export function Pay() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const { data, loading, error } = useFetch(`/api/me/payments/status/${orderId}`)
  const [method, setMethod] = useState('upi')
  const [busy, setBusy] = useState(false)
  const done = (r) => nav(`/account/subscriptions/${r.subscription.id}?${r.payment.status === 'success' ? 'paid=1' : 'failed=1'}`, { replace: true })

  useEffect(() => { if (data?.payment?.status === 'success') done(data) /* eslint-disable-next-line */ }, [data])
  if (loading) return <div className="container section"><SkeletonRows /></div>
  if (error) return <div className="container section"><ErrorBox error={error} /></div>
  const p = data.payment

  const mock = async (outcome) => {
    setBusy(true)
    try { done(await api.post(`/api/me/payments/mock/${orderId}`, { outcome, method })) } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const razorpay = async () => {
    setBusy(true)
    try {
      await loadRazorpay()
      let pay = data.checkout
      if (p.status === 'failed') pay = (await api.post(`/api/me/subscriptions/${data.subscription.id}/retry-payment`)).payment
      const rz = new window.Razorpay({
        key: pay.key_id, order_id: pay.provider_order_id, amount: pay.amount_paise, currency: 'INR', name: 'Aditya Milk Dairy',
        description: `Order ${data.order.order_number}`, prefill: { name: user.name, email: user.email, contact: user.phone },
        theme: { color: '#073B70' },
        handler: async (resp) => { try { done(await api.post('/api/me/payments/verify', resp)) } catch (e) { toast.error(e) } },
        modal: { ondismiss: () => setBusy(false) },
      })
      rz.on('payment.failed', () => toast.error('Payment failed. Please try again.'))
      rz.open()
    } catch (e) { toast.error(e); setBusy(false) }
  }
  return (
    <>
      <PageHero title={p.provider === 'offline' ? 'Complete Your Booking' : 'Secure Payment'} sub={`Order ${data.order.order_number}`} />
      <div className="page-bg"><section className="section container">
        <div className="card mock-gateway">
          <div style={{ textAlign: 'center' }}><div className="muted">Amount payable</div><div style={{ fontSize: 34, fontWeight: 700, color: 'var(--navy)' }}>{inr(p.amount)}</div><div className="muted" style={{ fontSize: 13 }}>{data.subscription.plan} · starts {fmtDate(data.subscription.start_date)}</div></div>
          {p.status === 'failed' ? (
            <>
              <div className="notice err" style={{ marginTop: 16 }}>This payment attempt failed{p.failure_reason ? `: ${p.failure_reason}` : ''}.</div>
              <button className="btn btn-navy btn-block btn-lg" style={{ marginTop: 14 }} disabled={busy} onClick={async () => {
                try { const r = await api.post(`/api/me/subscriptions/${data.subscription.id}/retry-payment`); nav(`/pay/${r.payment.provider_order_id}`, { replace: true }) } catch (e) { toast.error(e) }
              }}>Try again</button>
            </>
          ) : p.provider === 'offline' ? (
            <OfflinePay pay={data.checkout} order={data.order} />
          ) : p.provider === 'razorpay' ? (
            <button className="btn btn-navy btn-block btn-lg" style={{ marginTop: 20 }} onClick={razorpay} disabled={busy}>{busy && <Spinner />} Pay with UPI / Card / Netbanking</button>
          ) : (
            <>
              <div className="notice warn" style={{ marginTop: 16 }}>Test payment mode – no real money is charged. Set <code>PAYMENT_PROVIDER=razorpay</code> on the server for live payments.</div>
              <div className="methods">{[['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net Banking'], ['wallet', 'Wallet']].map(([k, l]) => <div key={k} className={`m ${method === k ? 'on' : ''}`} onClick={() => setMethod(k)} role="radio" aria-checked={method === k} tabIndex={0}>{l}</div>)}</div>
              <button className="btn btn-navy btn-block btn-lg" onClick={() => mock('success')} disabled={busy}>{busy && <Spinner />} Pay {inr(p.amount)}</button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => mock('failed')} disabled={busy}>Simulate failed payment</button>
            </>
          )}
          <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 14 }}><I.lock size={14} /> Payments are verified on our server before your plan is confirmed.</p>
        </div>
      </section></div>
    </>
  )
}

function OfflinePay({ pay, order }) {
  const toast = useToast()
  const upiLink = pay.upi_id ? `upi://pay?pa=${encodeURIComponent(pay.upi_id)}&pn=${encodeURIComponent(pay.upi_name)}&am=${pay.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(order.order_number)}` : null
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied')).catch(() => {})
  return (
    <div className="mt-4">
      <div className="notice ok mb-3"><I.check size={18} />Booking reserved! Order <b>{order.order_number}</b></div>
      {pay.upi_id ? (
        <div className="rounded-card border-2 border-sky p-4 bg-sky-light/50 text-center">
          <div className="muted text-xs uppercase tracking-wide font-semibold">Pay by UPI to</div>
          <div className="text-xl font-bold text-navy-ink my-1 break-all">{pay.upi_id}</div>
          <div className="flex gap-2 justify-center flex-wrap mt-2">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => copy(pay.upi_id)}>Copy UPI ID</button>
            <a className="btn btn-sm btn-navy" href={upiLink}>Open UPI app</a>
          </div>
          <div className="muted text-xs mt-2">Use your order number <b>{order.order_number}</b> as the payment note.</div>
        </div>
      ) : null}
      <p className="text-sm text-[#2B3846]">{pay.instructions || 'Pay by UPI or cash. Your plan is confirmed once our team verifies the payment.'}</p>
      {pay.support_phone && <p className="text-sm muted">Questions? Call or WhatsApp <a href={`tel:${pay.support_phone.replace(/\s/g, '')}`} className="font-semibold">{pay.support_phone}</a></p>}
      <Link to="/account/subscriptions" className="btn btn-navy btn-block">Go to My Subscriptions</Link>
    </div>
  )
}

/* ================================================================ subscriptions */
export function MySubscriptions() {
  const [status, setStatus] = useState('')
  const { data, loading } = useFetch(`/api/me/subscriptions${status ? `?status=${status}` : ''}`)
  return (
    <>
      <PageHead title="My Subscriptions" sub="Active, paused, completed and cancelled plans."><Link to="/subscriptions" className="btn btn-navy"><I.plus size={16} /> New plan</Link></PageHead>
      <div className="tabs">{[['', 'All'], ['active', 'Active'], ['paused', 'Paused'], ['pending_payment', 'Awaiting payment'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="panel">{loading ? <SkeletonRows /> : data.length ? data.map((s) => <SubRow key={s.id} s={s} />) : <Empty icon="calendar" title="No subscriptions here" action={<Link to="/subscriptions" className="btn btn-navy">Start one</Link>} />}</div>
    </>
  )
}

export function SubscriptionDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { data: s, loading, error, reload } = useFetch(`/api/me/subscriptions/${id}`)
  const toast = useToast()
  const nav = useNavigate()
  const [modal, setModal] = useState(null)
  const [val, setVal] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const act = async (action, body) => {
    setBusy(true)
    try { const r = await api.post(`/api/me/subscriptions/${id}/${action}`, body); toast.success(r.message); setModal(null); reload() } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const retry = async () => { try { const r = await api.post(`/api/me/subscriptions/${id}/retry-payment`); nav(`/pay/${r.payment.provider_order_id}`) } catch (e) { toast.error(e) } }
  const days = useMemo(() => {
    if (!s) return []
    const map = Object.fromEntries((s.deliveries || []).map((d) => [d.delivery_date, d.status]))
    const out = []; const t = todayISO()
    for (let d = new Date(s.start_date + 'T00:00:00'); d <= new Date(s.end_date + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      const iso = addDays(0, d)
      out.push({ iso, day: d.getDate(), status: map[iso] || (s.skips.includes(iso) ? 'skipped' : iso >= t && ['active', 'paused'].includes(s.status) ? 'upcoming' : ''), today: iso === t })
    }
    return out
  }, [s])
  if (loading) return <SkeletonRows n={6} />
  if (error) return <ErrorBox error={error} />
  return (
    <>
      {params.get('paid') && <div className="notice ok" style={{ marginBottom: 16 }}><I.check /> Payment successful! Your subscription is confirmed.</div>}
      {params.get('new') && <div className="notice ok" style={{ marginBottom: 16 }}><I.check /> Your free trial is booked. Enjoy!</div>}
      {params.get('failed') && <div className="notice err" style={{ marginBottom: 16 }}>Payment did not go through. You can retry below.</div>}
      {s.status === 'pending_approval' && <div className="notice info mb-4"><I.approve size={18} />Payment received – your booking is awaiting a quick approval by our team. You'll be notified once it's active.</div>}
      <PageHead title={`${s.plan} plan · #${s.id}`} sub={`${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}${['active', 'paused'].includes(s.status) ? ` · ${s.remaining_days} days remaining` : ''}`}>
        <Status s={s.status} />
      </PageHead>
      <div className="cols-2">
        <div>
          <div className="panel">
            <div className="panel-head"><h3>Delivery calendar</h3><span className="muted" style={{ fontSize: 12 }}>🟩 delivered · 🟥 missed · 🟨 skipped · 🟦 upcoming</span></div>
            <div className="panel-body">
              <div className="cal">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="h">{d}</div>)}
                {days.length > 0 && Array.from({ length: new Date(days[0].iso + 'T00:00:00').getDay() }).map((_, i) => <div key={'e' + i} />)}
                {days.map((d) => <div key={d.iso} title={`${d.iso} ${d.status}`} className={`d ${d.status} ${d.today ? 'today' : ''}`}>{d.day}</div>)}
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Delivery history</h3></div>
            <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Status</th><th>Delivered by</th><th>Note</th></tr></thead><tbody>
              {s.deliveries.slice().reverse().map((d) => <tr key={d.id}><td className="strong">{fmtDate(d.delivery_date)}</td><td><Status s={d.status} /></td><td>{d.staff || '—'}</td><td className="small">{d.note}</td></tr>)}
            </tbody></table></div>
            {!s.deliveries.length && <div className="panel-body muted">Deliveries will appear here from {fmtDate(s.start_date)}.</div>}
          </div>
        </div>
        <div>
          <div className="panel"><div className="panel-head"><h3>Plan details</h3></div><div className="panel-body">
            <dl className="kv">
              <dt>Milk / day</dt><dd>{s.items.map((i) => <div key={i.variant_id}>{i.daily_qty} × {i.product} {i.size} @ {inr(i.unit_price)}</div>)}</dd>
              <dt>Amount</dt><dd>{s.is_trial ? 'Free trial' : inr(s.total_amount)}</dd>
              <dt>Address</dt><dd>{s.address?.full}</dd>
              {s.skip_requests.length > 0 && <><dt>Skip requests</dt><dd>{s.skip_requests.map((k) => <div key={k.id}>{fmtDate(k.date, { day: 'numeric', month: 'short' })} <Status s={k.status} /></div>)}</dd></>}
              {s.paused_from && <><dt>Paused from</dt><dd>{fmtDate(s.paused_from)}</dd></>}
              {s.cancel_reason && <><dt>Cancelled</dt><dd>{s.cancel_reason}</dd></>}
              {s.refund_due > 0 && <><dt>Refund due</dt><dd>{inr(s.refund_due)}</dd></>}
            </dl>
          </div></div>
          <div className="panel"><div className="panel-head"><h3>Manage</h3></div><div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            {s.status === 'pending_payment' && s.payments?.some((p) => p.provider === 'offline' && p.status === 'created') ? (
              <Link to={`/pay/${s.payments.find((p) => p.provider === 'offline' && p.status === 'created').provider_order_id}`} className="btn btn-gold">How to pay</Link>
            ) : ['pending_payment', 'failed'].includes(s.status) && !s.is_trial && <button className="btn btn-gold" onClick={retry}>Complete payment</button>}
            {s.status === 'active' && <>
              <button className="btn btn-outline" onClick={() => { setVal(addDays(1)); setModal('skip') }}><I.skip size={16} /> Skip a day</button>
              <button className="btn btn-outline" onClick={() => { setVal(addDays(1)); setModal('pause') }}><I.pause size={16} /> Pause deliveries</button>
            </>}
            {s.status === 'paused' && <button className="btn btn-navy" onClick={() => { setVal(addDays(1)); setModal('resume') }}>Resume deliveries</button>}
            {['active', 'paused', 'pending_payment', 'failed', 'pending_approval'].includes(s.status) && <button className="btn btn-danger" onClick={() => { setVal(''); setModal('cancel') }}>Cancel subscription</button>}
            {['completed', 'cancelled'].includes(s.status) && <Link to="/subscriptions" className="btn btn-navy">Renew / new plan</Link>}
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Skipped and paused days are added to the end of your plan. See our <Link to="/policy/refund">refund policy</Link>.</p>
          </div></div>
          {s.payments?.length > 0 && <div className="panel"><div className="panel-head"><h3>Payments</h3></div><table className="t"><tbody>{s.payments.map((p) => <tr key={p.id}><td>{fmtDate(p.created_at)}<div className="small">{p.transaction_id || p.provider_order_id}</div></td><td className="strong">{inr(p.amount)}</td><td><Status s={p.status} /></td></tr>)}</tbody></table></div>}
        </div>
      </div>
      {modal && (
        <Modal title={{ skip: 'Skip a delivery', pause: 'Pause deliveries', resume: 'Resume deliveries', cancel: 'Cancel subscription' }[modal]} onClose={() => setModal(null)}>
          {modal === 'cancel' ? (
            <>
              <div className="notice warn" style={{ marginBottom: 12 }}>Undelivered days will be refunded as per our refund policy. This cannot be undone.</div>
              <Field label="Reason (optional)" id="cr"><textarea id="cr" className="input" value={val} onChange={(e) => setVal(e.target.value)} /></Field>
              <button className="btn btn-danger" disabled={busy} onClick={() => act('cancel', { reason: val })}>{busy && <Spinner />} Yes, cancel</button>
            </>
          ) : (
            <>
              <Field label={modal === 'skip' ? 'Date to skip' : modal === 'pause' ? 'Pause from' : 'Resume on'} id="md" hint={modal === 'pause' ? 'You can resume any time (max 15 days).' : modal === 'skip' ? 'Once approved, the skipped day is added to the end of your plan.' : ''}>
                <input id="md" type="date" className="input" min={addDays(1)} max={modal === 'skip' ? s.end_date : undefined} value={val} onChange={(e) => setVal(e.target.value)} />
              </Field>
              {modal === 'skip' && <Field label="Reason (optional)" id="mr2"><input id="mr2" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. travelling" /></Field>}
              <button className="btn btn-navy" disabled={busy || !val} onClick={() => act(modal, modal === 'pause' ? { from_date: val } : { date: val, reason })}>{busy && <Spinner />} Confirm</button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

/* ================================================================ deliveries, payments, notifications */
export function Orders() {
  const { data, loading } = useFetch('/api/me/orders')
  return (
    <>
      <PageHead title="My Orders" sub="Every booking you've placed, with its payment and subscription status."><Link to="/subscriptions" className="btn btn-navy"><I.plus size={16} /> New order</Link></PageHead>
      <div className="panel">
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="orders" title="No orders yet" action={<Link to="/subscriptions" className="btn btn-navy">Start a subscription</Link>} /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Order</th><th>Date</th><th>Plan</th><th>Milk / day</th><th>Amount</th><th>Payment</th><th>Subscription</th></tr></thead><tbody>
            {data.map((o) => (
              <tr key={o.id}>
                <td className="strong">{o.subscription_id ? <Link to={`/account/subscriptions/${o.subscription_id}`}>{o.order_number}</Link> : o.order_number}</td>
                <td className="small">{fmtDateTime(o.created_at)}</td>
                <td>{o.plan?.name}</td>
                <td className="small">{o.items.map((i) => `${i.daily_qty}× ${i.product} ${i.size}`).join(', ')}</td>
                <td className="strong">{o.total ? inr(o.total) : 'Free'}{o.discount > 0 && <div className="small">saved {inr(o.discount)}</div>}</td>
                <td>{o.payment_status ? <Status s={o.payment_status === 'free' ? 'confirmed' : o.payment_status} /> : '—'}</td>
                <td>{o.subscription_status ? <Status s={o.subscription_status} /> : '—'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </>
  )
}

export function Deliveries() {
  const [status, setStatus] = useState('')
  const { data, loading } = useFetch(`/api/me/deliveries${status ? `?status=${status}` : ''}`)
  return (
    <>
      <PageHead title="Delivery History" sub="Daily delivery status, missed deliveries and history." />
      <div className="tabs">{[['', 'All'], ['delivered', 'Delivered'], ['missed', 'Missed'], ['skipped', 'Skipped'], ['assigned', 'Upcoming']].map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <div className="panel">
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="truck" title="No deliveries yet" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Milk</th><th>Status</th><th>Delivery partner</th><th>Updates</th></tr></thead><tbody>
            {data.map((d) => <tr key={d.id}><td className="strong">{fmtDate(d.delivery_date)}</td><td>{d.items.map((i) => `${i.qty}× ${i.product} ${i.size}`).join(', ')}</td><td><Status s={d.status} /></td><td>{d.staff || '—'}</td><td className="small">{d.tracking.slice(-1)[0] && `${d.tracking.slice(-1)[0].note || ''} · ${fmtDateTime(d.tracking.slice(-1)[0].created_at)}`}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </>
  )
}

export function Payments() {
  const { data, loading } = useFetch('/api/me/payments')
  const [receipt, setReceipt] = useState(null)
  const toast = useToast()
  const open = async (p) => { try { setReceipt(await api.get(`/api/me/payments/${p.id}/receipt`)) } catch (e) { toast.error(e) } }
  return (
    <>
      <PageHead title="Payments" sub="Transaction references, status and receipts." />
      <div className="panel">
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="card" title="No payments yet" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Order</th><th>Transaction ID</th><th>Method</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
            {data.map((p) => <tr key={p.id}><td>{fmtDateTime(p.updated_at || p.created_at)}</td><td className="strong">{p.order_number}</td><td className="small">{p.transaction_id || '—'}</td><td style={{ textTransform: 'uppercase', fontSize: 12 }}>{p.method || '—'}</td><td className="strong">{inr(p.amount)}{p.refund_amount > 0 && <div className="small">Refunded {inr(p.refund_amount)}</div>}</td><td><Status s={p.status} />{p.failure_reason && <div className="small">{p.failure_reason}</div>}</td>
              <td>{['success', 'refunded'].includes(p.status) && <button className="btn btn-sm btn-outline" onClick={() => open(p)}>Receipt</button>}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
      {receipt && <Modal title="Payment receipt" onClose={() => setReceipt(null)}><Receipt r={receipt} /></Modal>}
    </>
  )
}

function Receipt({ r }) {
  const { payment: p, order: o, customer: c } = r
  return (
    <div className="receipt">
      <div className="rh"><div><b className="serif" style={{ fontSize: 20, color: 'var(--navy)' }}>Aditya Milk Dairy</b><div className="muted" style={{ fontSize: 12 }}>Vijayawada, Andhra Pradesh</div></div><div style={{ textAlign: 'right' }}><b>Receipt {p.receipt_number}</b><div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(p.updated_at)}</div></div></div>
      <dl className="kv"><dt>Billed to</dt><dd>{c.name}<br />{c.phone} · {c.email}</dd><dt>Order</dt><dd>{o.order_number}</dd><dt>Plan</dt><dd>{o.plan?.name} ({o.plan?.duration_days} days)</dd><dt>Transaction</dt><dd>{p.transaction_id} · {p.method}</dd><dt>Deliver to</dt><dd>{o.address?.full}</dd></dl>
      <table className="t" style={{ marginTop: 14 }}><thead><tr><th>Item</th><th>Qty/day</th><th>Days</th><th>Rate</th><th>Amount</th></tr></thead><tbody>
        {o.items.map((i) => <tr key={i.variant_id}><td>{i.product} {i.size}</td><td>{i.daily_qty}</td><td>{i.days}</td><td>{inr(i.unit_price)}</td><td>{inr(i.line_total)}</td></tr>)}
        <tr><td colSpan={4}>Subtotal</td><td>{inr(o.subtotal)}</td></tr>
        {o.discount > 0 && <tr><td colSpan={4}>Discount</td><td>− {inr(o.discount)}</td></tr>}
        <tr><td colSpan={4} className="strong">Total paid</td><td className="strong">{inr(p.amount)}</td></tr>
        {p.refund_amount > 0 && <tr><td colSpan={4}>Refunded</td><td>− {inr(p.refund_amount)}</td></tr>}
      </tbody></table>
      <button className="btn btn-navy no-print" style={{ marginTop: 16 }} onClick={() => window.print()}><I.download size={16} /> Print / Save PDF</button>
    </div>
  )
}

export function Notifications({ admin }) {
  const base = admin ? '/api/admin/notifications' : '/api/me/notifications'
  const { data, loading, reload } = useFetch(base)
  const markAll = async () => { await api.post(`${base}/read`); reload() }
  return (
    <>
      <PageHead title="Notifications"><button className="btn btn-outline btn-sm" onClick={markAll}>Mark all read</button></PageHead>
      <div className="panel">
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="bell" title="No notifications" /> : data.map((n) => (
          <div key={n.id} style={{ padding: '14px 20px', borderBottom: '1px solid #F1F4F7', background: n.is_read ? '#fff' : '#F6FBFE' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b style={{ color: 'var(--navy-ink)' }}>{n.title}</b><span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(n.created_at)}</span></div>
            <div style={{ fontSize: 14 }}>{n.message}</div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ================================================================ profile, support, reviews */
export function Profile() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const { data: me } = useFetch('/api/auth/me')
  const [f, setF] = useState(null)
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  useEffect(() => { if (me) setF({ full_name: me.name, phone: me.phone || '', alt_phone: me.profile?.alt_phone || '', preferred_time: me.profile?.preferred_time || '' }) }, [me])
  const save = async (e) => { e.preventDefault(); try { const u = await api.put('/api/me/profile', f); setUser({ ...user, ...u }); toast.success('Profile updated') } catch (e2) { toast.error(e2) } }
  const change = async (e) => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) { toast.error('New passwords do not match'); return }
    try { await api.put('/api/me/password', pw); toast.success('Password changed'); setPw({ current_password: '', new_password: '', confirm: '' }) } catch (e2) { toast.error(e2) }
  }
  if (!f) return <SkeletonRows />
  return (
    <>
      <PageHead title="Profile & Security" />
      <div className="cols-even">
        <div className="panel"><div className="panel-head"><h3>Personal details</h3></div><form className="panel-body" onSubmit={save}>
          <Field label="Full name" id="p-n"><input id="p-n" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Email" id="p-e" hint={me.email_verified ? '✓ Verified' : 'Not verified'}><input id="p-e" className="input" value={me.email} disabled /></Field>
          <div className="form-row">
            <Field label="Mobile" id="p-m"><input id="p-m" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Alternate mobile" id="p-a"><input id="p-a" className="input" value={f.alt_phone} onChange={(e) => setF({ ...f, alt_phone: e.target.value })} /></Field>
          </div>
          <Field label="Preferred delivery window" id="p-t"><select id="p-t" className="input" value={f.preferred_time} onChange={(e) => setF({ ...f, preferred_time: e.target.value })}><option>5:30 AM - 6:30 AM</option><option>6:00 AM - 8:00 AM</option><option>6:30 AM - 7:30 AM</option><option>7:00 AM - 8:00 AM</option></select></Field>
          <button className="btn btn-navy">Save changes</button>
        </form></div>
        <div className="panel"><div className="panel-head"><h3>Change password</h3></div><form className="panel-body" onSubmit={change}>
          <Field label="Current password" id="c-1"><input id="c-1" type="password" className="input" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters with a letter and a number" id="c-2"><input id="c-2" type="password" className="input" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Field label="Confirm new password" id="c-3"><input id="c-3" type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <button className="btn btn-navy">Update password</button>
        </form></div>
      </div>
    </>
  )
}

export function Support() {
  const { data, loading, reload } = useFetch('/api/me/support')
  const { user } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ kind: 'support', subject: '', message: '' })
  const submit = async (e) => {
    e.preventDefault()
    if (f.message.trim().length < 5) { toast.error('Please describe the issue'); return }
    try { await api.post('/api/public/contact', { ...f, name: user.name, email: user.email, phone: user.phone }); toast.success('Ticket raised. We will get back to you soon.'); setF({ kind: 'support', subject: '', message: '' }); reload() } catch (e2) { toast.error(e2) }
  }
  return (
    <>
      <PageHead title="Help & Support" sub="Raise an enquiry or complaint – our team replies here and by email." />
      <div className="cols-2">
        <div className="panel"><div className="panel-head"><h3>My tickets</h3></div>
          {loading ? <SkeletonRows /> : !data.length ? <Empty icon="chat" title="No tickets yet" /> : data.map((t) => (
            <div key={t.id} style={{ padding: '14px 20px', borderBottom: '1px solid #F1F4F7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b>{t.subject || t.kind}</b><Status s={t.status} /></div>
              <div style={{ fontSize: 14 }}>{t.message}</div>
              {t.admin_reply && <div className="notice info" style={{ marginTop: 8 }}><b>Reply:</b>&nbsp;{t.admin_reply}</div>}
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{fmtDateTime(t.created_at)}</div>
            </div>
          ))}
        </div>
        <div className="panel"><div className="panel-head"><h3>New ticket</h3></div><form className="panel-body" onSubmit={submit}>
          <Field label="Type" id="s-k"><select id="s-k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="support">Order / delivery help</option><option value="complaint">Complaint</option><option value="enquiry">General question</option></select></Field>
          <Field label="Subject" id="s-s"><input id="s-s" className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Message" id="s-m"><textarea id="s-m" className="input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <button className="btn btn-navy">Submit</button>
        </form></div>
      </div>
    </>
  )
}

export function Reviews() {
  const { data, reload } = useFetch('/api/me/reviews')
  const toast = useToast()
  const [f, setF] = useState({ rating: 5, comment: '' })
  const submit = async (e) => {
    e.preventDefault()
    try { const r = await api.post('/api/me/reviews', f); toast.success(r.message); setF({ rating: 5, comment: '' }); reload() } catch (e2) { toast.error(e2) }
  }
  return (
    <>
      <PageHead title="My Reviews" sub="Reviews appear on the website after approval." />
      <div className="cols-even">
        <div className="panel"><div className="panel-head"><h3>Write a review</h3></div><form className="panel-body" onSubmit={submit}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }} role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} onClick={() => setF({ ...f, rating: n })} aria-label={`${n} stars`} style={{ background: 'none', border: 0, fontSize: 30, cursor: 'pointer', color: n <= f.rating ? 'var(--gold-2)' : '#DDD' }}>★</button>)}
          </div>
          <Field label="Your experience" id="rv"><textarea id="rv" className="input" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} required /></Field>
          <button className="btn btn-navy">Submit review</button>
        </form></div>
        <div className="panel"><div className="panel-head"><h3>Submitted</h3></div>
          {data?.length ? data.map((r) => <div key={r.id} style={{ padding: '12px 20px', borderBottom: '1px solid #F1F4F7' }}><div className="stars">{'★'.repeat(r.rating)}</div><div style={{ fontSize: 14 }}>{r.comment}</div><span className={`pill ${r.is_approved ? 'green' : 'amber'}`}>{r.is_approved ? 'Published' : 'Awaiting approval'}</span></div>) : <Empty icon="star" title="No reviews yet" />}
        </div>
      </div>
    </>
  )
}
