import { useEffect, useState } from 'react'
import { api, fmtDate, fmtDateTime, inr } from '../../api'
import { useFetch, useToast } from '../../context'
import { I } from '../../components/Icons'
import { Empty, Field, Modal, Pager, SkeletonRows, Status } from '../../components/ui'
import { PageHead } from '../../components/Shell'
import { useConfirm } from '../../components/Confirm'
import { useAuth } from '../../context'

function useSaver(reload) {
  const toast = useToast()
  return async (fn, msg = 'Saved') => { try { const r = await fn(); toast.success(msg); reload && reload(); return r } catch (e) { toast.error(e); throw e } }
}

/** Confirm, then DELETE. Server refuses deletes that would break history (409) – the message explains. */
function useDelete(reload) {
  const confirm = useConfirm()
  const toast = useToast()
  return async (url, what, extra) => {
    if (!(await confirm({ title: `Delete ${what}?`, message: extra || 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return
    try { await api.del(url); toast.success(`${what[0].toUpperCase()}${what.slice(1)} deleted`); reload && reload() } catch (e) { toast.error(e) }
  }
}

function ImageInput({ value, onChange, accept = 'image/*' }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const up = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true)
    try { const r = await api.upload(file); onChange(r.url) } catch (er) { toast.error(er) } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {value && accept.startsWith('image') && <img src={value} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10 }} />}
      <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="URL or upload" />
      <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }}>{busy ? '…' : 'Upload'}<input type="file" accept={accept} hidden onChange={up} /></label>
    </div>
  )
}

/* ================================================================ products */
export function Products() {
  const { data, loading, reload } = useFetch('/api/admin/products')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [edit, setEdit] = useState(null)
  const [vEdit, setVEdit] = useState(null)
  const submitP = async () => {
    const body = { ...edit, nutrition: Object.fromEntries((edit._nut || '').split('\n').map((l) => l.split(':').map((x) => x.trim())).filter((x) => x[0] && x[1])) }
    delete body._nut; delete body.variants
    await save(() => (edit.id ? api.put(`/api/admin/products/${edit.id}`, body) : api.post('/api/admin/products', body)))
    setEdit(null)
  }
  const submitV = async () => {
    const { id, product_id, ...body } = vEdit
    await save(() => (id ? api.put(`/api/admin/variants/${id}`, body) : api.post(`/api/admin/products/${product_id}/variants`, body)))
    setVEdit(null)
  }
  return (
    <>
      <PageHead title="Products & Pricing" sub="Products, packet variants, prices, daily stock and availability."><button className="btn btn-navy" onClick={() => setEdit({ name: '', tagline: '', description: '', image: '', is_active: true, sort_order: 0, _nut: '' })}><I.plus size={16} /> Add product</button></PageHead>
      {loading ? <SkeletonRows /> : data.map((p) => (
        <div className="panel" key={p.id}>
          <div className="panel-head">
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>{p.image && <img src={p.image} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover' }} />}<div><h3>{p.name} {!p.is_active && <span className="pill red">Hidden</span>}</h3><div className="muted" style={{ fontSize: 13 }}>{p.tagline}</div></div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" aria-label="Delete product" onClick={() => del(`/api/admin/products/${p.id}/permanent`, 'product', 'Products with orders cannot be deleted – hide them instead (Edit → untick Visible).')}><I.trash size={15} /></button>
              <button className="btn btn-sm btn-outline" onClick={() => setEdit({ ...p, _nut: Object.entries(p.nutrition || {}).map(([k, v]) => `${k}: ${v}`).join('\n') })}><I.edit size={15} /> Edit</button>
              <button className="btn btn-sm btn-navy" onClick={() => setVEdit({ product_id: p.id, size_ml: 500, label: '', price: '', mrp: '', stock_litres: 100, low_stock_litres: 20, is_available: true, trial_eligible: true })}><I.plus size={15} /> Variant</button>
            </div>
          </div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Packet</th><th>Price</th><th>MRP</th><th>Daily stock</th><th>Low-stock alert</th><th>Trial</th><th>Status</th><th /></tr></thead><tbody>
            {p.variants.map((v) => <tr key={v.id}><td className="strong">{v.label}</td><td className="strong">{inr(v.price)}</td><td>{v.mrp ? inr(v.mrp) : '—'}</td><td>{v.stock_litres} L</td><td>{v.low_stock_litres} L</td><td>{v.trial_eligible ? '✓' : '—'}</td><td>{v.is_available ? <span className="pill green">Available</span> : <span className="pill red">Unavailable</span>}</td><td className="whitespace-nowrap"><button className="btn btn-sm btn-ghost" onClick={() => setVEdit(v)} aria-label="Edit"><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/variants/${v.id}`, 'packet size', 'Packet sizes that were ever ordered cannot be deleted – mark them unavailable instead.')}><I.trash size={15} /></button></td></tr>)}
          </tbody></table></div>
        </div>
      ))}
      {edit && <Modal title={edit.id ? 'Edit product' : 'New product'} onClose={() => setEdit(null)}>
        <Field label="Name" id="pn"><input id="pn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Tagline" id="pt"><input id="pt" className="input" value={edit.tagline || ''} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} /></Field>
        <Field label="Description" id="pd"><textarea id="pd" className="input" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        <Field label="Image"><ImageInput value={edit.image} onChange={(image) => setEdit({ ...edit, image })} /></Field>
        <Field label="Nutrition (verified values only, one per line: Name: value)" id="pnu"><textarea id="pnu" className="input" placeholder={'Fat: 3.5 g / 100 ml\nProtein: 3.2 g / 100 ml'} value={edit._nut} onChange={(e) => setEdit({ ...edit, _nut: e.target.value })} /></Field>
        <div className="form-row"><Field label="Sort order" id="ps"><input id="ps" type="number" className="input" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
          <label className="check" style={{ marginTop: 26 }}><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Visible on website</label></div>
        <button className="btn btn-navy" onClick={submitP}>Save product</button>
      </Modal>}
      {vEdit && <Modal title={vEdit.id ? 'Edit variant' : 'New variant'} onClose={() => setVEdit(null)}>
        <div className="form-row">
          <Field label="Size (ml)" id="vs"><input id="vs" type="number" className="input" value={vEdit.size_ml} onChange={(e) => setVEdit({ ...vEdit, size_ml: Number(e.target.value) })} /></Field>
          <Field label="Label" id="vl" hint="e.g. 500 ml, 1 L"><input id="vl" className="input" value={vEdit.label || ''} onChange={(e) => setVEdit({ ...vEdit, label: e.target.value })} /></Field>
          <Field label="Price per packet (₹)" id="vp"><input id="vp" type="number" step="0.5" className="input" value={vEdit.price} onChange={(e) => setVEdit({ ...vEdit, price: e.target.value })} /></Field>
          <Field label="MRP (₹)" id="vm"><input id="vm" type="number" className="input" value={vEdit.mrp || ''} onChange={(e) => setVEdit({ ...vEdit, mrp: e.target.value || null })} /></Field>
          <Field label="Daily stock (litres)" id="vst"><input id="vst" type="number" className="input" value={vEdit.stock_litres} onChange={(e) => setVEdit({ ...vEdit, stock_litres: e.target.value })} /></Field>
          <Field label="Low-stock alert at (litres)" id="vlo"><input id="vlo" type="number" className="input" value={vEdit.low_stock_litres} onChange={(e) => setVEdit({ ...vEdit, low_stock_litres: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={vEdit.is_available} onChange={(e) => setVEdit({ ...vEdit, is_available: e.target.checked })} /> Available for booking</label>&nbsp;&nbsp;
        <label className="check"><input type="checkbox" checked={vEdit.trial_eligible} onChange={(e) => setVEdit({ ...vEdit, trial_eligible: e.target.checked })} /> Included in free trial</label>
        <div className="notice info" style={{ margin: '12px 0' }}>Price changes apply to new bookings only. Existing subscriptions keep their booked price.</div>
        <button className="btn btn-navy" onClick={submitV}>Save variant</button>
      </Modal>}
    </>
  )
}

/* ================================================================ plans */
export function Plans() {
  const { data, loading, reload } = useFetch('/api/admin/plans')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [edit, setEdit] = useState(null)
  const submit = async () => { await save(() => (edit.id ? api.put(`/api/admin/plans/${edit.id}`, edit) : api.post('/api/admin/plans', edit))); setEdit(null) }
  return (
    <>
      <PageHead title="Subscription Plans" sub="Durations, discounts, trial rules and activation."><button className="btn btn-navy" onClick={() => setEdit({ code: '', name: '', duration_days: 7, discount_percent: 0, is_trial: false, trial_max_packets: 2, is_popular: false, is_active: true, sort_order: 9, description: '' })}><I.plus size={16} /> Add plan</button></PageHead>
      <div className="panel">{loading ? <SkeletonRows /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Plan</th><th>Code</th><th>Days</th><th>Discount</th><th>Rules</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((p) => <tr key={p.id}><td className="strong">{p.name} {p.is_popular && <span className="pill amber">Most popular</span>}<div className="small">{p.description}</div></td><td>{p.code}</td><td>{p.duration_days}</td><td>{p.is_trial ? '100% (free)' : `${p.discount_percent}%`}</td><td className="small">{p.is_trial ? `Trial · max ${p.trial_max_packets} packets · one per customer` : 'Advance payment'}</td><td>{p.is_active ? <span className="pill green">Active</span> : <span className="pill grey">Inactive</span>}</td><td className="whitespace-nowrap"><button className="btn btn-sm btn-ghost" onClick={() => setEdit(p)} aria-label="Edit"><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/plans/${p.id}`, 'plan', 'Plans that customers have booked cannot be deleted – deactivate them instead.')}><I.trash size={15} /></button></td></tr>)}
        </tbody></table></div>
      )}</div>
      {edit && <Modal title={edit.id ? 'Edit plan' : 'New plan'} onClose={() => setEdit(null)}>
        <div className="form-row">
          <Field label="Name" id="n"><input id="n" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Code" id="c"><input id="c" className="input" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} disabled={!!edit.id} /></Field>
          <Field label="Duration (days)" id="d"><input id="d" type="number" className="input" value={edit.duration_days} onChange={(e) => setEdit({ ...edit, duration_days: Number(e.target.value) })} /></Field>
          <Field label="Discount %" id="dp"><input id="dp" type="number" step="0.5" className="input" value={edit.discount_percent} onChange={(e) => setEdit({ ...edit, discount_percent: Number(e.target.value) })} disabled={edit.is_trial} /></Field>
          {edit.is_trial && <Field label="Trial max packets/day" id="tm"><input id="tm" type="number" className="input" value={edit.trial_max_packets} onChange={(e) => setEdit({ ...edit, trial_max_packets: Number(e.target.value) })} /></Field>}
          <Field label="Sort order" id="so"><input id="so" type="number" className="input" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Description" id="ds"><input id="ds" className="input" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
          <label className="check"><input type="checkbox" checked={edit.is_trial} onChange={(e) => setEdit({ ...edit, is_trial: e.target.checked })} /> Free trial plan</label>
          <label className="check"><input type="checkbox" checked={edit.is_popular} onChange={(e) => setEdit({ ...edit, is_popular: e.target.checked })} /> Mark “Most popular”</label>
          <label className="check"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
        </div>
        <button className="btn btn-navy" onClick={submit}>Save plan</button>
      </Modal>}
    </>
  )
}

