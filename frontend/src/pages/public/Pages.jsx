import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmtDate } from '../../api'
import { useAuth, useFetch, useReveal, useSite, useToast } from '../../context'
import { I, Promise as P } from '../../components/Icons'
import { TestimonialCard } from '../../components/cards'
import { Empty, ErrorBox, Field, RichText, SectionTitle, Skeleton, Spinner } from '../../components/ui'
import { PageHero } from './Catalog'
import { STEP_ICONS } from './Home'

export function About() {
  const site = useSite()
  const a = site.about || {}
  useReveal()
  return (
    <>
      <PageHero title={a.title || 'About Aditya Milk Dairy'} sub="A family dairy bringing farm-fresh milk to homes in Narasaraopet, Vijayawada, Hyderabad, Bengaluru and Chennai every morning." crumbs="About" />
      <div className="page-bg">
        <section className="section container">
          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div className="journey-card reveal"><img src="/images/cattle-shed.webp" alt="Aditya Milk Dairy cattle shed with cows" style={{ aspectRatio: '3 / 2' }} /></div>
            <div className="reveal">
              <h2 className="serif" style={{ fontSize: 28 }}>Our Story</h2>
              <p><RichText text={a.text} /></p>
              {a.farm && <p>{a.farm}</p>}
              {a.mission && <div className="notice info"><b>Our mission:</b>&nbsp;{a.mission}</div>}
            </div>
          </div>
        </section>
        {a.values?.length > 0 && (
          <section className="section container">
            <SectionTitle title="What We Stand For" />
            <div className="grid-4 reveal">{a.values.map((v) => <div className="card" key={v} style={{ textAlign: 'center' }}><I.check size={28} style={{ color: 'var(--green)', margin: '0 auto 8px' }} /><b style={{ color: 'var(--navy-ink)' }}>{v}</b></div>)}</div>
          </section>
        )}
        <section className="section container">
          <div className="about-stats reveal">
            {[['4', 'cities served'], ['340+', 'PIN codes covered'], ['Before 8 AM', 'daily doorstep delivery'], ['0', 'preservatives or powder']].map(([n, l]) => (
              <div key={l}><b>{n}</b><span>{l}</span></div>
            ))}
          </div>
        </section>
        <section className="section container">
          <div className="grid-2" style={{ alignItems: 'start', gap: 26 }}>
            <div className="card reveal">
              <h3 className="serif" style={{ fontSize: 22, marginTop: 0 }}>Our farm &amp; animals</h3>
              <ul className="ticks">
                <li>Healthy cows and buffaloes in airy, clean sheds with plenty of space to move and rest.</li>
                <li>Balanced feed – green fodder, dry fodder and mineral mix – with clean drinking water all day.</li>
                <li>Regular veterinary check-ups and vaccinations; no hormone injections to push milk yield.</li>
                <li>Hygienic milking twice a day, with udders cleaned before every milking.</li>
              </ul>
            </div>
            <div className="card reveal">
              <h3 className="serif" style={{ fontSize: 22, marginTop: 0 }}>Quality at every step</h3>
              <ul className="ticks">
                <li>Milk is chilled to about 4°C soon after milking to keep it fresh and safe.</li>
                <li>Every batch is checked for fat, SNF and common adulterants before it is packed.</li>
                <li>Sealed, food-grade packets – untouched by hand from our farm to your door.</li>
                <li>Lab reports are published on our <Link to="/quality">Quality</Link> page.</li>
              </ul>
            </div>
          </div>
        </section>
        <section className="section container">
          <SectionTitle title="Why Families Choose Us" sub="Simple, honest and on time – every morning" />
          <div className="grid-3 reveal">
            {[
              [I.truck, 'Delivered before 8 AM', 'Your milk is at the door before the day begins – tea, coffee and breakfast sorted.'],
              [I.calendar, 'Fully flexible', 'Skip a day, pause for a trip or add extra milk for guests from your phone.'],
              [I.shield, 'Pay safely in advance', 'Clear prices, receipts for every payment and refunds for undelivered days.'],
              [I.bell, 'Always informed', 'Delivery updates on the website, by email and on WhatsApp.'],
              [I.map, 'Exact doorstep', 'Drop a map pin so our delivery partner finds your home every time.'],
              [I.phone, 'Real people to help', 'Call, WhatsApp or ask our help assistant – we reply quickly.'],
            ].map(([Ico, t, d]) => <div className="card why-card" key={t}><Ico size={26} /><b>{t}</b><p>{d}</p></div>)}
          </div>
        </section>
        <section className="section container" id="journey">
          <SectionTitle title="Our Journey From Farm to Home" sub="The same careful steps, every single morning" />
          <div className="timeline reveal" style={{ marginTop: 26 }}>
            {(site.journey || []).map((s, i) => {
              const Ico = STEP_ICONS[s.icon] || I.drop
              return <div className="step" key={i}><div className="num"><Ico /></div><h4>{i + 1}. {s.title}</h4><p>{s.text}</p></div>
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 34 }}><Link to="/subscriptions" className="btn btn-navy btn-lg">Start your subscription <I.arrow size={16} /></Link></div>
        </section>
      </div>
    </>
  )
}

export function Quality() {
  const { data, loading } = useFetch('/api/public/quality')
  useReveal()
  return (
    <>
      <PageHero title="Quality & Certification" sub="How we keep every drop pure – and the reports that prove it." crumbs="Quality" />
      <div className="page-bg"><section className="section container">
        <div className="grid-4 reveal" style={{ marginBottom: 30 }}>
          {(data?.promise || []).map((q) => { const Ico = P[q.icon] || P.check; return <div className="card promise" key={q.title} style={{ padding: 24 }}><div className="ring"><Ico /></div><b>{q.title}</b></div> })}
        </div>
        <div className="grid-2">
          <div className="card reveal">
            <h3>Our quality process</h3>
            <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
              {(data?.process || []).map((p) => <li key={p} style={{ display: 'flex', gap: 10, padding: '8px 0' }}><I.check style={{ color: 'var(--green)', flex: 'none' }} />{p}</li>)}
            </ul>
          </div>
          <div className="card reveal">
            <h3>Lab reports & certificates</h3>
            {loading && <Skeleton h={80} />}
            {data?.reports?.length ? data.reports.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0F2F5' }}>
                <I.file size={28} style={{ color: 'var(--navy)' }} />
                <div style={{ flex: 1 }}><b>{r.title}</b><div className="muted" style={{ fontSize: 13 }}>{r.report_type} · {r.issued_by} · {fmtDate(r.report_date)}</div>{r.summary && <div style={{ fontSize: 13 }}>{r.summary}</div>}</div>
                {r.file_url && <a className="btn btn-sm btn-outline" href={r.file_url} target="_blank" rel="noreferrer"><I.download size={15} /> View</a>}
              </div>
            )) : !loading && <p className="muted">Our latest verified lab reports will be published here. Only genuine, current reports from accredited labs are shown.</p>}
          </div>
        </div>
      </section></div>
    </>
  )
}

