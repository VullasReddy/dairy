import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { I, Promise as P, Swoosh } from '../../components/Icons'
import { SectionTitle, Skeleton, RichText } from '../../components/ui'
import { ProductCard, PlanCard, TestimonialCard } from '../../components/cards'
import { useFetch, useReveal } from '../../context'

export const TRUST_ICONS = { shield: I.shield, barn: I.barn, truck: I.truck, lock: I.lock, smile: I.smile }
export const STEP_ICONS = { farm: I.farm, lab: I.lab, pack: I.pack, truck: I.truck }

function splitTwo(title) {
  const w = title.split(' ')
  if (w.length < 2) return [title, '']
  const cut = w.length === 3 ? 1 : Math.ceil(w.length / 2)
  return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')]
}

export default function Home() {
  const { data, loading } = useFetch('/api/public/home')
  useReveal()
  const hero = data?.hero || {}
  const about = data?.about || {}

  return (
    <>
      <section className="hero" aria-label="Welcome">
        <motion.div className="hero-visual" role="img" aria-label="Cow and buffalo on a green farm with fresh milk"
          initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }} />
        <div className="container">
          <motion.div className="hero-content" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}>
            <div className="hero-eyebrow">{hero.eyebrow || 'Pure. Fresh. Healthy.'}<Swoosh /></div>
            <h1>{hero.title || 'Aditya Milk Dairy'}</h1>
            <h2>{hero.subtitle || 'Farm Fresh Milk, Delivered to Your Home'}</h2>
            <p><RichText text={hero.text || 'Choose from our premium **Cow Milk & Buffalo Milk** with flexible subscription plans and doorstep delivery.'} /></p>
            <div className="hero-cta">
              <Link to="/subscriptions" className="btn btn-navy btn-lg">Subscribe Now <I.arrow size={17} /></Link>
              <Link to="/about" className="btn btn-cream btn-lg"><I.play size={17} /> Know More</Link>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="trust" role="list">
        {(data?.trust_highlights || DEFAULT_TRUST).map((t) => {
          const Ico = TRUST_ICONS[t.icon] || I.shield
          const [a, b] = splitTwo(t.title)
          return <div className="trust-item" role="listitem" key={t.title}><Ico /><span>{a}<br />{b}</span></div>
        })}
      </div>

      <div className="page-bg">
        <section className="section container" style={{ paddingTop: 30, paddingBottom: 30 }}>
          <div className="home-split">
            <div className="reveal">
              <SectionTitle title="Our Products" sub="Premium Quality Milk for a Healthy Life" />
              <div className="product-cards">
                {loading ? [0, 1].map((i) => <Skeleton key={i} h={168} style={{ borderRadius: 22 }} />)
                  : data?.products?.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            </div>
            <div className="reveal">
              <SectionTitle title="Subscription Plans" sub="Choose a plan that suits your needs" />
              <div className="plan-row">
                {loading ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={160} />)
                  : data?.plans?.map((p) => <PlanCard key={p.id} plan={p} />)}
              </div>
            </div>
          </div>
        </section>

        <section className="section container" id="about" style={{ paddingTop: 8, paddingBottom: 54 }}>
          <div className="about-row">
            <Link to="/about" className="journey-card reveal" aria-label="Our journey from farm to home">
              <img src="/images/farm-journey.jpg" alt="Our Journey From Farm to Home – Aditya farm" />
            </Link>
            <div className="about-text reveal">
              <h2>{about.title || 'About Aditya Milk Dairy'}</h2>
              <p><RichText text={about.text} /></p>
              <Link to="/about" className="btn btn-cream" style={{ border: '1.5px solid #1F2D3D' }}>Learn More <I.arrow size={16} /></Link>
            </div>
            <div className="quality-col reveal">
              <h3>Our Quality Promise</h3>
              <div className="promise-grid">
                {(data?.quality_promise || DEFAULT_PROMISE).map((q) => {
                  const Ico = P[q.icon] || P.check
                  return <div className="promise" key={q.title}><div className="ring"><Ico /></div><span>{q.title}</span></div>
                })}
              </div>
            </div>
          </div>
        </section>

        {(loading || data?.testimonials?.length > 0) && <section className="section testi-bg" style={{ paddingBottom: 34 }}>
          <div className="container">
            <SectionTitle title="What Our Customers Say" sub={<>— Trusted by Thousands of Families —</>} />
            <div className="testi-grid reveal">
              {loading ? [0, 1, 2].map((i) => <Skeleton key={i} h={100} />)
                : data?.testimonials?.map((t) => <TestimonialCard key={t.id} t={t} />)}
            </div>
          </div>
        </section>}
      </div>
    </>
  )
}

const DEFAULT_TRUST = [
  { title: '100% Pure & Fresh', icon: 'shield' }, { title: 'From Our Own Farms', icon: 'barn' },
  { title: 'On-Time Delivery', icon: 'truck' }, { title: 'Secure Payments', icon: 'lock' }, { title: 'Happier Families', icon: 'smile' },
]
const DEFAULT_PROMISE = [
  { title: '100% Natural', icon: 'leaf' }, { title: 'Lab Tested', icon: 'check' },
  { title: 'Premium Quality', icon: 'medal' }, { title: 'Your Health Our Priority', icon: 'heart' },
]