/* ================================================================ staff & routes */
export function Staff() {
  const { data: staff, loading, reload } = useFetch('/api/admin/staff')
  const { data: routes, reload: reloadR } = useFetch('/api/admin/routes')
  const save = useSaver(() => { reload(); reloadR() })
  const del = useDelete(() => { reload(); reloadR() })
  const [edit, setEdit] = useState(null)
  const [route, setRoute] = useState(null)
  const submit = async () => { await save(() => (edit.id ? api.put(`/api/admin/staff/${edit.id}`, edit) : api.post('/api/admin/staff', edit))); setEdit(null) }
  const submitR = async () => {
    const body = { ...route, pincodes: String(route.pincodes_text || '').split(/[\s,]+/).filter(Boolean), default_staff_id: route.default_staff_id ? Number(route.default_staff_id) : null }
    delete body.pincodes_text
    await save(() => (route.id ? api.put(`/api/admin/routes/${route.id}`, body) : api.post('/api/admin/routes', body))); setRoute(null)
  }
  return (
    <>
      <PageHead title="Delivery Personnel & Routes" sub="Add staff, assign routes and track performance.">
        <button className="btn btn-outline" onClick={() => setRoute({ name: '', area: '', pincodes_text: '', default_staff_id: '', is_active: true })}><I.route size={16} /> Add route</button>
        <button className="btn btn-navy" onClick={() => setEdit({ name: '', phone: '', vehicle: '', email: '', password: '', is_active: true })}><I.plus size={16} /> Add delivery person</button>
      </PageHead>
      <div className="panel"><div className="panel-head"><h3>Delivery staff</h3></div>{loading ? <SkeletonRows /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Name</th><th>Phone</th><th>Vehicle</th><th>Routes</th><th>Today</th><th>Last 30 days</th><th>App login</th><th /></tr></thead><tbody>
          {staff.map((s) => <tr key={s.id}><td className="strong">{s.name} {!s.is_active && <span className="pill red">Inactive</span>}</td><td>{s.phone}</td><td className="small">{s.vehicle}</td><td className="small">{s.routes.map((r) => r.name).join(', ') || '—'}</td><td>{s.today}</td><td className="small">{s.last30.delivered} delivered · {s.last30.missed} missed{s.last30.success_rate != null && <><br /><b>{s.last30.success_rate}% success</b></>}</td><td className="small">{s.login_email || '—'}</td><td className="whitespace-nowrap"><button className="btn btn-sm btn-ghost" aria-label="Edit" onClick={() => setEdit({ ...s, password: '' })}><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/staff/${s.id}`, 'delivery person', 'People with delivery history cannot be deleted – mark them inactive instead.')}><I.trash size={15} /></button></td></tr>)}
        </tbody></table></div>
      )}</div>
      <div className="panel"><div className="panel-head"><h3>Routes</h3></div>
        <div className="table-wrap"><table className="t"><thead><tr><th>Route</th><th>Area</th><th>PIN codes</th><th>Default staff</th><th /></tr></thead><tbody>
          {routes?.map((r) => <tr key={r.id}><td className="strong">{r.name}</td><td>{r.area}</td><td>{r.pincodes.map((p) => <span key={p} className="pill blue" style={{ margin: 2 }}>{p}</span>)}</td><td>{staff?.find((s) => s.id === r.default_staff_id)?.name || '—'}</td><td className="whitespace-nowrap"><button className="btn btn-sm btn-ghost" aria-label="Edit" onClick={() => setRoute({ ...r, pincodes_text: r.pincodes.join(', ') })}><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/routes/${r.id}`, 'route')}><I.trash size={15} /></button></td></tr>)}
        </tbody></table></div>
      </div>
      {edit && <Modal title={edit.id ? 'Edit delivery person' : 'New delivery person'} onClose={() => setEdit(null)}>
        <div className="form-row">
          <Field label="Name" id="sn"><input id="sn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Phone" id="sp"><input id="sp" className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
        </div>
        <Field label="Vehicle" id="sv"><input id="sv" className="input" value={edit.vehicle || ''} onChange={(e) => setEdit({ ...edit, vehicle: e.target.value })} /></Field>
        {!edit.id && <div className="form-row"><Field label="App login email (optional)" id="se"><input id="se" className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field><Field label="Password" id="spw"><input id="spw" type="password" className="input" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field></div>}
        {edit.id && edit.login_email && <Field label="Reset app password (leave blank to keep)" id="spr"><input id="spr" type="password" className="input" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>}
        <label className="check"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
        <div style={{ marginTop: 14 }}><button className="btn btn-navy" onClick={submit}>Save</button></div>
      </Modal>}
      {route && <Modal title={route.id ? 'Edit route' : 'New route'} onClose={() => setRoute(null)}>
        <Field label="Route name" id="rn"><input id="rn" className="input" value={route.name} onChange={(e) => setRoute({ ...route, name: e.target.value })} /></Field>
        <Field label="Area description" id="ra"><input id="ra" className="input" value={route.area || ''} onChange={(e) => setRoute({ ...route, area: e.target.value })} /></Field>
        <Field label="PIN codes (comma separated)" id="rp"><input id="rp" className="input" value={route.pincodes_text} onChange={(e) => setRoute({ ...route, pincodes_text: e.target.value })} /></Field>
        <Field label="Default delivery person" id="rs"><select id="rs" className="input" value={route.default_staff_id || ''} onChange={(e) => setRoute({ ...route, default_staff_id: e.target.value })}><option value="">— none —</option>{staff?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <button className="btn btn-navy" onClick={submitR}>Save route</button>
      </Modal>}
    </>
  )
}

