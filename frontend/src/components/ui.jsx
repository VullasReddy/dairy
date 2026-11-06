import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { I } from './Icons'
import { inr } from '../api'

export function Logo({ light, to = '/' }) {
  return (
    <Link to={to} className={`logo ${light ? 'light' : ''}`} aria-label="Aditya Milk Dairy home">
      <img src={light ? '/images/logo-icon-white.png' : '/images/logo-icon.png'} alt="" />
      <span className="logo-text"><b>Aditya</b><span>Milk Dairy</span></span>
    </Link>
  )
}

export function SectionTitle({ title, sub, left }) {
  return (
    <div className={`section-title ${left ? 'left' : ''}`}>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  )
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}
        initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <div className="modal-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose} aria-label="Close"><I.close /></button></div>
        {children}
      </motion.div>
    </motion.div>
  )
}

export function Empty({ icon = 'box', title, text, action }) {
  const Ico = I[icon] || I.box
  return (
    <div className="empty">
      <Ico size={54} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ h = 18, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />
}
export function SkeletonRows({ n = 4 }) {
  return <div style={{ display: 'grid', gap: 12, padding: 20 }}>{Array.from({ length: n }).map((_, i) => <Skeleton key={i} h={22} />)}</div>
}

const STATUS_COLOR = {
  active: 'green', delivered: 'green', success: 'green', confirmed: 'green', resolved: 'green', published: 'green', approved: 'green',
  paused: 'amber', pending_payment: 'amber', created: 'amber', skipped: 'amber', open: 'amber', out_for_delivery: 'purple', in_progress: 'blue',
  scheduled: 'grey', assigned: 'blue', completed: 'grey', draft: 'grey',
  cancelled: 'red', failed: 'red', missed: 'red', refunded: 'purple',
}
export function Status({ s }) {
  return <span className={`pill cap ${STATUS_COLOR[s] || 'grey'}`}>{String(s || '').replace(/_/g, ' ')}</span>
}

export function Stars({ n = 5 }) {
  return <div className="stars" aria-label={`${n} out of 5 stars`}>{'★★★★★'.slice(0, n)}<span style={{ color: '#DDD' }}>{'★★★★★'.slice(n)}</span></div>
}

export function Spinner() { return <span className="spinner" aria-hidden="true" /> }

export function Money({ v }) { return <>{inr(v)}</> }

export function ErrorBox({ error, retry }) {
  if (!error) return null
  return <div className="notice err" style={{ margin: 16 }}>{error.message || String(error)} {retry && <button className="btn btn-sm btn-ghost" onClick={retry}>Retry</button>}</div>
}

export function Pager({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null
  return (
    <div className="pager">
      <span>Page {meta.page} of {meta.pages} · {meta.total} records</span>
      <button className="btn btn-sm btn-outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</button>
      <button className="btn btn-sm btn-outline" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next</button>
    </div>
  )
}

/** Renders **bold** markers from admin-editable text safely (no HTML injection). */
export function RichText({ text }) {
  if (!text) return null
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return <>{parts.map((p, i) => p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>)}</>
}