export function Testimonials() {
  const { data, loading } = useFetch('/api/public/testimonials')
  const { user } = useAuth()
  return (
    <>
      <PageHero title="What Our Customers Say" sub="Reviews from families who start their day with Aditya Milk Dairy." crumbs="Testimonials" />
      <div className="page-bg"><section className="section container">
        <div className="testi-grid">
          {loading && [0, 1, 2].map((i) => <Skeleton key={i} h={110} />)}
          {data?.map((t) => <TestimonialCard key={t.id} t={t} />)}
        </div>
        {data && !data.length && <Empty icon="star" title="No reviews yet" />}
        <div className="card" style={{ marginTop: 26, textAlign: 'center' }}>
          <b className="serif" style={{ fontSize: 18, color: 'var(--navy)' }}>Are you a customer?</b>
          <p className="muted">Share your experience – reviews are published after a quick check by our team.</p>
          <Link className="btn btn-navy" to={user ? '/account/reviews' : '/login?next=/account/reviews'}>Write a review</Link>
        </div>
      </section></div>
    </>
  )
}

export function Blog() {
  const { data, loading } = useFetch('/api/public/blog')
  useReveal()
  return (
    <>
      <PageHero title="Dairy Blog" sub="Tips, stories and updates from our farm." crumbs="Blog" />
      <div className="page-bg"><section className="section container">
        <div className="grid-3">
          {loading && [0, 1, 2].map((i) => <Skeleton key={i} h={320} />)}
          {data?.map((b) => (
            <Link to={`/blog/${b.slug}`} key={b.id} className="card blog-card reveal">
              {b.cover_image && <img src={b.cover_image} alt="" loading="lazy" />}
              <div className="b"><div className="muted" style={{ fontSize: 12 }}>{fmtDate(b.created_at)}</div><h3 style={{ fontSize: 17, margin: '6px 0' }}>{b.title}</h3><p className="muted" style={{ fontSize: 14, margin: 0 }}>{b.excerpt}</p></div>
            </Link>
          ))}
        </div>
        {data && !data.length && <Empty icon="file" title="No articles yet" />}
      </section></div>
    </>
  )
}

