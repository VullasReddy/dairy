import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../api'
import { useAuth, useToast } from '../context'
import { I } from './Icons'
import { Modal, Spinner } from './ui'

/* Customer's delivery location – chosen once (GPS, PIN code or city) and remembered.
   loc = { city, state, available, area?, pincode?, source: 'gps' | 'pin' | 'city' } */
const LOC_KEY = 'amd_location'
const Ctx = createContext(null)
const NO_AUTO_ASK = /^\/(login|register|forgot-password|reset-password|verify-email|account|admin|staff|pay|checkout)(\/|$)/
const read = () => { try { return JSON.parse(localStorage.getItem(LOC_KEY)) } catch { return null } }

export function LocationProvider({ children }) {
  const [loc, setLocState] = useState(read)
  const [open, setOpen] = useState(false)
  const [cities, setCities] = useState(null)
  const loadCities = useCallback(() => api.get('/api/public/locations').then(setCities).catch(() => setCities([])), [])
  useEffect(() => { loadCities() }, [loadCities])
  useEffect(() => {
    // First visit: ask for the location straight away (once per browser session)
    // – only on shopping pages, never over login, account, admin or delivery-staff screens
    if (!loc && !sessionStorage.getItem('amd_loc_asked')) {
      const t = setTimeout(() => {
        if (NO_AUTO_ASK.test(window.location.pathname)) return
        setOpen(true); sessionStorage.setItem('amd_loc_asked', '1')
      }, 700)
      return () => clearTimeout(t)
    }
  }, [loc])
  const setLocation = (l) => { setLocState(l); try { localStorage.setItem(LOC_KEY, JSON.stringify(l)) } catch { /* ignore */ } }
  const value = useMemo(() => ({ loc, setLocation, open, openPicker: () => setOpen(true), closePicker: () => setOpen(false), cities, available: (cities || []).filter((c) => c.available) }), [loc, open, cities])
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <LocationPicker />}
    </Ctx.Provider>
  )
}
export const useLocation2 = () => useContext(Ctx)

/** Detect the customer's city from browser GPS. Resolves to a location object, rejects with a readable message. */
export function locateByGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Your browser does not support location access. Enter your PIN code instead.')); return }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await api.get(`/api/public/locate?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
        if (r.city) resolve({ city: r.city.name, state: r.city.state, available: r.city.available, source: 'gps', nearest: r.nearest_available?.name })
        else resolve({ city: 'your area', available: false, source: 'gps', nearest: r.nearest_available?.name, nearestKm: r.nearest_available?.distance_km })
      } catch (e) { reject(e) }
    }, (err) => reject(new Error(err.code === 1
      ? 'Location permission was denied. Allow location for this site in your browser (lock icon in the address bar), or enter your PIN code.'
      : 'Could not detect your location. Please enter your PIN code.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 })
  })
}

/* ---------------------------------------------------------------- header chip */
export function LocationChip() {
  const { loc, openPicker } = useLocation2()
  return (
    <button type="button" className={`loc-chip ${loc && !loc.available ? 'off' : ''}`} onClick={openPicker} aria-label={`Delivery location: ${loc?.city || 'not set'}. Change`}>
      <I.pin size={16} />
      <span className="loc-text"><small>{loc ? (loc.available ? 'Deliver to' : 'Not available') : 'Select'}</small><b>{loc ? (loc.area ? `${loc.area}, ${loc.city}` : loc.city) : 'Location'}</b></span>
      <Chevron />
    </button>
  )
}
const Chevron = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>

/* ---------------------------------------------------------------- unavailable bar */
export function UnavailableBar() {
  const { loc, openPicker, available } = useLocation2()
  const [notify, setNotify] = useState(false)
  if (!loc || loc.available) return null
  return (
    <>
      <AnimatePresence>
        <motion.div className="unavail-bar" role="status" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
          <span className="ub-ic"><I.alert size={20} /></span>
          <span className="ub-text">
            <b>Sorry, we don't deliver to {loc.area ? `${loc.area}, ` : ''}{loc.city} yet.</b>
            <span>Available in {available.map((c) => c.name).join(', ') || 'our current cities'}.</span>
          </span>
          <button className="btn btn-sm btn-gold" onClick={() => setNotify(true)}>Notify me</button>
          <button className="btn btn-sm btn-outline" onClick={openPicker}>Change location</button>
        </motion.div>
      </AnimatePresence>
      {notify && <NotifyModal city={loc.city} onClose={() => setNotify(false)} />}
    </>
  )
}

