import { Link } from 'react-router-dom'
import { I } from './Icons'
import { Stars } from './ui'
import { inr } from '../api'

export function ProductCard({ p }) {
  return (
    <article className="product-card">
      <div className="pc-img"><img src={p.image} alt={`Glass of ${p.name}`} loading="lazy" /></div>
      <div className="pc-body">
        <h3>{p.name}</h3>
        <p>{p.tagline}</p>
        <div style={{ height: 14 }} />
        <Link to={`/products/${p.slug}`} className="chip-btn">View Details <I.arrow size={14} /></Link>
      </div>
    </article>
  )
}

export function PlanCard({ plan, selected, onSelect, compact }) {
  const trial = plan.is_trial
  const popular = plan.is_popular
  const body = (
    <>
      {popular && <span className="tag">Most Popular</span>}
      <h4>{trial ? 'Free Trial' : plan.name}</h4>
      {trial ? <div className="sub">{plan.duration_days} Day</div> : <div className="dot">◆</div>}
      <div className="price">{inr(trial ? 0 : plan.from_price)}</div>
      <div className="price-note">{trial ? `up to ${plan.trial_max_packets} packets` : plan.discount_percent ? `from · save ${plan.discount_percent}%` : 'starting from'}</div>
      <span className={`btn ${popular ? 'btn-gold' : trial ? 'btn-outline' : 'btn-navy'}`}>{trial ? 'Try Now' : 'Subscribe'}</span>
    </>
  )
  const cls = `plan-card ${popular ? 'popular' : ''} ${selected ? 'selected' : ''}`
  if (onSelect) {
    return <button type="button" className={cls} onClick={() => onSelect(plan)} aria-pressed={selected} style={{ font: 'inherit' }}>{body}</button>
  }
  return <Link to={`/subscriptions?plan=${plan.id}`} className={cls} aria-label={`${plan.name} plan`}>{body}</Link>
}

export function TestimonialCard({ t }) {
  return (
    <figure className="testi" style={{ margin: 0 }}>
      <div className="avatar" aria-hidden="true">{t.name?.[0]}</div>
      <div>
        <Stars n={t.rating} />
        <blockquote style={{ margin: 0 }}><p>“{t.comment}”</p></blockquote>
        <figcaption className="who">– {t.name}</figcaption>
      </div>
    </figure>
  )
}