/* ================================================================ content */
export function Content() {
  const [tab, setTab] = useState('reviews')
  return (
    <>
      <PageHead title="Website Content" sub="Banners, about page, blog, FAQs, testimonials, quality documents and policies." />
      <div className="tabs">{[['reviews', 'Testimonials'], ['blog', 'Blog'], ['quality', 'Quality reports'], ['faqs', 'FAQs'], ['blocks', 'Homepage & About'], ['policies', 'Policies']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'reviews' && <ReviewsAdmin />}
      {tab === 'blog' && <BlogAdmin />}
      {tab === 'quality' && <QualityAdmin />}
      {tab === 'faqs' && <FaqAdmin />}
      {tab === 'blocks' && <BlocksAdmin />}
      {tab === 'policies' && <PoliciesAdmin />}
    </>
  )
}

function ReviewsAdmin() {
  const { data, loading, reload } = useFetch('/api/admin/reviews')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [edit, setEdit] = useState(null)
  return (
    <div className="panel">
      <div className="panel-head"><h3>Customer reviews</h3><button className="btn btn-sm btn-navy" onClick={() => setEdit({ name: '', comment: '', rating: 5, avatar: '', is_approved: true, is_featured: false })}><I.plus size={15} /> Add</button></div>
      <div className="panel-body" style={{ paddingTop: 0 }}><div className="notice warn" style={{ marginTop: 14 }}>Publish only genuine customer reviews. Replace the seeded sample testimonials before launch.</div></div>
      {loading ? <SkeletonRows /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Name</th><th>Rating</th><th>Review</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((r) => <tr key={r.id}><td className="strong">{r.name}<div className="small">{fmtDate(r.created_at)}{r.user_id ? ' · customer' : ''}</div></td><td className="stars" style={{ fontSize: 13 }}>{'★'.repeat(r.rating)}</td><td style={{ maxWidth: 380, fontSize: 13 }}>{r.comment}</td><td>{r.is_approved ? <span className="pill green">Published</span> : <span className="pill amber">Pending</span>} {r.is_featured && <span className="pill blue">Homepage</span>}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn btn-sm btn-outline" onClick={() => save(() => api.put(`/api/admin/reviews/${r.id}`, { is_approved: !r.is_approved }), r.is_approved ? 'Unpublished' : 'Approved')}>{r.is_approved ? 'Unpublish' : 'Approve'}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => save(() => api.put(`/api/admin/reviews/${r.id}`, { is_featured: !r.is_featured }))} title="Toggle homepage"><I.star size={15} /></button>
              <button className="btn btn-sm btn-ghost" onClick={() => setEdit(r)}><I.edit size={15} /></button>
              <button className="btn btn-sm btn-ghost" onClick={() => del(`/api/admin/reviews/${r.id}`, 'review')}><I.trash size={15} /></button>
            </td></tr>)}
        </tbody></table></div>
      )}
      {edit && <Modal title="Review" onClose={() => setEdit(null)}>
        <Field label="Name" id="n"><input id="n" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Rating (1-5)" id="r"><input id="r" type="number" min="1" max="5" className="input" value={edit.rating} onChange={(e) => setEdit({ ...edit, rating: Number(e.target.value) })} /></Field>
        <Field label="Review" id="c"><textarea id="c" className="input" value={edit.comment} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} /></Field>
        <Field label="Photo (with permission)"><ImageInput value={edit.avatar} onChange={(avatar) => setEdit({ ...edit, avatar })} /></Field>
        <button className="btn btn-navy" onClick={async () => { await save(() => (edit.id ? api.put(`/api/admin/reviews/${edit.id}`, edit) : api.post('/api/admin/reviews', edit))); setEdit(null) }}>Save</button>
      </Modal>}
    </div>
  )
}

