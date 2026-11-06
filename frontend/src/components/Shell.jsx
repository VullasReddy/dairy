import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { I } from './Icons'
import { Logo, Spinner } from './ui'
import { useAuth } from '../context'

/** Route guard. roles: array of allowed roles. */
export function RequireAuth({ roles, children }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--navy)' }}><Spinner /></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'staff' ? '/staff' : '/account'} replace />
  }
  return children
}

export function AppShell({ links, title = 'Dashboard', badge, bellTo }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  const current = links.flatMap((g) => g.items).find((l) => (l.end ? loc.pathname === l.to : loc.pathname.startsWith(l.to)))
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Sidebar">
        <Logo light />
        {links.map((g) => (
          <div key={g.group}>
            <div className="side-group">{g.group}</div>
            {g.items.map((l) => {
              const Ico = I[l.icon] || I.box
              return <NavLink key={l.to} to={l.to} end={l.end}><Ico />{l.label}{l.count ? <span className="count">{l.count}</span> : null}</NavLink>
            })}
          </div>
        ))}
        <div className="side-foot">
          <Link to="/" style={{ display: 'flex', gap: 12, padding: '10px 12px' }}><I.home />Back to website</Link>
          <button type="button" className="side-link" onClick={() => { logout(); nav('/') }}><I.logout />Log out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Open menu"><I.menu /></button>
          <h1>{current?.label || title}</h1>
          <div className="grow" />
          {bellTo && <Link to={bellTo} className="bell" aria-label="Notifications"><I.bell />{badge > 0 && <span className="badge">{badge}</span>}</Link>}
          <div className="avatar-chip"><div className="av">{user?.name?.[0]}</div><span>{user?.name}</span></div>
        </header>
        <div className="content"><Outlet /></div>
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 90 }} />}
    </div>
  )
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      {children && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

export function Stat({ icon = 'box', value, label, tone, delay = 0 }) {
  const Ico = I[icon] || I.box
  return (
    <div className="stat" style={{ animationDelay: `${delay * 60}ms` }}>
      <div className={`ic ${tone || ''}`}><Ico /></div>
      <div><div className="v">{value}</div><div className="l">{label}</div></div>
    </div>
  )
}
