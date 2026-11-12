// Thin REST client for the Flask API. In dev, Vite proxies /api to http://127.0.0.1:5000.
const BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'amd_token'

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

export class ApiError extends Error {
  constructor(message, status, field) { super(message); this.status = status; this.field = field }
}

import axios from 'axios'

// Axios instance – JSON in/out, bearer token attached, consistent error objects.
export const http = axios.create({ baseURL: BASE, timeout: 20000 })
http.interceptors.request.use((cfg) => {
  const t = tokenStore.get()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})
http.interceptors.response.use((res) => res, (err) => {
  if (!err.response) return Promise.reject(new ApiError('Cannot reach the server. Please check your connection.', 0))
  const { status, data } = err.response
  if (status === 401 && tokenStore.get() && !String(err.config?.url).includes('/api/auth/login')) {
    tokenStore.set(null)
    window.dispatchEvent(new Event('amd:logout'))
  }
  const msg = (data && typeof data === 'object' && data.error) || `Request failed (${status})`
  return Promise.reject(new ApiError(msg, status, data?.field))
})

async function request(method, path, body, opts = {}) {
  const res = await http.request({ method, url: path, data: body, headers: opts.headers, responseType: opts.raw ? 'blob' : 'json' })
  if (opts.raw) return res
  if (res.data && res.data.ok === false) throw new ApiError(res.data.error, res.status, res.data.field)
  return res.data
}

export const api = {
  get: (p) => request('GET', p).then((r) => r.data),
  getFull: (p) => request('GET', p),
  post: (p, b = {}, o) => request('POST', p, b, o).then((r) => r.data),
  put: (p, b = {}) => request('PUT', p, b).then((r) => r.data),
  del: (p) => request('DELETE', p).then((r) => r.data),
  upload: (file) => { const f = new FormData(); f.append('file', file); return request('POST', '/api/admin/upload', f).then((r) => r.data) },
  download: async (p, filename) => {
    let res
    try { res = await request('GET', p, undefined, { raw: true }) } catch (e) {
      // error bodies arrive as blobs for downloads
      throw e
    }
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

export const inr = (n) => { const v = Number(n || 0); const d = Number.isInteger(v) ? 0 : 2; return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: 2 }) }
export const fmtDate = (d, o = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', o) : '—'
export const fmtDateTime = (d) => d ? new Date(d + (d.endsWith('Z') ? '' : 'Z')).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
export const isoDate = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10) }
export const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return isoDate(d) }
export const todayISO = () => isoDate(new Date())
/** WhatsApp click-to-chat link (free, no API needed). Indian 10-digit numbers get the 91 prefix. */
export const waLink = (phone, text = '') => {
  const d = String(phone || '').replace(/\D/g, '')
  if (!d) return null
  const num = d.length === 10 ? '91' + d : d
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
