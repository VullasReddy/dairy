import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, waLink } from '../../api'
import { useAuth, useSite, useToast } from '../../context'
import { Field, Logo, Spinner } from '../../components/ui'
import { Eye, EyeOff } from 'lucide-react'

/** Password input with a show/hide toggle. */
function PasswordInput({ id, value, onChange, className = '', autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} className={`input ${className}`} autoComplete={autoComplete} value={value} onChange={onChange} />
      <button type="button" className="pw-eye" onClick={() => setShow((x) => !x)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  )
}

const homeFor = (u) => (u.role === 'admin' ? '/admin' : u.role === 'staff' ? '/staff' : '/account')

function Shell({ title, sub, children }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Logo />
        <h1>{title}</h1>
        {sub && <p className="muted" style={{ textAlign: 'center', marginTop: -6 }}>{sub}</p>}
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const site = useSite()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState('password')
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const finish = (u) => {
    toast.success(`Welcome back, ${u.name.split(' ')[0]}!`)
    nav(params.get('next') || homeFor(u), { replace: true })
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!f.email || !f.password) { setErr('Please enter your mobile number and password.'); return }
    setBusy(true); setErr('')
    try { finish(await login(f.email, f.password)) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Shell title="Welcome back" sub="Log in to manage your milk subscription">
      {site.otp_login && <div className="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'on' : ''} onClick={() => { setMode('password'); setErr('') }}>Password</button>
        <button type="button" role="tab" aria-selected={mode === 'otp'} className={mode === 'otp' ? 'on' : ''} onClick={() => { setMode('otp'); setErr('') }}>Login with OTP</button>
      </div>}
      {mode === 'password' || !site.otp_login ? (
        <form onSubmit={submit} noValidate>
          {err && <div className="notice err" style={{ marginBottom: 12 }} role="alert">{err}</div>}
          <Field label="Mobile number" id="l-email" hint="Staff & admin can use their email"><input id="l-email" className="input" inputMode="tel" autoComplete="username" placeholder="98765 43210" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Password" id="l-pw"><PasswordInput id="l-pw" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 14 }}><Link to="/forgot-password" style={{ fontSize: 13 }}>Forgot password?</Link></div>
          <button className="btn btn-navy btn-block btn-lg" disabled={busy}>{busy && <Spinner />} Log in</button>
        </form>
      ) : <OtpLogin initial={/^\d/.test(f.email) ? f.email : ''} onDone={finish} />}
      <p style={{ textAlign: 'center', fontSize: 14, marginBottom: 0 }}>New to Aditya Milk Dairy? <Link to={`/register${params.get('next') ? `?next=${params.get('next')}` : ''}`} style={{ fontWeight: 600 }}>Create an account</Link></p>
    </Shell>
  )
}

function OtpLogin({ initial, onDone }) {
  const { loginWithOtp } = useAuth()
  const [id, setId] = useState(initial || '')
  const [step, setStep] = useState('ask')
  const [code, setCode] = useState('')
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])
  const send = async (e) => {
    e?.preventDefault()
    const v = id.trim()
    if (!v) { setErr('Enter your mobile number or email.'); return }
    if (!v.includes('@') && !/^[6-9]\d{9}$/.test(v.replace(/\D/g, '').slice(-10))) { setErr('Enter a valid 10-digit mobile number.'); return }
    setBusy(true); setErr('')
    try {
      const r = await api.post('/api/auth/otp/request', { identifier: v })
      setInfo(r); setStep('code'); setCode(''); setWait(r.resend_in || 30)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  const verify = async (e) => {
    e?.preventDefault()
    if (code.length !== 6) { setErr('Enter the 6-digit code.'); return }
    setBusy(true); setErr('')
    try { onDone(await loginWithOtp(id.trim(), code)) } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  if (step === 'ask') return (
    <form onSubmit={send} noValidate>
      {err && <div className="notice err" style={{ marginBottom: 12 }} role="alert">{err}</div>}
      <Field label="Mobile number or email" id="o-id" hint="We'll send a 6-digit code. No password needed.">
        <input id="o-id" className="input" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={id} onChange={(e) => setId(e.target.value)} />
      </Field>
      <button className="btn btn-navy btn-block btn-lg" disabled={busy}>{busy && <Spinner />} Send OTP</button>
    </form>
  )
  return (
    <form onSubmit={verify} noValidate>
      {err && <div className="notice err" style={{ marginBottom: 12 }} role="alert">{err}</div>}
      <div className="notice info" style={{ marginBottom: 12 }}>Code sent by {info.sent_to.join(' and ')}.</div>
      {info.dev_code && <div className="notice warn" style={{ marginBottom: 12 }}>Development mode – your code is <b>{info.dev_code}</b></div>}
      <Field label="Enter 6-digit code" id="o-code">
        <input id="o-code" className="input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code}
          onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(c) }} />
      </Field>
      <button className="btn btn-navy btn-block btn-lg" disabled={busy || code.length !== 6}>{busy && <Spinner />} Verify &amp; log in</button>
      <div className="otp-links">
        <button type="button" className="link-btn" onClick={() => { setStep('ask'); setErr('') }}>Change number</button>
        {wait > 0 ? <span className="muted">Resend in {wait}s</span> : <button type="button" className="link-btn" disabled={busy} onClick={send}>Resend code</button>}
      </div>
    </form>
  )
}

