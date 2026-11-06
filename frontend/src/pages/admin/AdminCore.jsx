import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, addDays, fmtDate, fmtDateTime, inr, todayISO } from '../../api'
import { useFetch, useToast } from '../../context'
import { I } from '../../components/Icons'
import { Empty, ErrorBox, Field, Modal, Pager, SkeletonRows, Spinner, Status } from '../../components/ui'
import { PageHead, Stat } from '../../components/Shell'
import { AreaTrend, Bars, Donut } from '../../components/charts'
import { useConfirm } from '../../components/Confirm'

/* ================================================================ dashboard */
export function AdminDashboard() {
  const { data: d, loading, error, reload } = useFetch('/api/admin/dashboard')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [rev, setRev] = useState('daily')
  if (loading) return <SkeletonRows n={8} />
  if (error) return <ErrorBox error={error} retry={reload} />
  const c = d.cards
  const gen = async () => {
    setBusy(true)
    try { const r = await api.post('/api/admin/deliveries/generate', { date: todayISO() }); toast.success(`Generated ${r.created} deliveries (${r.already_existed} existed)`); reload() } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const revData = rev === 'daily' ? d.revenue_chart.labels.map((label, i) => ({ label, value: d.revenue_chart.values[i] }))
    : rev === 'weekly' ? d.weekly_revenue : d.monthly_revenue
  return (
    <>
      <PageHead title="Good morning ☀️" sub={fmtDate(todayISO(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
        <button className="btn btn-navy" onClick={gen} disabled={busy}>{busy ? <Spinner /> : <I.refresh size={16} />} Generate today's deliveries</button>
        <Link to="/admin/deliveries" className="btn btn-outline">Open delivery sheet</Link>
      </PageHead>
      {!c.schedule_generated_today && c.active_subscriptions > 0 && <div className="notice warn mb-4"><I.alert size={18} />Today's delivery list hasn't been generated yet.</div>}
      {(c.pending_approvals > 0 || c.pending_skips > 0) && (
        <div className="notice info mb-4 flex flex-wrap items-center gap-3">
          <span className="flex-1"><I.approve size={18} />{c.pending_approvals} booking(s) and {c.pending_skips} skip request(s) are waiting for approval.</span>
          <Link to="/admin/bookings?tab=approvals" className="btn btn-sm btn-navy">Review</Link>
        </div>
      )}
      <div className="stats">
        <Stat icon="users" value={c.customers} label="Total customers" />
        <Stat icon="calendar" value={c.active_subscriptions} label={`Active subscriptions${c.paused_subscriptions ? ` · ${c.paused_subscriptions} paused` : ''}`} tone="green" delay={1} />
        <Stat icon="orders" value={c.todays_orders} label={`Today's orders · ${c.todays_paid_orders} paid`} delay={2} />
        <Stat icon="truck" value={`${c.delivered_today}/${c.todays_deliveries}`} label={`Today's deliveries · ${c.pending_deliveries} pending`} delay={3} />
        <Stat icon="card" value={inr(c.revenue_month)} label={`Monthly revenue · ${inr(c.revenue_week)} this week`} tone="gold" delay={4} />
        <Stat icon="drop" value={`${c.cow_milk_litres_today} L`} label="Cow milk demand today" delay={5} />
        <Stat icon="drop" value={`${c.buffalo_milk_litres_today} L`} label="Buffalo milk demand today" tone="gold" delay={6} />
        <Stat icon="alert" value={c.missed_today} label={`Missed today · ${c.open_enquiries} open enquiries`} tone="red" delay={7} />
      </div>
      <div className="cols-2">
        <div className="panel"><div className="panel-head"><h3>Sales</h3>
          <div className="tabs !mb-0">{[['daily', 'Last 14 days'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => <button key={k} className={rev === k ? 'on' : ''} onClick={() => setRev(k)}>{l}</button>)}</div></div>
          <div className="panel-body">{rev === 'daily' ? <AreaTrend data={revData} /> : <Bars data={revData} series={[{ key: 'value', name: 'Revenue' }]} money />}</div>
        </div>
        <div className="panel"><div className="panel-head"><h3>Subscription analytics</h3></div>
          <div className="panel-body">
            <Donut data={d.plan_mix} />
            <div className="flex flex-wrap gap-1.5 mt-2">{Object.entries(d.subscription_status).map(([k, v]) => <span key={k} className="pill grey cap">{k.replace(/_/g, ' ')}: {v}</span>)}</div>
          </div>
        </div>
      </div>
      <div className="cols-even">
        <div className="panel"><div className="panel-head"><h3>Delivery performance – last 7 days</h3></div>
          <div className="panel-body"><Bars data={d.delivery_performance} stacked height={240} series={[{ key: 'delivered', name: 'Delivered', color: '#2E9E5B' }, { key: 'missed', name: 'Missed', color: '#E0413A' }, { key: 'skipped', name: 'Skipped', color: '#E8B75C' }]} /></div>
        </div>
        <div className="panel"><div className="panel-head"><h3>Tomorrow's milk demand</h3><span className="pill blue">{d.tomorrow_demand.total_litres} L total</span></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Milk</th><th>Packet</th><th>Packets</th><th>Litres</th></tr></thead><tbody>
            {Object.values(d.tomorrow_demand.by_variant).map((v, i) => <tr key={i}><td className="strong">{v.product}</td><td>{v.size}</td><td>{v.packets}</td><td>{v.litres} L</td></tr>)}
          </tbody></table></div>
          {!Object.keys(d.tomorrow_demand.by_variant).length && <div className="panel-body muted">No deliveries scheduled for tomorrow.</div>}
          {d.low_stock.length > 0 && <div className="panel-body"><div className="notice warn">Low stock: {d.low_stock.map((v) => `${v.product_name} ${v.label} (${v.stock_litres} L available, ${v.needed_litres} L needed)`).join('; ')}</div></div>}
        </div>
      </div>
      <div className="cols-even">
        <div className="panel"><div className="panel-head"><h3>Recent bookings</h3><Link to="/admin/bookings" className="btn btn-ghost btn-sm">All</Link></div>
          <div className="table-wrap"><table className="t"><tbody>
            {d.recent_bookings.map((s) => <tr key={s.id}><td><Link to={`/admin/bookings/${s.id}`} className="strong">{s.customer}</Link><div className="small">{s.plan} · {s.items.map((i) => `${i.daily_qty}×${i.product.split(' ')[0]} ${i.size}`).join(', ')}</div></td><td className="strong">{s.is_trial ? 'Trial' : inr(s.total_amount)}</td><td><Status s={s.status} /></td></tr>)}
          </tbody></table></div>
        </div>
        <div className="panel"><div className="panel-head"><h3>Recent payments</h3><Link to="/admin/payments" className="btn btn-ghost btn-sm">All</Link></div>
          <div className="table-wrap"><table className="t"><tbody>
            {d.recent_payments.map((p) => <tr key={p.id}><td className="strong">{p.customer}<div className="small">{p.order_number} · {fmtDateTime(p.updated_at || p.created_at)}</div></td><td className="strong">{inr(p.amount)}</td><td><Status s={p.status} /></td></tr>)}
          </tbody></table></div>
          {!d.recent_payments.length && <div className="panel-body muted">No payments yet.</div>}
        </div>
      </div>
    </>
  )
}

/* ================================================================ bookings */
function BookingsList() {
  const [f, setF] = useState({ status: '', q: '', page: 1 })
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, meta, loading } = useFetch(`/api/admin/subscriptions?${qs}`)
  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div className="filters">
            <input className="input" placeholder="Search name, phone, order #" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
              <option value="">All statuses</option>{['active', 'pending_approval', 'paused', 'pending_payment', 'completed', 'cancelled', 'failed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        {loading ? <SkeletonRows /> : !data.length ? <Empty title="No bookings found" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>#</th><th>Customer</th><th>Plan</th><th>Milk / day</th><th>Dates</th><th>Amount</th><th>Status</th></tr></thead><tbody>
            {data.map((s) => <tr key={s.id}><td><Link to={`/admin/bookings/${s.id}`} className="strong">#{s.id}</Link><div className="small">{s.order_number}</div></td><td className="strong">{s.customer}<div className="small">{s.customer_phone} · {s.address?.pincode}</div></td><td>{s.plan}</td><td className="small">{s.items.map((i) => `${i.daily_qty}× ${i.product} ${i.size}`).join(', ')}</td><td className="small">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</td><td className="strong">{s.is_trial ? 'Free' : inr(s.total_amount)}</td><td><Status s={s.status} /></td></tr>)}
          </tbody></table></div>
        )}
        <Pager meta={meta?.meta} onPage={(page) => setF({ ...f, page })} />
      </div>
    </>
  )
}

export function Bookings() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'all'
  const { data: dash } = useFetch('/api/admin/dashboard')
  const c = dash?.cards || {}
  return (
    <>
      <PageHead title="Bookings & Subscriptions" sub="All customer selections, approvals, skip requests, payment status and dates." />
      <div className="tabs">
        {[['all', 'All bookings'], ['approvals', `Awaiting approval${c.pending_approvals ? ` (${c.pending_approvals})` : ''}`], ['skips', `Skip requests${c.pending_skips ? ` (${c.pending_skips})` : ''}`]].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'all' ? {} : { tab: k })}>{l}</button>
        ))}
      </div>
      {tab === 'all' && <BookingsList />}
      {tab === 'approvals' && <Approvals />}
      {tab === 'skips' && <SkipRequests />}
    </>
  )
}