function NotifyModal({ city, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '' })
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!f.name.trim() || (!f.phone.trim() && !f.email.trim())) { toast.error('Please enter your name and a phone number or email'); return }
    setBusy(true)
    try {
      await api.post('/api/public/contact', { ...f, kind: 'enquiry', subject: `Delivery request – ${city}`, message: `Please start milk delivery in ${city}. Notify me when you launch.` })
      toast.success(`Thanks! We'll let you know when we start in ${city}.`); onClose()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Get notified when we launch in ${city}`} onClose={onClose}>
      <div className="field"><label htmlFor="n-name">Name</label><input id="n-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="form-row">
        <div className="field"><label htmlFor="n-phone">Mobile</label><input id="n-phone" className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label htmlFor="n-email">Email</label><input id="n-email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      </div>
      <button className="btn btn-navy" onClick={send} disabled={busy}>{busy && <Spinner />} Notify me</button>
    </Modal>
  )
}

/* ---------------------------------------------------------------- picker modal */
function LocationPicker() {
  const { loc, setLocation, closePicker, cities } = useLocation2()
  const toast = useToast()
  const [gps, setGps] = useState({ busy: false, msg: null })
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [result, setResult] = useState(null) // unavailable result to show before closing

  const choose = (l, quiet) => {
    setLocation(l)
    if (l.available) { if (!quiet) toast.success(`Great! We deliver in ${l.area ? `${l.area}, ` : ''}${l.city}.`); closePicker() }
    else setResult(l)
  }

  const useGps = async () => {
    setGps({ busy: true, msg: null })
    try { const l = await locateByGps(); setGps({ busy: false, msg: null }); choose(l) } catch (e) { setGps({ busy: false, msg: e.message }) }
  }

  const checkPin = async (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin)) { toast.error('Enter a 6-digit PIN code'); return }
    setPinBusy(true)
    try {
      const r = await api.get(`/api/public/pincode/${pin}`)
      if (r.serviceable) choose({ city: r.city, area: r.area, pincode: pin, available: true, source: 'pin' })
      else choose({ city: `PIN ${pin}`, pincode: pin, available: false, source: 'pin' })
    } catch (e2) { toast.error(e2) } finally { setPinBusy(false) }
  }

  const avail = (cities || []).filter((c) => c.available)
  const soon = (cities || []).filter((c) => !c.available)
  return (
    <Modal title="Choose your delivery location" onClose={closePicker} wide>
      {result ? (
        <div className="text-center py-2">
          <div className="mx-auto mb-3 w-16 h-16 rounded-full bg-[#FFF3D6] text-[#9A6B00] grid place-items-center"><I.alert size={30} /></div>
          <h3 className="serif text-xl mb-1">Sorry, we don't deliver to {result.area ? `${result.area}, ` : ''}{result.city} yet</h3>
          <p className="muted mt-0">We currently deliver in <b className="text-navy-ink">{avail.map((c) => c.name).join(', ')}</b>.
            {result.nearest && <> Nearest service city: <b className="text-navy-ink">{result.nearest}</b>{result.nearestKm ? ` (${Math.round(result.nearestKm)} km)` : ''}.</>}</p>
          <div className="flex gap-2.5 justify-center flex-wrap mt-4">
            <button className="btn btn-navy" onClick={() => setResult(null)}>Choose another location</button>
            <button className="btn btn-outline" onClick={closePicker}>Browse anyway</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="gps-btn" onClick={useGps} disabled={gps.busy}>
            <span className="gps-ic">{gps.busy ? <Spinner /> : <Crosshair />}</span>
            <span><b>Use my current location</b><small>{gps.busy ? 'Detecting your location…' : 'Detect automatically using GPS'}</small></span>
          </button>
          {gps.msg && <div className="notice warn mt-2.5 text-sm">{gps.msg}</div>}

          <div className="or-line"><span>or enter your PIN code</span></div>
          <form onSubmit={checkPin} className="flex gap-2.5">
            <input className="input" inputMode="numeric" maxLength={6} placeholder="e.g. 560034" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN code" />
            <button className="btn btn-navy" disabled={pinBusy}>{pinBusy && <Spinner />} Check</button>
          </form>

          <h4 className="mt-5 mb-2.5 text-[15px]">Available cities</h4>
          <div className="city-grid">
            {!cities && <div className="muted text-sm">Loading…</div>}
            {avail.map((c) => (
              <button key={c.name} type="button" className={`city-card ${loc?.city === c.name ? 'on' : ''}`} onClick={() => choose({ city: c.name, state: c.state, available: true, source: 'city' })}>
                <span className="cc-ic"><I.pin size={18} /></span>
                <b>{c.name}</b><small>{c.areas} areas</small>
                <span className="cc-tag ok"><I.check size={12} /> Available</span>
              </button>
            ))}
          </div>
          {soon.length > 0 && <>
            <h4 className="mt-5 mb-2.5 text-[15px]">Other cities</h4>
            <div className="city-grid">
              {soon.map((c) => (
                <button key={c.name} type="button" className="city-card soon" onClick={() => choose({ city: c.name, state: c.state, available: false, source: 'city' })}>
                  <span className="cc-ic"><I.pin size={18} /></span>
                  <b>{c.name}</b><small>{c.state}</small>
                  <span className="cc-tag">Not available yet</span>
                </button>
              ))}
            </div>
          </>}
        </>
      )}
    </Modal>
  )
}
const Crosshair = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
