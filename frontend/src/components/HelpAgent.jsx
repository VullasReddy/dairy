import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { I } from './Icons'
import { api, inr, waLink } from '../api'
import { useAuth, useSite } from '../context'

/** Help assistant: answers from our FAQs, checks PIN codes, prices and the customer's own subscriptions,
 *  and hands over to a person (support ticket / WhatsApp) when it cannot help. No external AI key needed. */
const QUICK = ['Track my delivery', 'Do you deliver to my area?', 'Milk prices', 'Skip or pause a day', 'Payment & refund', 'Talk to a person']
const words = (t) => (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2)

export default function HelpAgent() {
  const { user } = useAuth()
  const { business: b = {} } = useSite()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([{ from: 'bot', text: 'Hi! 👋 I\'m the Aditya Milk Dairy help assistant. Ask me anything about deliveries, plans, payments or your account.' }])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const faqs = useRef(null)
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, open])

  const say = (m) => setMsgs((x) => [...x, { from: 'bot', ...m }])
  const human = () => ({
    text: 'I\'ll connect you with our team. You can raise a support request (we reply within a few hours) or chat on WhatsApp.',
    links: [user?.role === 'customer' ? ['Raise a support request', '/account/support'] : ['Contact us', '/contact'],
      ...(waLink(b.whatsapp) ? [['Chat on WhatsApp', waLink(b.whatsapp, 'Hi, I need help with my milk delivery.'), true]] : [])],
  })

  const answer = async (q) => {
    const t = q.toLowerCase()
    const pin = q.match(/\b[1-9]\d{5}\b/)
    if (pin) {
      const r = await api.get(`/api/public/pincode/${pin[0]}`)
      return r.serviceable
        ? { text: `✅ Yes! We deliver to ${pin[0]}${r.area ? ` (${r.area}${r.city ? ', ' + r.city : ''})` : ''}. Delivery starts the morning after you subscribe.`, links: [['Buy milk now', '/#order']] }
        : { text: `Sorry, we don't deliver to ${pin[0]} yet. We cover Narasaraopet, Vijayawada, Hyderabad, Bengaluru and Chennai.`, links: [['See our areas', '/faq']] }
    }
    if (/area|deliver to|pin ?code|location|my place|service/.test(t)) return { text: 'Please type your 6-digit PIN code and I\'ll check right away.' }
    if (/track|where.*milk|today|delivery status|not (come|received|delivered)|missed|late/.test(t)) {
      if (user?.role !== 'customer') return { text: 'Please log in so I can check your deliveries.', links: [['Log in', '/login']] }
      const subs = await api.get('/api/me/subscriptions')
      const act = subs.filter((s) => ['active', 'paused', 'pending_approval', 'pending_payment'].includes(s.status))
      if (!act.length) return { text: 'You don\'t have an active subscription right now.', links: [['Start a subscription', '/subscriptions']] }
      return {
        text: act.map((s) => `#${s.id} ${s.plan} – ${s.status.replace('_', ' ')}, ${s.remaining_days} day(s) left (till ${s.end_date}).`).join('\n')
          + (/not|missed|late/.test(t) ? '\nIf today\'s milk has not arrived, please raise a support request and we will fix it right away.' : ''),
        links: [['Delivery history', '/account/deliveries'], ...(/not|missed|late/.test(t) ? [human().links[0]] : [])],
      }
    }
    if (/price|cost|rate|how much|₹/.test(t)) {
      const ps = await api.get('/api/public/products')
      return { text: ps.map((p) => `${p.name}: ${p.variants.map((v) => `${v.label} ${inr(v.price)}`).join(' · ')}`).join('\n') + '\nLonger plans save more (up to 8% on 30 days). Delivery is free.', links: [['Buy milk now', '/#order']] }
    }
    if (/person|human|agent|call|complain|talk|support|problem|issue/.test(t)) return human()
    if (/skip|pause|holiday|vacation|extra|cancel/.test(t)) {
      return { text: 'Open My Subscriptions → choose your plan → use Skip a day, Pause, Add extra milk or Cancel. Changes for tomorrow must be made before the evening cut-off (9 PM).', links: [['My subscriptions', '/account/subscriptions']] }
    }
    if (!faqs.current) faqs.current = await api.get('/api/public/faqs')
    const qw = new Set(words(q))
    let best = null; let score = 0
    for (const f of faqs.current) {
      const fw = words(`${f.q} ${f.q} ${f.a}`)
      const s = fw.filter((w) => qw.has(w)).length / Math.sqrt(fw.length + 4)
      if (s > score) { score = s; best = f }
    }
    if (best && score > 0.25) return { text: best.a, links: [['More FAQs', '/faq']] }
    return { text: 'I\'m not sure about that one.', ...human() }
  }

  const send = async (q) => {
    q = (q ?? text).trim()
    if (!q || busy) return
    setText('')
    setMsgs((x) => [...x, { from: 'me', text: q }])
    setBusy(true)
    try { say(await answer(q === 'Talk to a person' ? 'talk to person' : q)) } catch { say({ text: 'Sorry, something went wrong. Please try again.', ...human() }) } finally { setBusy(false) }
  }

  return (
    <>
      <button type="button" className={`agent-fab ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-label={open ? 'Close help assistant' : 'Open help assistant'} aria-expanded={open}>
        {open ? <I.close size={22} /> : <I.chat size={24} />}<span className="agent-badge">Help</span>
      </button>
      {open && (
        <div className="agent-panel" role="dialog" aria-label="Help assistant">
          <div className="agent-head"><b>Help Assistant</b><small>Usually answers instantly</small></div>
          <div className="agent-body" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`agent-msg ${m.from}`}>
                <div>{m.text}</div>
                {m.links?.length > 0 && <div className="agent-links">{m.links.map(([l, to, ext]) => ext ? <a key={l} href={to} target="_blank" rel="noreferrer">{l}</a> : <Link key={l} to={to} onClick={() => setOpen(false)}>{l}</Link>)}</div>}
              </div>
            ))}
            {busy && <div className="agent-msg bot"><div className="agent-dots"><i /><i /><i /></div></div>}
            {msgs.length < 3 && <div className="agent-quick">{QUICK.map((q) => <button type="button" key={q} onClick={() => send(q)}>{q}</button>)}</div>}
            <div ref={end} />
          </div>
          <form className="agent-input" onSubmit={(e) => { e.preventDefault(); send() }}>
            <input aria-label="Type your question" placeholder="Type your question or PIN code…" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
            <button type="submit" aria-label="Send" disabled={!text.trim() || busy}><I.arrow size={18} /></button>
          </form>
        </div>
      )}
    </>
  )
}