function BlogAdmin() {
  const { data, loading, reload } = useFetch('/api/admin/blog')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [edit, setEdit] = useState(null)
  return (
    <div className="panel">
      <div className="panel-head"><h3>Articles</h3><button className="btn btn-sm btn-navy" onClick={() => setEdit({ title: '', excerpt: '', body: '', cover_image: '', is_published: true })}><I.plus size={15} /> New article</button></div>
      {loading ? <SkeletonRows /> : !data.length ? <Empty icon="file" title="No articles" /> : (
        <table className="t"><tbody>{data.map((b) => <tr key={b.id}><td className="strong">{b.title}<div className="small">/{b.slug} · {fmtDate(b.created_at)}</div></td><td><Status s={b.is_published ? 'published' : 'draft'} /></td><td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ghost" onClick={() => setEdit(b)}><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" onClick={() => del(`/api/admin/blog/${b.id}`, 'article')}><I.trash size={15} /></button></td></tr>)}</tbody></table>
      )}
      {edit && <Modal wide title={edit.id ? 'Edit article' : 'New article'} onClose={() => setEdit(null)}>
        <Field label="Title" id="t"><input id="t" className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
        <Field label="Excerpt" id="ex"><input id="ex" className="input" value={edit.excerpt || ''} onChange={(e) => setEdit({ ...edit, excerpt: e.target.value })} /></Field>
        <Field label="Cover image"><ImageInput value={edit.cover_image} onChange={(cover_image) => setEdit({ ...edit, cover_image })} /></Field>
        <Field label="Body (blank line between paragraphs)" id="b"><textarea id="b" className="input" style={{ minHeight: 220 }} value={edit.body || ''} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={edit.is_published} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} /> Published</label>
        <div style={{ marginTop: 14 }}><button className="btn btn-navy" onClick={async () => { await save(() => (edit.id ? api.put(`/api/admin/blog/${edit.id}`, edit) : api.post('/api/admin/blog', edit))); setEdit(null) }}>Save article</button></div>
      </Modal>}
    </div>
  )
}

function QualityAdmin() {
  const { data, loading, reload } = useFetch('/api/admin/quality-reports')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [edit, setEdit] = useState(null)
  return (
    <div className="panel">
      <div className="panel-head"><h3>Lab reports & certificates</h3><button className="btn btn-sm btn-navy" onClick={() => setEdit({ title: '', report_type: 'Lab Report', issued_by: '', report_date: '', file_url: '', summary: '', is_published: false })}><I.plus size={15} /> Add report</button></div>
      <div className="panel-body" style={{ paddingTop: 0 }}><div className="notice info" style={{ marginTop: 14 }}>Publish only genuine, current reports from accredited labs or authorities.</div></div>
      {loading ? <SkeletonRows /> : (
        <table className="t"><tbody>{data.map((r) => <tr key={r.id}><td className="strong">{r.title}<div className="small">{r.report_type} · {r.issued_by} · {fmtDate(r.report_date)}</div></td><td>{r.file_url ? <a href={r.file_url} target="_blank" rel="noreferrer">File</a> : <span className="muted">No file</span>}</td><td><Status s={r.is_published ? 'published' : 'draft'} /></td><td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-ghost" onClick={() => setEdit({ ...r, report_date: r.report_date || '' })}><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" onClick={() => del(`/api/admin/quality-reports/${r.id}`, 'report')}><I.trash size={15} /></button></td></tr>)}</tbody></table>
      )}
      {edit && <Modal title="Quality report" onClose={() => setEdit(null)}>
        <Field label="Title" id="t"><input id="t" className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
        <div className="form-row">
          <Field label="Type" id="ty"><select id="ty" className="input" value={edit.report_type} onChange={(e) => setEdit({ ...edit, report_type: e.target.value })}><option>Lab Report</option><option>Certificate</option><option>License</option><option>Audit</option></select></Field>
          <Field label="Report date" id="rd"><input id="rd" type="date" className="input" value={edit.report_date} onChange={(e) => setEdit({ ...edit, report_date: e.target.value })} /></Field>
        </div>
        <Field label="Issued by" id="ib"><input id="ib" className="input" value={edit.issued_by || ''} onChange={(e) => setEdit({ ...edit, issued_by: e.target.value })} /></Field>
        <Field label="File (PDF / image)"><ImageInput accept="application/pdf,image/*" value={edit.file_url} onChange={(file_url) => setEdit({ ...edit, file_url })} /></Field>
        <Field label="Summary" id="su"><textarea id="su" className="input" value={edit.summary || ''} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={edit.is_published} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} /> Publish on website</label>
        <div style={{ marginTop: 14 }}><button className="btn btn-navy" onClick={async () => { await save(() => (edit.id ? api.put(`/api/admin/quality-reports/${edit.id}`, { ...edit, report_date: edit.report_date || null }) : api.post('/api/admin/quality-reports', { ...edit, report_date: edit.report_date || null }))); setEdit(null) }}>Save</button></div>
      </Modal>}
    </div>
  )
}

function useBlock(key) {
  const { data, loading, reload } = useFetch(`/api/admin/content/${key}`)
  const save = useSaver(reload)
  return { data, loading, put: (value) => save(() => api.put(`/api/admin/content/${key}`, { value }), 'Content updated') }
}

