import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { I } from './Icons'
import { Spinner } from './ui'
import { inr, addDays } from '../api'
import { useCart, useToast } from '../context'
import { useQuote } from '../pages/public/Catalog'
import { useLocation2 } from './Location'

/** One milk product with its own buy box: pack → packets/day → days → price → Buy now. */
export function ProductBuyCard({ product, plans = [] }) {
  const cart = useCart()
  const nav = useNavigate()
  const toast = useToast()
  const { loc, available } = useLocation2()
  const variants = useMemo(() => (product.variants || []).filter((v) => v.is_available !== false), [product])
  const [vid, setVid] = useState(null)
  const [qty, setQty] = useState(1)
  const [planId, setPlanId] = useState(null)
  const variant = variants.find((v) => v.id === vid) || variants[0]
  const paid = plans.filter((p) => !p.is_trial)
  const plan = plans.find((p) => p.id === planId) || plans.find((p) => p.is_popular) || paid[paid.length - 1] || plans[0]
  const maxQty = plan?.is_trial ? (plan.trial_max_packets || 2) : 10
  useEffect(() => { if (qty > maxQty) setQty(maxQty) }, [maxQty, qty])

  const items = variant ? [{ variant_id: variant.id, daily_qty: qty, product: product.name, size: variant.label, price: variant.price }] : []
  const { q, loading, error } = useQuote(items, plan?.id, addDays(1))
  const go = (checkout) => {
    cart.setItems(items)
    cart.setPlan(plan.id)
    if (checkout) nav('/checkout')
    else toast.success(`${qty} × ${product.name} ${variant.label} added – ${plan.is_trial ? 'Free trial' : plan.name}`)
  }
  const fromPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : 0
  const uid = `p${product.id}`

  return (
    <article className="buy-card" aria-labelledby={`${uid}-name`}>
      <div className="bc-top">
        <Link to={`/products/${product.slug}`} className="bc-img" tabIndex={-1}><img src={product.image} alt={`Glass of ${product.name}`} loading="lazy" /></Link>
        <div className="bc-info">
          <h3 id={`${uid}-name`}>{product.name}</h3>
          <p>{product.tagline}</p>
          <div className="bc-from">from <b>{inr(fromPrice)}</b> / packet</div>
          <Link to={`/products/${product.slug}`} className="chip-btn">View Details <I.arrow size={14} /></Link>
        </div>
      </div>

      <div className="bc-body">
        <div className="qo-row">
          <div>
            <div className="qo-label" id={`${uid}-pack`}>Pack size</div>
            <div className="qo-chips" role="radiogroup" aria-labelledby={`${uid}-pack`}>
              {variants.map((v) => (
                <button type="button" key={v.id} role="radio" aria-checked={variant?.id === v.id} className={`qo-chip ${variant?.id === v.id ? 'on' : ''}`} onClick={() => setVid(v.id)}>
                  {v.label}<small>{inr(v.price)}</small>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="qo-label">Packets / day</div>
            <div className="qo-qty">
              <button type="button" aria-label={`Fewer ${product.name} packets`} disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label={`More ${product.name} packets`} disabled={qty >= maxQty} onClick={() => setQty(qty + 1)}>+</button>
            </div>
          </div>
        </div>

        <div className="qo-label" id={`${uid}-days`}>Deliver for</div>
        <div className="qo-chips qo-plans" role="radiogroup" aria-labelledby={`${uid}-days`}>
          {plans.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={plan?.id === p.id} className={`qo-chip ${plan?.id === p.id ? 'on' : ''}`} onClick={() => setPlanId(p.id)}>
              {p.is_trial ? 'Trial' : `${p.duration_days} days`}
              <small>{p.is_trial ? 'free' : p.discount_percent > 0 ? `save ${Number(p.discount_percent)}%` : ' '}</small>
            </button>
          ))}
        </div>

        <div className="qo-total">
          <div>
            {error ? <span className="qo-err">{error.message}</span> : (
              <>
                <div className="qo-amount">{loading && !q ? <Spinner /> : q ? inr(q.total) : '—'}</div>
                <small>{q ? `${q.plan.duration_days} day${q.plan.duration_days > 1 ? 's' : ''} · ${qty} × ${variant?.label} daily` : 'Free doorstep delivery'}</small>
                {q?.discount > 0 && <small className="qo-save">You save {inr(q.discount)}</small>}
              </>
            )}
          </div>
          <div className="qo-actions">
            <button type="button" className="btn btn-outline btn-sm" aria-label={`Add ${product.name} to cart`} onClick={() => go(false)} disabled={!q}><I.cart size={15} /> Cart</button>
            <button type="button" className="btn btn-gold" aria-label={`Buy ${product.name} now`} onClick={() => go(true)} disabled={!q}>Buy now <I.arrow size={16} /></button>
          </div>
        </div>
        {loc && !available && <div className="qo-note">We don't deliver to {loc.city} yet.</div>}
      </div>
    </article>
  )
}

export default function ProductBuyGrid({ products = [], plans = [] }) {
  const { loc, available, openPicker } = useLocation2()
  if (!products.length) return null
  return (
    <>
      <div className="bc-loc">
        <button type="button" className={`qo-loc ${loc && !available ? 'bad' : ''}`} onClick={openPicker}>
          <I.pin size={14} /> {loc ? `Delivering to ${loc.city}${available ? '' : ' – not available yet'}` : 'Choose your delivery location'}
        </button>
        <span className="muted small">Delivery starts tomorrow morning · free doorstep delivery</span>
      </div>
      <div className="buy-grid">
        {products.map((p) => <ProductBuyCard key={p.id} product={p} plans={plans} />)}
      </div>
    </>
  )
}
