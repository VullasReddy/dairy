import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { inView, animate, AnimatePresence, motion } from 'framer-motion'
import { api, tokenStore } from './api'

/* ------------------------------------------------------------------ toasts */
const ToastCtx = createContext(null)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const id = useRef(0)
  const push = useCallback((message, type = 'info') => {
    const k = ++id.current
    setItems((x) => [...x, { k, message, type }])
    setTimeout(() => setItems((x) => x.filter((t) => t.k !== k)), 4200)
  }, [])
  const toast = useMemo(() => ({
    info: (m) => push(m, 'info'), success: (m) => push(m, 'success'), error: (m) => push(m?.message || m, 'error'),
  }), [push])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.k} className={`toast ${t.type}`} layout initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }}>{t.message}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ------------------------------------------------------------------ auth */
const AuthCtx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setReady(true); return null }
    try { const u = await api.get('/api/auth/me'); setUser(u); return u }
    catch { tokenStore.set(null); setUser(null); return null }
    finally { setReady(true) }
  }, [])

  useEffect(() => {
    refresh()
    const onLogout = () => setUser(null)
    window.addEventListener('amd:logout', onLogout)
    return () => window.removeEventListener('amd:logout', onLogout)
  }, [refresh])

  const login = async (email, password) => {
    const d = await api.post('/api/auth/login', { email, password })
    tokenStore.set(d.token); setUser(d.user); return d.user
  }
  const register = async (payload) => {
    const d = await api.post('/api/auth/register', payload)
    tokenStore.set(d.token); setUser(d.user); return d
  }
  const loginWithOtp = async (identifier, code) => {
    const d = await api.post('/api/auth/otp/verify', { identifier, code })
    tokenStore.set(d.token); setUser(d.user); return d.user
  }
  const logout = () => { tokenStore.set(null); setUser(null) }
  return <AuthCtx.Provider value={{ user, ready, login, loginWithOtp, register, logout, refresh, setUser }}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)

/* ------------------------------------------------------------------ cart
   The cart holds milk selections (variant + packets/day) and the chosen plan/start date.
   Prices are only ever displayed from the server quote – never computed for payment here. */
const CartCtx = createContext(null)
const CART_KEY = 'amd_cart'
const load = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || { items: [], plan_id: null } } catch { return { items: [], plan_id: null } } }

export function CartProvider({ children }) {
  const [cart, setCart] = useState(load)
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* ignore */ } }, [cart])
  const api_ = useMemo(() => ({
    cart,
    count: cart.items.reduce((s, i) => s + i.daily_qty, 0),
    add: (variant, qty = 1) => setCart((c) => {
      const ex = c.items.find((i) => i.variant_id === variant.id)
      const items = ex ? c.items.map((i) => i.variant_id === variant.id ? { ...i, daily_qty: Math.min(10, i.daily_qty + qty) } : i)
        : [...c.items, { variant_id: variant.id, daily_qty: qty, product: variant.product_name, size: variant.label, price: variant.price }]
      return { ...c, items }
    }),
    setQty: (vid, q) => setCart((c) => ({ ...c, items: q <= 0 ? c.items.filter((i) => i.variant_id !== vid) : c.items.map((i) => i.variant_id === vid ? { ...i, daily_qty: Math.min(10, q) } : i) })),
    remove: (vid) => setCart((c) => ({ ...c, items: c.items.filter((i) => i.variant_id !== vid) })),
    setPlan: (plan_id) => setCart((c) => ({ ...c, plan_id })),
    setItems: (items) => setCart((c) => ({ ...c, items })),
    clear: () => setCart({ items: [], plan_id: null }),
  }), [cart])
  return <CartCtx.Provider value={api_}>{children}</CartCtx.Provider>
}
export const useCart = () => useContext(CartCtx)

/* ------------------------------------------------------------------ site content */
const SiteCtx = createContext(null)
export function SiteProvider({ children }) {
  const [site, setSite] = useState(null)
  useEffect(() => { api.get('/api/public/site').then(setSite).catch(() => setSite({ business: {} })) }, [])
  return <SiteCtx.Provider value={site}>{children}</SiteCtx.Provider>
}
export const useSite = () => useContext(SiteCtx) || { business: {} }

/* ------------------------------------------------------------------ data hook */
export function useFetch(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null, meta: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return }
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    api.getFull(path).then((r) => { if (alive) setState({ data: r.data, loading: false, error: null, meta: r }) })
      .catch((e) => { if (alive) setState({ data: null, loading: false, error: e }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps])
  return { ...state, reload: () => setTick((t) => t + 1) }
}

/* ------------------------------------------------------------------ scroll reveal (Framer Motion) */
export function useReveal() {
  useEffect(() => {
    const stops = []
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => {
      stops.push(inView(el, () => {
        el.classList.add('in')
        animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] })
      }, { amount: 0.12 }))
    })
    return () => stops.forEach((s) => s && s())
  })
}