export function BlogPost() {
  const { slug } = useParams()
  const { data: b, loading, error } = useFetch(`/api/public/blog/${slug}`)
  if (loading) return <><PageHero title="Loading…" /><div className="container section"><Skeleton h={300} /></div></>
  if (error) return <><PageHero title="Article not found" /><div className="container section"><Empty title="This article is not available" action={<Link to="/blog" className="btn btn-navy">Back to blog</Link>} /></div></>
  return (
    <>
      <PageHero title={b.title} sub={`${b.author} · ${fmtDate(b.created_at)}`} crumbs={<><Link to="/blog">Blog</Link></>} />
      <div className="page-bg"><section className="section container" style={{ maxWidth: 800 }}>
        <article className="card">
          {b.cover_image && <img src={b.cover_image} alt="" style={{ width: '100%', maxHeight: 340, objectFit: 'cover', borderRadius: 14, marginBottom: 20 }} />}
          <div className="prose">{(b.body || '').split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
        </article>
      </section></div>
    </>
  )
}

export function FAQ() {
  const { data, loading } = useFetch('/api/public/faqs')
  const [open, setOpen] = useState(0)
  const cats = [...new Set((data || []).map((f) => f.cat || 'General'))]
  return (
    <>
      <PageHero title="Frequently Asked Questions" sub="Delivery, subscriptions, payments and more." crumbs="FAQ" />
      <div className="page-bg"><section className="section container" style={{ maxWidth: 860 }}>
        {loading && <Skeleton h={300} />}
        {cats.map((c) => (
          <div key={c} style={{ marginBottom: 22 }}>
            <h3 className="serif" style={{ fontSize: 20 }}>{c}</h3>
            {data.map((f, i) => (f.cat || 'General') === c && (
              <div key={i} className={`faq-item ${open === i ? 'open' : ''}`}>
                <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>{f.q}<span className="plus"><I.plus /></span></button>
                <div className="ans">{f.a}</div>
              </div>
            ))}
          </div>
        ))}
        <div className="card" style={{ textAlign: 'center' }}>Still have a question? <Link to="/contact" style={{ fontWeight: 600 }}>Contact us</Link></div>
      </section></div>
    </>
  )
}

export function Contact() {
  const { business: b = {} } = useSite()
  const { user } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', kind: 'enquiry', subject: '', message: '' })
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const { data: areas } = useFetch('/api/public/service-areas')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.name.trim()) v.name = 'Please enter your name'
    if (!f.email && !f.phone) v.email = 'Share an email or phone so we can reply'
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) v.email = 'Enter a valid email'
    if (f.message.trim().length < 5) v.message = 'Please write a short message'
    setErr(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try { const r = await api.post('/api/public/contact', f); setDone(r.message); toast.success('Message sent') }
    catch (e2) { toast.error(e2); if (e2.field) setErr({ [e2.field]: e2.message }) }
    finally { setBusy(false) }
  }
  return (
    <>
      <PageHero title="Contact Us" sub="Questions, delivery requests or feedback – we usually reply within a few hours." crumbs="Contact" />
      <div className="page-bg"><section className="section container">
        <div className="builder">
          <div className="card">
            {done ? <div className="notice ok"><I.check /> {done}</div> : (
              <form onSubmit={submit} noValidate>
                <div className="form-row">
                  <Field label="Your name" error={err.name} id="c-name"><input id="c-name" className={`input ${err.name ? 'err' : ''}`} value={f.name} onChange={set('name')} /></Field>
                  <Field label="Type" id="c-kind"><select id="c-kind" className="input" value={f.kind} onChange={set('kind')}><option value="enquiry">General enquiry</option><option value="support">Order support</option><option value="complaint">Complaint</option></select></Field>
                </div>
                <div className="form-row">
                  <Field label="Email" error={err.email} id="c-email"><input id="c-email" type="email" className={`input ${err.email ? 'err' : ''}`} value={f.email} onChange={set('email')} /></Field>
                  <Field label="Phone" id="c-phone"><input id="c-phone" className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
                </div>
                <Field label="Subject" id="c-sub"><input id="c-sub" className="input" value={f.subject} onChange={set('subject')} /></Field>
                <Field label="Message" error={err.message} id="c-msg"><textarea id="c-msg" className={`input ${err.message ? 'err' : ''}`} value={f.message} onChange={set('message')} /></Field>
                <button className="btn btn-navy" disabled={busy}>{busy && <Spinner />} Send message</button>
              </form>
            )}
          </div>
          <div className="card">
            <h3>Reach us directly</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              <li style={{ display: 'flex', gap: 10 }}><I.whatsapp style={{ color: '#25D366' }} /><a href={`https://wa.me/${b.whatsapp}`} target="_blank" rel="noreferrer">Chat on WhatsApp</a></li>
              <li style={{ display: 'flex', gap: 10 }}><I.chat style={{ color: 'var(--navy)' }} /><a href={`mailto:${b.email}`}>{b.email}</a></li>
              <li style={{ display: 'flex', gap: 10 }}><I.map style={{ color: 'var(--navy)' }} /><span>{b.address}</span></li>
              <li style={{ display: 'flex', gap: 10 }}><I.truck style={{ color: 'var(--navy)' }} /><span>{b.delivery_timings}<br /><small className="muted">{b.order_cutoff}</small></span></li>
            </ul>
            <h4 style={{ marginTop: 20 }}>Areas we deliver to</h4>
            <AreaList areas={areas || []} />
          </div>
        </div>
      </section></div>
    </>
  )
}

