import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, addDays, fmtDate, todayISO, waLink } from '../../api'
import { useAuth, useFetch, useToast } from '../../context'
import { I } from '../../components/Icons'
import { Empty, Logo, Modal, SkeletonRows, Status, Field } from '../../components/ui'

/** Mobile-first delivery partner view: today's route list with one-tap status updates. */
export default function StaffApp() {
  const [date, setDate] = useState(todayISO())
  const [view, setView] = useState('route')
  const { data, loading, reload } = useFetch(view === 'route' ? `/api/staff/deliveries?date=${date}` : null)
  const { user, logout } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [miss, setMiss] = useState(null)
  const set = async (id, status, note) => {
    try { await api.post(`/api/staff/deliveries/${id}/status`, { status, note }); toast.success(`Marked ${status.replace(/_/g, ' ')}`); setMiss(null); reload() } catch (e) { toast.error(e) }
  }
  const rows = data?.deliveries || []
  const done = rows.filter((r) => ['delivered', 'missed'].includes(r.status)).length
  const totals = rows.reduce((acc, r) => { if (!['skipped', 'cancelled'].includes(r.status)) r.items.forEach((i) => { const k = `${i.product} ${i.size}`; acc[k] = (acc[k] || 0) + i.qty }); return acc }, {})
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, var(--sky-light), var(--cream))' }}>
      <header style={{ background: '#fff', boxShadow: 'var(--shadow-sm)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
        <Logo to="/staff" />
        <button className="btn btn-ghost btn-sm" onClick={() => { logout(); nav('/login') }}><I.logout size={16} /> Log out</button>
      </header>
      <div className="staff-app">
        <h2 className="serif" style={{ margin: '6px 0 2px' }}>Hi {user?.name?.split(' ')[0]} 👋</h2>
        <div className="tabs !my-2">{[['route', 'My deliveries'], ['history', 'Completed history']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        {view === 'history' ? <History /> : <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          {[[todayISO(), 'Today'], [addDays(1), 'Tomorrow']].map(([d, l]) => <button key={d} className={`btn btn-sm ${date === d ? 'btn-navy' : 'btn-outline'}`} onClick={() => setDate(d)}>{l}</button>)}
          <input type="date" className="input" style={{ width: 'auto', padding: '7px 10px' }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        </div>
        <div className="hero-card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, opacity: .85 }}>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          <h3 style={{ fontSize: 26, margin: '2px 0 8px' }}>{done} / {rows.length} done</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{Object.entries(totals).map(([k, v]) => <span key={k} className="pill" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>{v} × {k}</span>)}</div>
        </div>
        {loading ? <SkeletonRows /> : !rows.length ? <div className="card"><Empty icon="truck" title="No deliveries assigned" text="Your list will appear once the admin generates it." /></div> : rows.map((r, idx) => (
          <div key={r.id} className={`staff-card ${r.status}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ color: 'var(--navy-ink)' }}>{idx + 1}. {r.customer}</b><Status s={r.status} />
            </div>
            <div style={{ fontSize: 14, margin: '6px 0' }}>{r.address}</div>
            {r.instructions && <div className="notice info" style={{ padding: '6px 10px', fontSize: 13, marginBottom: 6 }}>{r.instructions}</div>}
            <div style={{ fontSize: 14, marginBottom: 10 }}>{r.items.map((i, k) => <span key={k} className={`pill ${i.extra ? 'gold' : 'blue'}`} style={{ marginRight: 6 }}>{i.qty} × {i.product} {i.size}{i.extra && ' · EXTRA'}</span>)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn-sm btn-outline" href={`tel:${r.phone}`}><I.phone size={15} /> Call</a>
              {waLink(r.phone) && <a className="btn btn-sm btn-outline wa-btn" href={waLink(r.phone, `Hi ${r.customer?.split(' ')[0] || ''}, this is your Aditya Milk Dairy delivery partner.`)} target="_blank" rel="noreferrer"><I.whatsapp width={15} height={15} /> WhatsApp</a>}
              <a className="btn btn-sm btn-outline" href={r.map_url || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.address)}`} target="_blank" rel="noreferrer"><I.map size={15} /> {r.lat != null ? 'Navigate (pin)' : 'Navigate'}</a>
              {r.status === 'assigned' && <button className="btn btn-sm btn-cream" onClick={() => set(r.id, 'out_for_delivery')}>Start</button>}
              {['assigned', 'out_for_delivery'].includes(r.status) && <>
                <button className="btn btn-sm btn-navy" onClick={() => set(r.id, 'delivered')}><I.check size={15} /> Delivered</button>
                <button className="btn btn-sm btn-danger" onClick={() => setMiss({ id: r.id, note: '' })}>Missed</button>
              </>}
            </div>
          </div>
        ))}
        </>}
      </div>
      {miss && <Modal title="Why was it missed?" onClose={() => setMiss(null)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>{['Customer not available', 'Gate locked', 'Address not found', 'Customer refused', 'Ran out of stock'].map((n) => <button key={n} className={`btn btn-sm ${miss.note === n ? 'btn-navy' : 'btn-outline'}`} onClick={() => setMiss({ ...miss, note: n })}>{n}</button>)}</div>
        <Field label="Or type a reason" id="mr"><input id="mr" className="input" value={miss.note} onChange={(e) => setMiss({ ...miss, note: e.target.value })} /></Field>
        <button className="btn btn-danger" disabled={!miss.note} onClick={() => set(miss.id, 'missed', miss.note)}>Mark missed</button>
      </Modal>}
    </div>
  )
}

function History() {
  const { data, loading } = useFetch('/api/staff/history?days=30')
  if (loading) return <SkeletonRows />
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="card !p-4 text-center"><div className="text-2xl font-bold text-green-700">{data.delivered}</div><div className="muted text-xs">Delivered (30 days)</div></div>
        <div className="card !p-4 text-center"><div className="text-2xl font-bold text-red-700">{data.missed}</div><div className="muted text-xs">Missed (30 days)</div></div>
      </div>
      {!data.deliveries.length ? <div className="card"><Empty icon="history" title="No completed deliveries yet" /></div> : data.deliveries.map((r) => (
        <div key={r.id} className={`staff-card ${r.status}`}>
          <div className="flex justify-between gap-2"><b className="text-navy-ink">{r.customer}</b><Status s={r.status} /></div>
          <div className="muted text-xs mt-0.5">{fmtDate(r.delivery_date)} · {r.items.map((i) => `${i.qty}× ${i.product} ${i.size}`).join(', ')}</div>
          {r.note && r.status === 'missed' && <div className="text-xs mt-1">Reason: {r.note}</div>}
        </div>
      ))}
    </>
  )
}