export function Register() {
  const { register } = useAuth()
  const site = useSite()
  const [otp, setOtp] = useState(null) // { token, message, dev_code } once a code was sent
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(0)
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t) }, [wait])
  const [params] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '', agree: false })
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!f.full_name.trim()) v.full_name = 'Enter your full name'
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) v.email = 'Enter a valid email'
    if (!/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').slice(-10))) v.phone = 'Enter a valid 10-digit mobile number'
    if (f.password.length < 8 || !/\d/.test(f.password) || !/[a-z]/i.test(f.password)) v.password = 'At least 8 characters with a letter and a number'
    if (f.password !== f.confirm) v.confirm = 'Passwords do not match'
    if (!f.agree) v.agree = 'Please accept the terms to continue'
    setErr(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      if (site.otp_login && !otp) { // step 1: text a code to the mobile number
        const r = await api.post('/api/auth/register/send-otp', { phone: f.phone })
        setOtp(r); setWait(r.resend_in || 30); setCode('')
        return
      }
      if (site.otp_login && code.length !== 6) { setErr({ otp: 'Enter the 6-digit code' }); return }
      await register({ full_name: f.full_name, email: f.email.trim() || undefined, phone: f.phone, password: f.password,
        ...(site.otp_login ? { otp_token: otp.otp_token, otp: code } : {}) })
      toast.success('Account created! Welcome to Aditya Milk Dairy.')
      nav(params.get('next') || '/account', { replace: true })
    } catch (e2) { setErr({ [e2.field || 'form']: e2.message }) } finally { setBusy(false) }
  }
  return (
    <Shell title="Create your account" sub="Takes less than a minute">
      <form onSubmit={submit} noValidate>
        {err.form && <div className="notice err" style={{ marginBottom: 12 }}>{err.form}</div>}
        <Field label="Full name" error={err.full_name} id="r-name"><input id="r-name" className={`input ${err.full_name ? 'err' : ''}`} autoComplete="name" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Mobile number" error={err.phone} id="r-phone" hint={site.otp_login ? "We'll send a code to verify this number" : "You'll log in with this number"}><input id="r-phone" className={`input ${err.phone ? 'err' : ''}`} inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" value={f.phone} onChange={(e) => { set('phone')(e); setOtp(null) }} /></Field>
        <Field label="Email (optional)" error={err.email} id="r-email"><input id="r-email" type="email" className={`input ${err.email ? 'err' : ''}`} autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <div className="form-row">
          <Field label="Password" error={err.password} id="r-pw"><PasswordInput id="r-pw" className={err.password ? 'err' : ''} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
          <Field label="Confirm password" error={err.confirm} id="r-pw2"><PasswordInput id="r-pw2" className={err.confirm ? 'err' : ''} autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.agree} onChange={set('agree')} /> I agree to the <Link to="/policy/terms" target="_blank">Terms</Link> and <Link to="/policy/privacy" target="_blank">Privacy Policy</Link></label>
        {err.agree && <div className="field"><span className="error">{err.agree}</span></div>}
        {otp && (
          <div className="notice info" style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 8 }}>{otp.message}</div>
            {otp.dev_code && <div style={{ marginBottom: 8 }}>Development mode – code: <b>{otp.dev_code}</b></div>}
            <Field label="Enter 6-digit code" error={err.otp} id="r-otp">
              <input id="r-otp" className="input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </Field>
            {wait > 0 ? <small className="muted">Resend in {wait}s</small> : <button type="button" className="link-btn" onClick={async () => { try { const r = await api.post('/api/auth/register/send-otp', { phone: f.phone }); setOtp(r); setWait(r.resend_in || 30) } catch (e2) { setErr({ form: e2.message }) } }}>Resend code</button>}
          </div>
        )}
        <button className="btn btn-navy btn-block btn-lg" style={{ marginTop: 16 }} disabled={busy}>{busy && <Spinner />} {site.otp_login && !otp ? 'Send OTP' : site.otp_login ? 'Verify & create account' : 'Create account'}</button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 14, marginBottom: 0 }}>Already have an account? <Link to="/login" style={{ fontWeight: 600 }}>Log in</Link></p>
    </Shell>
  )
}