function AreaList({ areas }) {
  const byCity = useMemo(() => areas.reduce((acc, a) => { (acc[a.city] = acc[a.city] || []).push(a); return acc }, {}), [areas])
  const cities = Object.keys(byCity).sort((x, y) => (y === 'Narasaraopet') - (x === 'Narasaraopet'))
  const [city, setCity] = useState(null)
  const [q, setQ] = useState('')
  const cur = city && byCity[city] ? city : cities[0]
  if (!cities.length) return null
  const needle = q.trim().toLowerCase()
  const list = (byCity[cur] || []).filter((a) => !needle || a.pincode.includes(needle) || a.area.toLowerCase().includes(needle))
    .sort((x, y) => x.area.localeCompare(y.area))
  return (
    <div className="area-list">
      <div className="area-tabs" role="tablist">
        {cities.map((c) => <button key={c} type="button" role="tab" aria-selected={c === cur} className={c === cur ? 'on' : ''} onClick={() => setCity(c)}>{c}<small>{byCity[c].length}</small></button>)}
      </div>
      <input className="input area-search" placeholder="Search area or PIN code" aria-label="Search area or PIN code" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="area-grid">
        {list.map((a) => <li key={a.id}><span>{a.area}</span><b>{a.pincode}</b></li>)}
        {!list.length && <li className="muted">No match in {cur}.</li>}
      </ul>
    </div>
  )
}

export function Policy() {
  const { key } = useParams()
  const { data, loading, error } = useFetch(`/api/public/policies/${key}`)
  return (
    <>
      <PageHero title={data?.title || (loading ? 'Loading…' : 'Policy')} crumbs="Policies" />
      <div className="page-bg"><section className="section container" style={{ maxWidth: 820 }}>
        <ErrorBox error={error} />
        {data && <div className="card prose">{data.body.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>}
      </section></div>
    </>
  )
}

export function NotFound() {
  return (
    <>
      <PageHero title="Page not found" />
      <div className="container section"><Empty icon="drop" title="Oops – this page spilled." text="The page you're looking for doesn't exist." action={<Link to="/" className="btn btn-navy">Go home</Link>} /></div>
    </>
  )
}