function Approvals() {
  const { data, loading, reload } = useFetch('/api/admin/subscriptions?status=pending_approval&per_page=100')
  const toast = useToast()
  const confirm = useConfirm()
  const act = async (s, action) => {
    let body = {}
    if (action === 'reject') {
      const reason = await confirm({ title: `Reject booking #${s.id}?`, message: 'The customer is notified and a full refund is marked as due.', input: { label: 'Reason', required: true }, confirmLabel: 'Reject', danger: true })
      if (!reason) return
      body = { reason }
    }
    try { await api.post(`/api/admin/subscriptions/${s.id}/${action}`, body); toast.success(action === 'approve' ? 'Booking approved and activated' : 'Booking rejected'); reload() } catch (e) { toast.error(e) }
  }
  return (
    <div className="panel">
      <div className="panel-body !pb-0"><p className="muted text-sm m-0">Paid bookings wait here when <b>“Bookings require admin approval”</b> is on in Settings. Approving activates the plan; if the start date has passed it moves to tomorrow so no paid days are lost.</p></div>
      {loading ? <SkeletonRows /> : !data.length ? <Empty icon="approve" title="Nothing awaiting approval" /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>#</th><th>Customer</th><th>Plan & milk</th><th>Start</th><th>Paid</th><th /></tr></thead><tbody>
          {data.map((s) => <tr key={s.id}><td><Link to={`/admin/bookings/${s.id}`} className="strong">#{s.id}</Link></td><td className="strong">{s.customer}<div className="small">{s.customer_phone} · {s.address?.pincode}</div></td><td className="small">{s.plan} · {s.items.map((i) => `${i.daily_qty}× ${i.product} ${i.size}`).join(', ')}</td><td>{fmtDate(s.start_date)}</td><td className="strong">{s.is_trial ? 'Free trial' : inr(s.total_amount)}</td>
            <td className="whitespace-nowrap"><button className="btn btn-sm btn-navy" onClick={() => act(s, 'approve')}><I.check size={15} /> Approve</button> <button className="btn btn-sm btn-danger" onClick={() => act(s, 'reject')}>Reject</button></td></tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}

function SkipRequests() {
  const [status, setStatus] = useState('pending')
  const { data, loading, reload } = useFetch(`/api/admin/skip-requests?status=${status}`)
  const toast = useToast()
  const confirm = useConfirm()
  const act = async (r, action) => {
    let body = {}
    if (action === 'reject') {
      const reason = await confirm({ title: 'Reject skip request?', message: `${r.customer}'s delivery on ${fmtDate(r.date)} will go ahead.`, input: { label: 'Reason for the customer (optional)' }, confirmLabel: 'Reject', danger: true })
      if (reason === false) return
      body = { reason }
    }
    try { await api.post(`/api/admin/skip-requests/${r.id}/${action}`, body); toast.success(action === 'approve' ? 'Skip approved – a day was added to the plan' : 'Skip rejected'); reload() } catch (e) { toast.error(e) }
  }
  return (
    <div className="panel">
      <div className="panel-head"><div className="tabs !mb-0">{['pending', 'approved', 'rejected'].map((k) => <button key={k} className={`cap ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{k}</button>)}</div>
        <span className="muted text-xs">Skips need approval only when enabled in Settings; otherwise they're approved automatically within policy.</span></div>
      {loading ? <SkeletonRows /> : !data.length ? <Empty icon="skip" title={`No ${status} skip requests`} /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Date to skip</th><th>Customer</th><th>Subscription</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((r) => <tr key={r.id}><td className="strong">{fmtDate(r.date)}</td><td>{r.customer}</td><td><Link to={`/admin/bookings/${r.subscription_id}`}>#{r.subscription_id}</Link></td><td className="small">{r.reason || '—'}</td><td><Status s={r.status} /></td>
            <td className="whitespace-nowrap">{r.status === 'pending' && <><button className="btn btn-sm btn-navy" onClick={() => act(r, 'approve')}>Approve</button> <button className="btn btn-sm btn-danger" onClick={() => act(r, 'reject')}>Reject</button></>}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}

export function BookingDetail() {
  const { id } = useParams()
  const { data: s, loading, error, reload } = useFetch(`/api/admin/subscriptions/${id}`)
  const toast = useToast()
  const [modal, setModal] = useState(null)
  const [v, setV] = useState({})
  const act = async (action, body) => {
    try { await api.post(`/api/admin/subscriptions/${id}/${action}`, body); toast.success('Updated'); setModal(null); reload() } catch (e) { toast.error(e) }
  }
  if (loading) return <SkeletonRows n={6} />
  if (error) return <ErrorBox error={error} />
  return (
    <>
      <PageHead title={`Booking #${s.id} · ${s.customer}`} sub={`${s.order_number || ''} · created ${fmtDateTime(s.created_at)}`}>
        <Status s={s.status} />
        {s.status === 'pending_approval' && <button className="btn btn-navy btn-sm" onClick={() => act('approve', {})}><I.check size={15} /> Approve</button>}
        {s.status === 'pending_approval' && <button className="btn btn-danger btn-sm" onClick={() => { setV({ reason: '' }); setModal('reject') }}>Reject</button>}
        {['pending_payment', 'failed'].includes(s.status) && <button className="btn btn-gold btn-sm" onClick={() => { setV({ reference: '', method: 'cash' }); setModal('offline') }}>Record payment (UPI / cash)</button>}
        {s.status === 'active' && <button className="btn btn-outline btn-sm" onClick={() => { setV({ days: 1, reason: '' }); setModal('extend') }}>Extend</button>}
        {s.status === 'active' && <button className="btn btn-outline btn-sm" onClick={() => act('pause', { from_date: addDays(1) })}>Pause from tomorrow</button>}
        {s.status === 'paused' && <button className="btn btn-navy btn-sm" onClick={() => act('resume', { date: addDays(1) })}>Resume</button>}
        {!['cancelled', 'completed'].includes(s.status) && <button className="btn btn-danger btn-sm" onClick={() => { setV({ reason: '' }); setModal('cancel') }}>Cancel</button>}
      </PageHead>
      <div className="cols-2">
        <div>
          <div className="panel"><div className="panel-head"><h3>Selection</h3></div><div className="panel-body"><dl className="kv">
            <dt>Customer</dt><dd><Link to={`/admin/customers/${s.user_id}`}>{s.customer}</Link> · {s.customer_phone}</dd>
            <dt>Plan</dt><dd>{s.plan} ({s.duration_days} days){s.is_trial && ' · Free trial'}</dd>
            <dt>Milk / day</dt><dd>{s.items.map((i) => <div key={i.variant_id}>{i.daily_qty} × {i.product} {i.size} @ {inr(i.unit_price)}</div>)}</dd>
            <dt>Dates</dt><dd>{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</dd>
            <dt>Address</dt><dd>{s.address?.full}{s.address?.instructions && <div className="muted">“{s.address.instructions}”</div>}</dd>
            <dt>Amount</dt><dd>{inr(s.total_amount)}{s.order && s.order.discount > 0 && <span className="muted"> (subtotal {inr(s.order.subtotal)} − {inr(s.order.discount)})</span>}</dd>
            {s.skip_requests.length > 0 && <><dt>Skip requests</dt><dd>{s.skip_requests.map((k) => <div key={k.id}>{fmtDate(k.date)} <Status s={k.status} /></div>)}</dd></>}
            {s.refund_due > 0 && <><dt>Refund due</dt><dd className="strong" style={{ color: 'var(--red)' }}>{inr(s.refund_due)} – process in Payments</dd></>}
            {s.cancel_reason && <><dt>Cancel reason</dt><dd>{s.cancel_reason}</dd></>}
          </dl></div></div>
          <div className="panel"><div className="panel-head"><h3>Deliveries ({s.deliveries.length})</h3></div>
            <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Staff</th><th>Status</th><th>Note</th></tr></thead><tbody>
              {s.deliveries.map((d) => <tr key={d.id}><td>{fmtDate(d.delivery_date)}</td><td>{d.staff || '—'}</td><td><Status s={d.status} /></td><td className="small">{d.note}</td></tr>)}
            </tbody></table></div>
          </div>
        </div>
        <div>
          <div className="panel"><div className="panel-head"><h3>Payments</h3></div>
            <table className="t"><tbody>{s.payments.map((p) => <tr key={p.id}><td className="small">{p.provider}<br />{p.transaction_id || p.provider_order_id}</td><td className="strong">{inr(p.amount)}</td><td><Status s={p.status} /></td></tr>)}</tbody></table>
            {!s.payments.length && <div className="panel-body muted">{s.is_trial ? 'Free trial – no payment.' : 'No payment attempts.'}</div>}
          </div>
          <div className="panel"><div className="panel-head"><h3>Audit history</h3></div><div className="panel-body">
            <ul className="timeline-v">{s.audit.map((a) => <li key={a.id}><b>{a.action.replace(/_/g, ' ')}</b> · {a.by}<div className="muted" style={{ fontSize: 12 }}>{fmtDateTime(a.created_at)} {a.details && Object.keys(a.details).length > 0 && `· ${JSON.stringify(a.details)}`}</div></li>)}</ul>
            {!s.audit.length && <span className="muted">No changes recorded.</span>}
          </div></div>
        </div>
      </div>
      {modal === 'cancel' && <Modal title="Cancel booking" onClose={() => setModal(null)}><Field label="Reason" id="r"><textarea id="r" className="input" value={v.reason} onChange={(e) => setV({ reason: e.target.value })} /></Field><button className="btn btn-danger" onClick={() => act('cancel', v)}>Cancel booking</button></Modal>}
      {modal === 'reject' && <Modal title="Reject booking" onClose={() => setModal(null)}><div className="notice warn mb-3">The customer is notified and a full refund is marked as due in Payments.</div><Field label="Reason" id="rj"><textarea id="rj" className="input" value={v.reason} onChange={(e) => setV({ reason: e.target.value })} /></Field><button className="btn btn-danger" disabled={!v.reason} onClick={() => act('reject', v)}>Reject booking</button></Modal>}
      {modal === 'extend' && <Modal title="Extend plan" onClose={() => setModal(null)}><Field label="Days" id="d"><input id="d" type="number" min="1" max="30" className="input" value={v.days} onChange={(e) => setV({ ...v, days: e.target.value })} /></Field><Field label="Reason" id="er"><input id="er" className="input" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field><button className="btn btn-navy" onClick={() => act('extend', v)}>Extend</button></Modal>}
      {modal === 'offline' && <Modal title="Record cash / bank payment" onClose={() => setModal(null)}><div className="notice info" style={{ marginBottom: 12 }}>Use only when money has been received outside the gateway. This is logged in the audit trail.</div><Field label="Method" id="om"><select id="om" className="input" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi_direct">UPI (direct)</option></select></Field><Field label="Reference / receipt no." id="or"><input id="or" className="input" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} /></Field><button className="btn btn-navy" disabled={!v.reference} onClick={() => act('confirm-offline-payment', v)}>Confirm payment of {inr(s.total_amount)}</button></Modal>}
    </>
  )
}

/* ================================================================ deliveries */
export const MISSED_REASONS = ['Customer not available', 'Gate locked', 'Address not found', 'Customer refused', 'Ran out of stock']
export function Deliveries() {
  const [f, setF] = useState({ date: todayISO(), status: '', city: '', pincode: '', staff_id: '', milk: '', area: '' })
  const { data: areaList } = useFetch('/api/public/service-areas')
  const cityOptions = [...new Set((areaList || []).map((a) => a.city))]
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, meta, loading, reload } = useFetch(`/api/admin/deliveries?${qs}`)
  const { data: staff } = useFetch('/api/admin/staff')
  const { data: products } = useFetch('/api/admin/products')
  const [sel, setSel] = useState([])
  const [assignTo, setAssignTo] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const all = data || []
  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const run = async (fn, msg) => { setBusy(true); try { const r = await fn(); toast.success(msg(r)); setSel([]); reload() } catch (e) { toast.error(e) } finally { setBusy(false) } }
  const generate = () => run(() => api.post('/api/admin/deliveries/generate', { date: f.date }), (r) => `Created ${r.created}, skipped ${r.skipped}, existing ${r.already_existed}`)
  const assign = () => run(() => api.post('/api/admin/deliveries/assign', { ids: sel, staff_id: assignTo || null }), (r) => `${r.updated} deliveries updated`)
  const confirm = useConfirm()
  const askReason = () => confirm({ title: 'Why was it missed?', input: { label: 'Reason', required: true, options: MISSED_REASONS }, confirmLabel: 'Mark missed', danger: true })
  const bulk = async (status) => {
    const note = status === 'missed' ? await askReason() : undefined
    if (status === 'missed' && !note) return
    run(() => api.post('/api/admin/deliveries/status', { ids: sel, status, note }), (r) => `${r.updated} marked ${status.replace(/_/g, ' ')}`)
  }
  const exportCsv = () => api.download(`/api/admin/deliveries/export?${qs}`, `deliveries_${f.date}.csv`).catch((e) => toast.error(e))
  const one = async (id, status) => {
    const note = status === 'missed' ? await askReason() : undefined
    if (status === 'missed' && !note) return
    run(() => api.post('/api/admin/deliveries/status', { ids: [id], status, note }), () => 'Updated')
  }
  const [grouped, setGrouped] = useState(true)
  const groups = grouped ? Object.entries(all.reduce((acc, r) => { const k = r.route || `No route · PIN ${r.pincode}`; (acc[k] = acc[k] || []).push(r); return acc }, {})) : [['', all]]
  const summary = meta?.summary || {}
  const demand = meta?.demand
  return (
    <>
      <PageHead title="Daily Delivery Management" sub="Generate the list, group by route, assign staff and update outcomes.">
        <button className="btn btn-navy" onClick={generate} disabled={busy}><I.refresh size={16} /> Generate for {fmtDate(f.date, { day: 'numeric', month: 'short' })}</button>
        <button className="btn btn-outline" onClick={exportCsv}><I.download size={16} /> Export sheet</button>
        <button className="btn btn-outline" onClick={() => window.print()}>Print</button>
      </PageHead>
      <div className="stats">
        {['scheduled', 'assigned', 'out_for_delivery', 'delivered', 'missed', 'skipped'].map((s, i) => <Stat key={s} icon={{ delivered: 'check', missed: 'close', skipped: 'skip', out_for_delivery: 'truck' }[s] || 'calendar'} value={summary[s] || 0} label={s.replace(/_/g, ' ')} tone={{ delivered: 'green', missed: 'red', skipped: 'gold' }[s]} delay={i} />)}
      </div>
      {demand && demand.total_litres > 0 && <div className="notice info" style={{ marginBottom: 16 }}>Milk to prepare: {Object.entries(demand.by_product).map(([k, v]) => `${k} ${v} L`).join(' · ')} · Total {demand.total_litres} L</div>}
      <div className="panel">
        <div className="panel-head">
          <div className="filters">
            <input type="date" className="input" value={f.date} onChange={(e) => { setF({ ...f, date: e.target.value }); setSel([]) }} aria-label="Date" />
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{['scheduled', 'assigned', 'out_for_delivery', 'delivered', 'missed', 'skipped', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select>
            <select className="input" value={f.staff_id} onChange={(e) => setF({ ...f, staff_id: e.target.value })} aria-label="Delivery person"><option value="">All staff</option><option value="none">Unassigned</option>{staff?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select className="input" value={f.milk} onChange={(e) => setF({ ...f, milk: e.target.value })} aria-label="Milk type"><option value="">All milk</option>{products?.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}</select>
            <select className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} aria-label="City"><option value="">All cities</option>{cityOptions.map((c) => <option key={c}>{c}</option>)}</select>
            <input className="input" placeholder="PIN code" style={{ minWidth: 100, width: 110 }} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
            <input className="input" placeholder="Area" style={{ width: 130 }} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
            <label className="check text-sm"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by route / area</label>
          </div>
        </div>
        {sel.length > 0 && (
          <div className="bulkbar no-print">
            <b>{sel.length} selected</b>
            <select className="input" style={{ width: 'auto', padding: '7px 10px' }} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}><option value="">— Unassign —</option>{staff?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <button className="btn btn-sm btn-navy" onClick={assign} disabled={busy}>Assign</button>
            <span style={{ width: 10 }} />
            <button className="btn btn-sm btn-outline" onClick={() => bulk('out_for_delivery')}>Out for delivery</button>
            <button className="btn btn-sm btn-outline" onClick={() => bulk('delivered')}>Delivered</button>
            <button className="btn btn-sm btn-danger" onClick={() => bulk('missed')}>Missed</button>
          </div>
        )}
        {loading ? <SkeletonRows /> : !all.length ? <Empty icon="truck" title="No deliveries for this date" text="Click “Generate” to build the list from active subscriptions." /> : (
          <div className="table-wrap"><table className="t"><thead><tr>
            <th className="no-print"><input type="checkbox" aria-label="Select all" checked={sel.length === all.length} onChange={(e) => setSel(e.target.checked ? all.map((r) => r.id) : [])} /></th>
            <th>Route</th><th>Customer</th><th>Address</th><th>Milk</th><th>Instructions</th><th>Staff</th><th>Status</th><th className="no-print" />
          </tr></thead>
            {groups.map(([g, rows]) => (
            <tbody key={g || 'all'}>
            {g && <tr className="bg-sky-light/70"><td colSpan={9} className="!py-2"><b className="text-navy-ink"><I.route size={15} className="inline -mt-0.5 mr-1.5" />{g}</b><span className="muted ml-2 text-xs">{rows.length} stop{rows.length > 1 ? 's' : ''} · {rows.reduce((n, r) => n + r.items.reduce((a, i) => a + i.qty, 0), 0)} packets</span></td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="no-print"><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.customer}`} /></td>
                <td className="small">{r.route || <span className="pill amber">No route</span>}</td>
                <td className="strong">{r.customer}<div className="small"><a href={`tel:${r.phone}`}>{r.phone}</a></div></td>
                <td className="small" style={{ maxWidth: 240 }}>{r.address}</td>
                <td>{r.items.map((i, k) => <div key={k} style={{ fontSize: 13 }}><b>{i.qty}</b> × {i.product} {i.size}</div>)}</td>
                <td className="small" style={{ maxWidth: 160 }}>{r.instructions}</td>
                <td>{r.staff || <span className="muted">—</span>}</td>
                <td><Status s={r.status} />{r.note && r.status === 'missed' && <div className="small">{r.note}</div>}</td>
                <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                  {['assigned', 'scheduled', 'out_for_delivery'].includes(r.status) && <><button className="btn btn-sm btn-ghost" title="Delivered" onClick={() => one(r.id, 'delivered')}><I.check size={17} /></button><button className="btn btn-sm btn-ghost" title="Missed" onClick={() => one(r.id, 'missed')}><I.close size={17} /></button></>}
                </td>
              </tr>
            ))}
            </tbody>
            ))}
          </table></div>
        )}
      </div>
    </>
  )
}

/* ================================================================ customers */
export function Customers() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, meta, loading } = useFetch(`/api/admin/customers?q=${encodeURIComponent(q)}&page=${page}`)
  return (
    <>
      <PageHead title="Customers" sub="Search customers and view their history." />
      <div className="panel">
        <div className="panel-head"><div className="filters"><input className="input" placeholder="Search name, email or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} style={{ minWidth: 280 }} /></div></div>
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="users" title="No customers found" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Name</th><th>Contact</th><th>Joined</th><th>Plans</th><th>Lifetime value</th><th>Status</th></tr></thead><tbody>
            {data.map((u) => <tr key={u.id}><td><Link className="strong" to={`/admin/customers/${u.id}`}>{u.name}</Link>{u.trial_used && <div className="small">Trial used</div>}</td><td className="small">{u.email}<br />{u.phone}</td><td className="small">{fmtDate(u.created_at)}</td><td>{u.active} active / {u.subscriptions}</td><td className="strong">{inr(u.lifetime_value)}</td><td>{u.is_active ? <span className="pill green">Active</span> : <span className="pill red">Blocked</span>}</td></tr>)}
          </tbody></table></div>
        )}
        <Pager meta={meta?.meta} onPage={setPage} />
      </div>
    </>
  )
}

export function CustomerDetail() {
  const { id } = useParams()
  const { data: u, loading, reload } = useFetch(`/api/admin/customers/${id}`)
  const toast = useToast()
  const upd = async (body) => { try { await api.put(`/api/admin/customers/${id}`, body); toast.success('Updated'); reload() } catch (e) { toast.error(e) } }
  if (loading) return <SkeletonRows />
  return (
    <>
      <PageHead title={u.name} sub={`${u.email} · ${u.phone} · joined ${fmtDate(u.created_at)}`}>
        <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-navy'}`} onClick={() => upd({ is_active: !u.is_active })}>{u.is_active ? 'Block account' : 'Unblock account'}</button>
        {u.trial_used && <button className="btn btn-sm btn-outline" onClick={() => upd({ trial_used: false })}>Reset trial eligibility</button>}
      </PageHead>
      <div className="cols-2">
        <div className="panel"><div className="panel-head"><h3>Subscriptions</h3></div>
          <div className="table-wrap"><table className="t"><tbody>{u.subscriptions.map((s) => <tr key={s.id}><td><Link to={`/admin/bookings/${s.id}`} className="strong">#{s.id} {s.plan}</Link><div className="small">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</div></td><td>{inr(s.total_amount)}</td><td><Status s={s.status} /></td></tr>)}</tbody></table></div>
          {!u.subscriptions.length && <div className="panel-body muted">No subscriptions.</div>}
        </div>
        <div>
          <div className="panel"><div className="panel-head"><h3>Addresses</h3></div><div className="panel-body">{u.addresses.map((a) => <p key={a.id} style={{ fontSize: 14 }}><b>{a.label}:</b> {a.full}</p>)}{!u.addresses.length && <span className="muted">None</span>}</div></div>
          <div className="panel"><div className="panel-head"><h3>Payments</h3></div><table className="t"><tbody>{u.payments.map((p) => <tr key={p.id}><td className="small">{fmtDate(p.created_at)}</td><td>{inr(p.amount)}</td><td><Status s={p.status} /></td></tr>)}</tbody></table></div>
        </div>
      </div>
    </>
  )
}

/* ================================================================ payments */
export function Payments() {
  const [f, setF] = useState({ status: '', q: '', page: 1 })
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, meta, loading, reload } = useFetch(`/api/admin/payments?${qs}`)
  const [refund, setRefund] = useState(null)
  const toast = useToast()
  const doRefund = async () => {
    try { await api.post(`/api/admin/payments/${refund.id}/refund`, { amount: refund.amount, note: refund.note }); toast.success('Refund recorded'); setRefund(null); reload() } catch (e) { toast.error(e) }
  }
  const t = meta?.totals || {}
  const due = meta?.refunds_due || []
  return (
    <>
      <PageHead title="Payments" sub="Successful, pending and failed transactions, refunds and reconciliation." />
      <div className="stats">
        <Stat icon="check" value={inr(t.success)} label="Successful" tone="green" />
        <Stat icon="calendar" value={inr(t.created)} label="Pending" tone="gold" delay={1} />
        <Stat icon="close" value={inr(t.failed)} label="Failed" tone="red" delay={2} />
        <Stat icon="refresh" value={inr(t.refunds)} label="Refunded" delay={3} />
      </div>
      {due.length > 0 && <div className="notice warn" style={{ marginBottom: 16 }}><div><b>Refunds due:</b> {due.map((s) => <span key={s.id}> <Link to={`/admin/bookings/${s.id}`}>#{s.id} {s.customer}</Link> ({inr(s.refund_due)})</span>)}</div></div>}
      <div className="panel">
        <div className="panel-head"><div className="filters">
          <input className="input" placeholder="Txn ID / order #" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">All</option><option value="success">Success</option><option value="created">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select>
        </div></div>
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="card" title="No payments" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Customer</th><th>Order</th><th>Gateway ref</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
            {data.map((p) => <tr key={p.id}><td className="small">{fmtDateTime(p.updated_at || p.created_at)}</td><td className="strong">{p.customer}</td><td>{p.order_number}</td><td className="small">{p.provider} · {p.transaction_id || p.provider_order_id}<br />{p.receipt_number}</td><td className="strong">{inr(p.amount)}{p.refund_amount > 0 && <div className="small">−{inr(p.refund_amount)} refunded</div>}</td><td><Status s={p.status} />{p.failure_reason && <div className="small">{p.failure_reason}</div>}</td>
              <td>{p.status === 'success' && <button className="btn btn-sm btn-outline" onClick={() => setRefund({ id: p.id, amount: p.amount - p.refund_amount, max: p.amount - p.refund_amount, note: '' })}>Refund</button>}</td></tr>)}
          </tbody></table></div>
        )}
        <Pager meta={meta?.meta} onPage={(page) => setF({ ...f, page })} />
      </div>
      {refund && <Modal title="Issue refund" onClose={() => setRefund(null)}>
        <Field label={`Amount (max ${inr(refund.max)})`} id="ra"><input id="ra" type="number" className="input" value={refund.amount} max={refund.max} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></Field>
        <Field label="Note" id="rn"><input id="rn" className="input" value={refund.note} onChange={(e) => setRefund({ ...refund, note: e.target.value })} placeholder="e.g. Cancelled after 5 deliveries" /></Field>
        <button className="btn btn-navy" onClick={doRefund}>Refund {inr(refund.amount)}</button>
      </Modal>}
    </>
  )
}

/* ================================================================ reports */
export function Reports() {
  const [f, setF] = useState({ from: addDays(-29), to: todayISO(), group: 'day' })
  const { data: r, loading } = useFetch(`/api/admin/reports?${new URLSearchParams(f)}`)
  const toast = useToast()
  const [exp, setExp] = useState('sales')
  const products = r ? [...new Set(Object.values(r.milk_demand).flatMap((x) => Object.keys(x)))] : []
  const download = (type, format) => api.download(`/api/admin/reports/export?${new URLSearchParams({ ...f, type, format })}`, `aditya_${type}_report_${f.from}_${f.to}.${format}`)
    .then(() => toast.success('Report downloaded')).catch((e) => toast.error(e))
  return (
    <>
      <PageHead title="Reports & Analytics" sub="Sales, product revenue, milk demand, subscriptions, payments and delivery performance.">
        <div className="filters">
          <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
          <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" />
          <select className="input" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} aria-label="Group by"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select>
        </div>
      </PageHead>
      <div className="panel"><div className="panel-body flex flex-wrap items-center gap-3">
        <I.sheet size={22} className="text-navy" />
        <b className="text-navy-ink">Export</b>
        <select className="input !w-auto" value={exp} onChange={(e) => setExp(e.target.value)} aria-label="Report type">
          <option value="sales">Sales (daily / weekly / monthly)</option><option value="products">Product-wise sales</option><option value="demand">Cow & buffalo milk demand</option>
          <option value="subscriptions">Customer subscriptions</option><option value="payments">Payments</option><option value="deliveries">Delivery performance</option>
        </select>
        <button className="btn btn-sm btn-outline" onClick={() => download(exp, 'csv')}><I.download size={15} /> CSV</button>
        <button className="btn btn-sm btn-outline" onClick={() => download(exp, 'xlsx')}><I.download size={15} /> Excel</button>
        <span className="flex-1" />
        <button className="btn btn-sm btn-navy" onClick={() => download('all', 'xlsx')}><I.sheet size={15} /> Full workbook (Excel)</button>
      </div></div>
      {loading || !r ? <SkeletonRows n={6} /> : (
        <>
          <div className="stats">
            <Stat icon="card" value={inr(r.totals.revenue)} label="Net revenue" tone="gold" />
            <Stat icon="box" value={r.totals.orders} label="Paid orders" delay={1} />
            <Stat icon="truck" value={r.totals.delivered} label="Deliveries completed" tone="green" delay={2} />
            <Stat icon="chart" value={r.totals.on_time_rate != null ? `${r.totals.on_time_rate}%` : '—'} label={`Success rate · ${r.totals.missed} missed`} delay={3} />
            <Stat icon="users" value={r.subscriptions.trial_conversions.rate != null ? `${r.subscriptions.trial_conversions.rate}%` : '—'} label={`Trial → paid (${r.subscriptions.trial_conversions.converted}/${r.subscriptions.trial_conversions.trials})`} delay={4} />
          </div>
          <div className="cols-2">
            <div className="panel"><div className="panel-head"><h3>Sales</h3></div><div className="panel-body"><Bars money data={r.labels.map((l, i) => ({ label: l, revenue: r.sales[i], orders: r.orders[i] }))} series={[{ key: 'revenue', name: 'Revenue' }]} /></div></div>
            <div className="panel"><div className="panel-head"><h3>Product-wise revenue</h3></div><div className="panel-body"><Donut data={r.product_revenue} money /></div></div>
          </div>
          <div className="cols-even">
            <div className="panel"><div className="panel-head"><h3>Cow & buffalo milk demand (litres)</h3></div><div className="panel-body"><Bars stacked data={r.labels.map((l) => ({ label: l, ...r.milk_demand[l] }))} series={products.map((p, i) => ({ key: p, name: p, color: i ? '#E8B75C' : '#073B70' }))} legend /></div></div>
            <div className="panel"><div className="panel-head"><h3>Delivery performance</h3></div><div className="panel-body"><Bars stacked data={r.labels.map((l) => ({ label: l, ...r.delivery_performance[l] }))} series={[{ key: 'delivered', name: 'Delivered', color: '#2E9E5B' }, { key: 'missed', name: 'Missed', color: '#E0413A' }, { key: 'skipped', name: 'Skipped', color: '#E8B75C' }]} /></div></div>
          </div>
          <div className="cols-even">
            <div className="panel"><div className="panel-head"><h3>Customer subscriptions ({r.subscriptions.new} new)</h3></div><div className="panel-body">
              <Bars height={220} data={Object.entries(r.subscriptions.by_plan).map(([label, n]) => ({ label, n }))} series={[{ key: 'n', name: 'Subscriptions' }]} />
              <div className="flex flex-wrap gap-1.5 mt-2">{Object.entries(r.subscriptions.by_status).map(([k, v]) => <span key={k} className="pill grey cap">{k.replace(/_/g, ' ')}: {v}</span>)}</div>
            </div></div>
            <div className="panel"><div className="panel-head"><h3>Payments & staff performance</h3></div><div className="panel-body">
              <div className="flex flex-wrap gap-1.5 mb-3">{Object.entries(r.payments.by_status).map(([k, v]) => <span key={k} className="pill blue cap">{k}: {inr(v)}</span>)}</div>
              <table className="t"><thead><tr><th>Delivery person</th><th>Delivered</th><th>Missed</th></tr></thead><tbody>
                {Object.entries(r.staff_performance).map(([k, v]) => <tr key={k}><td className="strong">{k}</td><td>{v.delivered || 0}</td><td>{v.missed || 0}</td></tr>)}
              </tbody></table>
            </div></div>
          </div>
        </>
      )}
    </>
  )
}