function FaqAdmin() {
  const { data, loading, put } = useBlock('faqs')
  const [list, setList] = useState([])
  useEffect(() => { if (data) setList(data) }, [data])
  if (loading) return <SkeletonRows />
  const upd = (i, k, v) => setList(list.map((f, j) => (j === i ? { ...f, [k]: v } : f)))
  return (
    <div className="panel"><div className="panel-head"><h3>FAQs</h3><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-sm btn-outline" onClick={() => setList([...list, { q: '', a: '', cat: 'General' }])}><I.plus size={15} /> Add</button><button className="btn btn-sm btn-navy" onClick={() => put(list.filter((f) => f.q && f.a))}>Save all</button></div></div>
      <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
        {list.map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 10, alignItems: 'start', borderBottom: '1px solid #F1F4F7', paddingBottom: 12 }}>
            <input className="input" value={f.cat || ''} onChange={(e) => upd(i, 'cat', e.target.value)} placeholder="Category" />
            <div style={{ display: 'grid', gap: 6 }}><input className="input" value={f.q} onChange={(e) => upd(i, 'q', e.target.value)} placeholder="Question" /><textarea className="input" style={{ minHeight: 60 }} value={f.a} onChange={(e) => upd(i, 'a', e.target.value)} placeholder="Answer" /></div>
            <button className="btn btn-sm btn-ghost" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Remove"><I.trash size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function JsonBlock({ k, label, help }) {
  const { data, loading, put } = useBlock(k)
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (data !== undefined) setTxt(JSON.stringify(data, null, 2)) }, [data])
  if (loading) return <SkeletonRows n={2} />
  return (
    <div className="panel"><div className="panel-head"><h3>{label}</h3><button className="btn btn-sm btn-navy" onClick={() => { try { const v = JSON.parse(txt); setErr(''); put(v) } catch { setErr('This is not valid JSON – check commas and quotes.') } }}>Save</button></div>
      <div className="panel-body">{help && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{help}</p>}{err && <div className="notice err" style={{ marginBottom: 8 }}>{err}</div>}<textarea className="input" style={{ minHeight: 200, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} value={txt} onChange={(e) => setTxt(e.target.value)} spellCheck={false} /></div>
    </div>
  )
}

function BlocksAdmin() {
  const { data: hero, loading, put } = useBlock('hero')
  const about = useBlock('about')
  const [h, setH] = useState(null)
  const [a, setA] = useState(null)
  useEffect(() => { if (hero) setH(hero) }, [hero])
  useEffect(() => { if (about.data) setA(about.data) }, [about.data])
  if (loading || !h || !a) return <SkeletonRows />
  return (
    <>
      <div className="cols-even">
        <div className="panel"><div className="panel-head"><h3>Hero banner</h3><button className="btn btn-sm btn-navy" onClick={() => put(h)}>Save</button></div><div className="panel-body">
          <Field label="Eyebrow" id="he"><input id="he" className="input" value={h.eyebrow} onChange={(e) => setH({ ...h, eyebrow: e.target.value })} /></Field>
          <Field label="Title" id="ht"><input id="ht" className="input" value={h.title} onChange={(e) => setH({ ...h, title: e.target.value })} /></Field>
          <Field label="Subtitle" id="hs"><input id="hs" className="input" value={h.subtitle} onChange={(e) => setH({ ...h, subtitle: e.target.value })} /></Field>
          <Field label="Text (**bold** supported)" id="hx"><textarea id="hx" className="input" value={h.text} onChange={(e) => setH({ ...h, text: e.target.value })} /></Field>
        </div></div>
        <div className="panel"><div className="panel-head"><h3>About section</h3><button className="btn btn-sm btn-navy" onClick={() => about.put(a)}>Save</button></div><div className="panel-body">
          <Field label="Title" id="at"><input id="at" className="input" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></Field>
          <Field label="Intro (**bold** supported)" id="ax"><textarea id="ax" className="input" value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} /></Field>
          <Field label="Mission" id="am"><input id="am" className="input" value={a.mission || ''} onChange={(e) => setA({ ...a, mission: e.target.value })} /></Field>
          <Field label="Farm information" id="af"><textarea id="af" className="input" value={a.farm || ''} onChange={(e) => setA({ ...a, farm: e.target.value })} /></Field>
          <Field label="Values (one per line)" id="av"><textarea id="av" className="input" value={(a.values || []).join('\n')} onChange={(e) => setA({ ...a, values: e.target.value.split('\n').filter(Boolean) })} /></Field>
        </div></div>
      </div>
      <JsonBlock k="locations" label="Location picker cities" help='List of {"name","state","lat","lng"}. A city shows as Available when it has active serviceable areas (Settings → Serviceable areas); otherwise it shows "Not available yet". lat/lng are used for “Use my current location”.' />
      <JsonBlock k="journey" label="Farm-to-home journey steps" help='List of {"title","text","icon"} – icons: farm, lab, pack, truck' />
      <JsonBlock k="trust_highlights" label="Trust highlights band" help='Icons: shield, barn, truck, lock, smile' />
      <JsonBlock k="quality_promise" label="Quality promise badges" help='Icons: leaf, check, medal, heart' />
      <JsonBlock k="quality_process" label="Quality process bullet points" />
      <JsonBlock k="banners" label="Promotional banners" help='Optional list of {"text","link"} for announcements.' />
    </>
  )
}

function PoliciesAdmin() {
  const { data, loading, put } = useBlock('policies')
  const [p, setP] = useState(null)
  useEffect(() => { if (data) setP(data) }, [data])
  if (loading || !p) return <SkeletonRows />
  return (
    <div className="panel"><div className="panel-head"><h3>Policies</h3><button className="btn btn-sm btn-navy" onClick={() => put(p)}>Save policies</button></div><div className="panel-body">
      {Object.entries(p).map(([k, v]) => (
        <div key={k} style={{ marginBottom: 18 }}>
          <Field label={`Title (/policy/${k})`} id={`pt-${k}`}><input id={`pt-${k}`} className="input" value={v.title} onChange={(e) => setP({ ...p, [k]: { ...v, title: e.target.value } })} /></Field>
          <textarea className="input" style={{ minHeight: 140 }} value={v.body} onChange={(e) => setP({ ...p, [k]: { ...v, body: e.target.value } })} aria-label={`${v.title} body`} />
        </div>
      ))}
    </div></div>
  )
}