export function ForgotPassword() {
  const site = useSite()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    try { setMsg(await api.post('/api/auth/forgot-password', { email })) } catch (e2) { setMsg({ error: e2.message }) } finally { setBusy(false) }
  }
  return (
    <Shell title="Forgot password?" sub="We'll help you get back in">
      {waLink(site.business?.whatsapp) && <div className="notice info" style={{ marginBottom: 14 }}>Registered with your mobile number? <a href={waLink(site.business.whatsapp, 'Hi, I forgot my Aditya Milk Dairy password. My registered mobile number is: ')} target="_blank" rel="noreferrer"><b>Message us on WhatsApp</b></a> and we'll reset it for you.</div>}
      {msg?.message ? (
        <div className="notice ok">{msg.message}{msg.dev_reset_token && <> <br /><Link to={`/reset-password?token=${msg.dev_reset_token}`}>(Dev mode) Open reset link</Link></>}</div>
      ) : (
        <form onSubmit={submit}>
          {msg?.error && <div className="notice err">{msg.error}</div>}
          <Field label="Or enter your email (if you added one)" id="f-email"><input id="f-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <button className="btn btn-navy btn-block" disabled={busy}>{busy && <Spinner />} Send reset link</button>
        </form>
      )}
      <p style={{ textAlign: 'center', fontSize: 14 }}><Link to="/login">Back to login</Link></p>
    </Shell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try { setMsg(await api.post('/api/auth/reset-password', { token: params.get('token'), password: pw })) } catch (e2) { setMsg({ error: e2.message }) }
  }
  return (
    <Shell title="Choose a new password">
      {msg?.message ? <div className="notice ok">{msg.message} <Link to="/login">Log in</Link></div> : (
        <form onSubmit={submit}>
          {msg?.error && <div className="notice err">{msg.error}</div>}
          <Field label="New password" hint="At least 8 characters with a letter and a number" id="rp"><PasswordInput id="rp" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <button className="btn btn-navy btn-block">Update password</button>
        </form>
      )}
    </Shell>
  )
}

export function VerifyEmail() {
  const [params] = useSearchParams()
  const { refresh } = useAuth()
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    api.post('/api/auth/verify-email', { token: params.get('token') }).then((r) => { setMsg({ ok: r.message }); refresh() }).catch((e) => setMsg({ err: e.message }))
    // eslint-disable-next-line
  }, [])
  return (
    <Shell title="Email verification">
      {!msg ? <p style={{ textAlign: 'center' }}><Spinner /></p> : msg.ok ? <div className="notice ok">{msg.ok}</div> : <div className="notice err">{msg.err}</div>}
      <p style={{ textAlign: 'center' }}><Link to="/account">Go to my dashboard</Link></p>
    </Shell>
  )
}