/* ================================================================ enquiries & notifications */
export function Enquiries() {
  const [f, setF] = useState({ status: '', kind: '' })
  const { data, loading, reload } = useFetch(`/api/admin/enquiries?${new URLSearchParams(f)}`)
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [reply, setReply] = useState(null)
  return (
    <>
      <PageHead title="Enquiries & Complaints" sub="Website enquiries, support tickets and complaints." />
      <div className="panel">
        <div className="panel-head"><div className="filters">
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">All types</option><option value="enquiry">Enquiry</option><option value="support">Support</option><option value="complaint">Complaint</option><option value="newsletter">Newsletter</option></select>
        </div></div>
        {loading ? <SkeletonRows /> : !data.length ? <Empty icon="chat" title="Inbox zero 🎉" /> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>From</th><th>Type</th><th>Message</th><th>Status</th><th /></tr></thead><tbody>
            {data.map((e) => <tr key={e.id}><td className="strong">{e.name}<div className="small">{e.email}<br />{e.phone}<br />{fmtDateTime(e.created_at)}</div></td><td><span className={`pill ${e.kind === 'complaint' ? 'red' : 'blue'}`}>{e.kind}</span></td><td style={{ maxWidth: 420, fontSize: 13 }}><b>{e.subject}</b><div>{e.message}</div>{e.admin_reply && <div className="notice info" style={{ marginTop: 6, padding: '6px 10px' }}>↳ {e.admin_reply}</div>}</td><td><Status s={e.status} /></td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-sm btn-outline" onClick={() => setReply({ id: e.id, admin_reply: e.admin_reply || '', status: e.status === 'open' ? 'resolved' : e.status })}>Reply</button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/enquiries/${e.id}`, 'enquiry')}><I.trash size={15} /></button></td></tr>)}
          </tbody></table></div>
        )}
      </div>
      {reply && <Modal title="Reply & update" onClose={() => setReply(null)}>
        <Field label="Reply (sent to the customer if they have an account)" id="ar"><textarea id="ar" className="input" value={reply.admin_reply} onChange={(e) => setReply({ ...reply, admin_reply: e.target.value })} /></Field>
        <Field label="Status" id="as"><select id="as" className="input" value={reply.status} onChange={(e) => setReply({ ...reply, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></Field>
        <button className="btn btn-navy" onClick={async () => { await save(() => api.put(`/api/admin/enquiries/${reply.id}`, reply)); setReply(null) }}>Save</button>
      </Modal>}
    </>
  )
}

export function AdminNotifications() {
  const { data, loading, reload } = useFetch('/api/admin/notifications')
  const save = useSaver(reload)
  const [b, setB] = useState({ title: '', message: '', audience: 'active', email: false })
  return (
    <>
      <PageHead title="Notifications"><button className="btn btn-outline btn-sm" onClick={() => save(() => api.post('/api/admin/notifications/read'), 'Marked read')}>Mark all read</button></PageHead>
      <div className="cols-2">
        <div className="panel"><div className="panel-head"><h3>Admin alerts</h3></div>
          {loading ? <SkeletonRows /> : !data.length ? <Empty icon="bell" title="No alerts" /> : data.map((n) => <div key={n.id} style={{ padding: '12px 20px', borderBottom: '1px solid #F1F4F7', background: n.is_read ? '#fff' : '#F6FBFE' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{n.title}</b><span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(n.created_at)}</span></div><div style={{ fontSize: 13.5 }}>{n.message}</div></div>)}
        </div>
        <div className="panel"><div className="panel-head"><h3>Send announcement</h3></div><div className="panel-body">
          <Field label="Audience" id="ba"><select id="ba" className="input" value={b.audience} onChange={(e) => setB({ ...b, audience: e.target.value })}><option value="active">Customers with active plans</option><option value="all">All customers</option></select></Field>
          <Field label="Title" id="bt"><input id="bt" className="input" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} placeholder="e.g. Delivery delayed due to rain" /></Field>
          <Field label="Message" id="bm"><textarea id="bm" className="input" value={b.message} onChange={(e) => setB({ ...b, message: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={b.email} onChange={(e) => setB({ ...b, email: e.target.checked })} /> Also send by email</label>
          <div style={{ marginTop: 14 }}><button className="btn btn-navy" disabled={!b.title || !b.message} onClick={async () => { const r = await save(() => api.post('/api/admin/notifications/broadcast', b), 'Sent'); if (r) setB({ ...b, title: '', message: '' }) }}>Send</button></div>
        </div></div>
      </div>
    </>
  )
}

/* ================================================================ settings */
export function Settings() {
  const [tab, setTab] = useState('business')
  return (
    <>
      <PageHead title="Settings & Permissions" />
      <div className="tabs">{[['business', 'Business & rules'], ['pincodes', 'Serviceable areas'], ['admins', 'Admin users'], ['roles', 'Roles & permissions'], ['audit', 'Audit log']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'business' && <BusinessSettings />}
      {tab === 'pincodes' && <Pincodes />}
      {tab === 'admins' && <Admins />}
      {tab === 'roles' && <Roles />}
      {tab === 'audit' && <Audit />}
    </>
  )
}

function BusinessSettings() {
  const { data, loading, reload } = useFetch('/api/admin/settings')
  const save = useSaver(reload)
  const [s, setS] = useState(null)
  useEffect(() => { if (data) setS(data) }, [data])
  if (loading || !s) return <SkeletonRows />
  const T = (k, label, type = 'text') => <Field label={label} id={k}><input id={k} type={type} className="input" value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: type === 'number' ? Number(e.target.value) : e.target.value })} /></Field>
  return (
    <div className="cols-even">
      <div className="panel"><div className="panel-head"><h3>Business details</h3></div><div className="panel-body">
        {T('business_name', 'Business name')}{T('phone', 'Phone')}{T('email', 'Email')}{T('whatsapp', 'WhatsApp number (with country code, digits only)')}{T('address', 'Address')}{T('city', 'City')}{T('delivery_timings', 'Delivery timings')}{T('order_cutoff', 'Order cut-off message')}
        {T('upi_id', 'UPI ID for payments (shown to customers in UPI / cash mode)')}
        <Field label="Payment instructions" id="pi"><textarea id="pi" className="input" value={s.payment_instructions || ''} onChange={(e) => setS({ ...s, payment_instructions: e.target.value })} /></Field>
        <div className="form-row">{['facebook', 'instagram', 'youtube'].map((k) => <Field key={k} label={k} id={k}><input id={k} className="input" value={s.social?.[k] || ''} onChange={(e) => setS({ ...s, social: { ...s.social, [k]: e.target.value } })} /></Field>)}</div>
      </div></div>
      <div className="panel"><div className="panel-head"><h3>Booking rules</h3><button className="btn btn-sm btn-navy" onClick={() => save(() => api.put('/api/admin/settings', s))}>Save settings</button></div><div className="panel-body">
        {T('max_daily_qty', 'Max packets per item per day', 'number')}{T('max_skips_per_subscription', 'Max skipped days per subscription', 'number')}{T('max_pause_days', 'Max pause length (days)', 'number')}{T('reminder_days_before', 'Renewal reminder (days before expiry)', 'number')}
        <Field label="Extra milk cut-off (orders for tomorrow close at)" id="cch"><select id="cch" className="input" value={s.change_cutoff_hour ?? 21} onChange={(e) => setS({ ...s, change_cutoff_hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${(h % 12) || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`}</option>)}</select></Field>
        <Field label="Missed delivery policy" id="mdp"><select id="mdp" className="input" value={s.missed_delivery_policy} onChange={(e) => setS({ ...s, missed_delivery_policy: e.target.value })}><option value="extend">Add a make-up day at the end</option><option value="refund">Refund (handled manually)</option></select></Field>
        <div className="grid gap-2.5">
          {[['trial_requires_verification', 'Free trial requires a verified email'], ['booking_requires_approval', 'Paid bookings require admin approval before activation'],
            ['skip_requires_approval', 'Customer skip requests require admin approval'], ['whatsapp_notifications', 'Send booking, payment & delivery updates on WhatsApp (needs server keys)']].map(([k, l]) => (
            <label key={k} className="check"><input type="checkbox" checked={!!s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} /> {l}</label>
          ))}
        </div>
        <div className="notice info" style={{ marginTop: 14 }}>Payment, email and WhatsApp keys are set on the server in backend/.env (PAYMENT_PROVIDER, RAZORPAY_*, SMTP_*, WHATSAPP_*) – never in the browser.</div>
      </div></div>
      <Integrations />
    </div>
  )
}

function Integrations() {
  const { data } = useFetch('/api/admin/integrations')
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const Row = ({ ok, name, text }) => (
    <div className="integ-row"><span className={`pill ${ok ? 'green' : 'grey'}`}>{ok ? 'Connected' : 'Not set up'}</span><div><b>{name}</b><div className="small muted">{text}</div></div></div>
  )
  const [em, setEm] = useState('')
  const testEmail = async () => {
    setBusy(true)
    try { const r = await api.post('/api/admin/integrations/email-test', { email: em }); toast.success(r.message) } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true)
    try { const r = await api.post('/api/admin/integrations/whatsapp-test', { phone }); toast.success(r.message) } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <div className="panel"><div className="panel-head"><h3>Messaging &amp; integrations</h3></div><div className="panel-body">
      <Row ok={data.whatsapp.configured} name="WhatsApp Business" text={data.whatsapp.configured ? `Updates ${data.whatsapp.enabled ? 'ON' : 'OFF (tick the box above)'}${data.whatsapp.template ? ` · template “${data.whatsapp.template}”` : ' · no template (messages only reach customers who wrote to you in the last 24h)'}` : 'Server needs WHATSAPP_PROVIDER=meta, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID'} />
      <Row ok={data.sms.configured} name="SMS for OTP login" text={data.sms.configured ? `Provider: ${data.sms.provider}` : 'Optional – SMS_PROVIDER=fast2sms or msg91. Without it, login codes go by WhatsApp / email.'} />
      <Row ok={!!data.whatsapp.otp_template} name="WhatsApp OTP template" text={data.whatsapp.otp_template ? `“${data.whatsapp.otp_template}”` : 'Optional – WHATSAPP_OTP_TEMPLATE (an approved Authentication template)'} />
      <Row ok={data.email.configured} name="Email (SMTP)" text={data.email.configured ? 'Emails are being sent – use “Send a test email” below to check' : 'Not set up – OTP codes and verification links are NOT emailed. Add SMTP_* to backend/.env (Gmail App Password)'} />
      <Row ok={data.payments.provider !== 'mock'} name="Payments" text={`Mode: ${data.payments.provider}`} />
      <div className="field" style={{ marginTop: 14 }}><label htmlFor="em-test">Send a test email</label>
        <div style={{ display: 'flex', gap: 8 }}><input id="em-test" className="input" type="email" placeholder="you@example.com" value={em} onChange={(e) => setEm(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn btn-navy" disabled={busy || !em} onClick={testEmail}>Send test</button></div>
      </div>
      <div className="field" style={{ marginTop: 14 }}><label htmlFor="wa-test">Send a WhatsApp test message</label>
        <div style={{ display: 'flex', gap: 8 }}><input id="wa-test" className="input" inputMode="tel" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn btn-navy" disabled={busy || !phone} onClick={test}>Send test</button></div>
      </div>
    </div></div>
  )
}

const CITIES = ['Narasaraopet', 'Vijayawada', 'Hyderabad', 'Bengaluru', 'Chennai']

function Pincodes() {
  const [city, setCity] = useState('')
  const { data, loading, reload } = useFetch(`/api/admin/pincodes${city ? `?city=${encodeURIComponent(city)}` : ''}`)
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [n, setN] = useState({ pincode: '', area: '', city: 'Narasaraopet' })
  const cities = [...new Set([...CITIES, ...(data || []).map((p) => p.city)])]
  return (
    <div className="panel"><div className="panel-head"><h3>Serviceable areas</h3>
      <div className="filters">
        <select className="input" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Filter by city"><option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>
      </div></div>
      <div className="panel-body flex flex-wrap gap-2.5 items-end border-b border-[#EEF2F5]">
        <Field label="City" id="pc-city"><input id="pc-city" className="input !w-40" list="city-list" value={n.city} onChange={(e) => setN({ ...n, city: e.target.value })} /><datalist id="city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="PIN code" id="pc-pin"><input id="pc-pin" className="input !w-28" inputMode="numeric" value={n.pincode} onChange={(e) => setN({ ...n, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
        <Field label="Area name" id="pc-area"><input id="pc-area" className="input !w-52" value={n.area} onChange={(e) => setN({ ...n, area: e.target.value })} /></Field>
        <div className="field"><button className="btn btn-navy" disabled={!n.city.trim() || n.pincode.length !== 6} onClick={async () => { await save(() => api.post('/api/admin/pincodes', n), 'PIN code added'); setN({ ...n, pincode: '', area: '' }) }}><I.plus size={15} /> Add area</button></div>
      </div>
      {loading ? <SkeletonRows /> : !data.length ? <Empty icon="map" title="No areas yet" /> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>City</th><th>PIN code</th><th>Area</th><th>Status</th><th /></tr></thead><tbody>{data.map((p) => <tr key={p.id}><td className="strong">{p.city}</td><td>{p.pincode}</td><td>{p.area}</td><td>{p.is_active ? <span className="pill green">Active</span> : <span className="pill grey">Disabled</span>}</td>
          <td className="whitespace-nowrap"><button className="btn btn-sm btn-outline" onClick={() => save(() => api.put(`/api/admin/pincodes/${p.id}`, { is_active: !p.is_active }))}>{p.is_active ? 'Disable' : 'Enable'}</button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/pincodes/${p.id}`, `PIN code ${p.pincode}`)}><I.trash size={15} /></button></td></tr>)}</tbody></table></div>
      )}
    </div>
  )
}

function Admins() {
  const { data, loading, reload } = useFetch('/api/admin/admins')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const { user } = useAuth()
  const [n, setN] = useState(null)
  if (loading) return <SkeletonRows />
  return (
    <>
      <div className="panel"><div className="panel-head"><h3>Admin users</h3><button className="btn btn-sm btn-navy" onClick={() => setN({ name: '', email: '', password: '', admin_role_id: data.roles[0]?.id })}><I.plus size={15} /> Add admin</button></div>
        <div className="table-wrap"><table className="t"><thead><tr><th>Admin</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>{data.admins.map((u) => <tr key={u.id}><td className="strong">{u.name}<div className="small">{u.email}</div></td>
          <td><select className="input !w-auto" value={u.admin_role?.id || ''} disabled={u.id === user.id} onChange={(e) => save(() => api.put(`/api/admin/admins/${u.id}`, { admin_role_id: Number(e.target.value) }), 'Role changed')}>{data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
          <td>{u.is_active ? <span className="pill green">Active</span> : <span className="pill red">Disabled</span>}</td>
          <td className="whitespace-nowrap">{u.id !== user.id && <><button className="btn btn-sm btn-outline" onClick={() => save(() => api.put(`/api/admin/admins/${u.id}`, { is_active: !u.is_active }))}>{u.is_active ? 'Disable' : 'Enable'}</button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/admins/${u.id}`, 'admin account', 'Their access is removed; audit history keeps their name.')}><I.trash size={15} /></button></>}</td></tr>)}</tbody></table></div>
      </div>
      {n && <Modal title="New admin" onClose={() => setN(null)}>
        <Field label="Name" id="an"><input id="an" className="input" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
        <Field label="Email" id="ae"><input id="ae" className="input" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} /></Field>
        <Field label="Temporary password" id="ap"><input id="ap" type="password" className="input" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} /></Field>
        <Field label="Role" id="ar"><select id="ar" className="input" value={n.admin_role_id} onChange={(e) => setN({ ...n, admin_role_id: Number(e.target.value) })}>{data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <button className="btn btn-navy" onClick={async () => { await save(() => api.post('/api/admin/admins', n), 'Admin created'); setN(null) }}>Create</button>
      </Modal>}
    </>
  )
}

function Roles() {
  const { data, loading, reload } = useFetch('/api/admin/roles')
  const save = useSaver(reload)
  const del = useDelete(reload)
  const [edit, setEdit] = useState(null)
  if (loading) return <SkeletonRows />
  const level = (codes, m) => (codes.includes(`${m}.manage`) ? 'manage' : codes.includes(`${m}.view`) ? 'view' : 'none')
  const setLevel = (m, lv) => {
    const rest = edit.permissions.filter((c) => !c.startsWith(`${m}.`))
    setEdit({ ...edit, permissions: lv === 'none' ? rest : [...rest, `${m}.${lv}`] })
  }
  return (
    <>
      <div className="panel"><div className="panel-head"><h3>Roles</h3><button className="btn btn-sm btn-navy" onClick={() => setEdit({ name: '', description: '', permissions: ['dashboard.view'] })}><I.plus size={15} /> New role</button></div>
        <div className="table-wrap"><table className="t"><thead><tr><th>Role</th><th>Access</th><th>Admins</th><th /></tr></thead><tbody>
          {data.roles.map((r) => <tr key={r.id}><td className="strong">{r.name}<div className="small">{r.description}</div></td>
            <td>{r.is_super ? <span className="pill green">Everything</span> : data.modules.map((m) => { const lv = level(r.permissions, m.code); return lv === 'none' ? null : <span key={m.code} className={`pill ${lv === 'manage' ? 'blue' : 'grey'} m-0.5`}>{m.name}{lv === 'view' ? ' (view)' : ''}</span> })}</td>
            <td>{r.users}</td>
            <td className="whitespace-nowrap">{!r.is_super && <><button className="btn btn-sm btn-ghost" aria-label="Edit" onClick={() => setEdit({ ...r })}><I.edit size={15} /></button><button className="btn btn-sm btn-ghost" aria-label="Delete" onClick={() => del(`/api/admin/roles/${r.id}`, 'role')}><I.trash size={15} /></button></>}</td></tr>)}
        </tbody></table></div>
      </div>
      {edit && <Modal wide title={edit.id ? `Edit role – ${edit.name}` : 'New role'} onClose={() => setEdit(null)}>
        <div className="form-row">
          <Field label="Role name" id="rn"><input id="rn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Description" id="rd"><input id="rd" className="input" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
        </div>
        <p className="muted text-sm mt-0">“View” gives read-only access. “Manage” allows add, edit, activate/deactivate and delete.</p>
        <table className="t"><thead><tr><th>Module</th><th className="text-center">No access</th><th className="text-center">View</th><th className="text-center">Manage</th></tr></thead><tbody>
          {data.modules.map((m) => { const lv = level(edit.permissions, m.code); return (
            <tr key={m.code}><td className="strong">{m.name}</td>{['none', 'view', 'manage'].map((x) => <td key={x} className="text-center"><input type="radio" name={`perm-${m.code}`} aria-label={`${m.name} ${x}`} checked={lv === x} onChange={() => setLevel(m.code, x)} /></td>)}</tr>
          ) })}
        </tbody></table>
        <div className="mt-4"><button className="btn btn-navy" disabled={!edit.name.trim()} onClick={async () => { await save(() => (edit.id ? api.put(`/api/admin/roles/${edit.id}`, edit) : api.post('/api/admin/roles', edit)), 'Role saved'); setEdit(null) }}>Save role</button></div>
      </Modal>}
    </>
  )
}

function Audit() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const { data, meta, loading } = useFetch(`/api/admin/audit?page=${page}${entity ? `&entity=${entity}` : ''}`)
  return (
    <div className="panel"><div className="panel-head"><h3>Audit log</h3><select className="input" style={{ width: 'auto' }} value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1) }}><option value="">All</option>{['subscription', 'payment', 'delivery', 'order', 'product', 'variant', 'plan', 'customer', 'staff', 'route', 'settings', 'content'].map((e) => <option key={e}>{e}</option>)}</select></div>
      {loading ? <SkeletonRows /> : <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>By</th><th>Entity</th><th>Action</th><th>Details</th></tr></thead><tbody>{data.map((a) => <tr key={a.id}><td className="small">{fmtDateTime(a.created_at)}</td><td>{a.by}</td><td>{a.entity} {a.entity_id && `#${a.entity_id}`}</td><td className="strong">{a.action}</td><td className="small" style={{ maxWidth: 380, wordBreak: 'break-word' }}>{a.details && JSON.stringify(a.details)}</td></tr>)}</tbody></table></div>}
      <Pager meta={meta?.meta} onPage={setPage} />
    </div>
  )
}
