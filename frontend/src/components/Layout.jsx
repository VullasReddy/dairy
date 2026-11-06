import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { I } from './Icons'
import { Logo } from './ui'
import { LocationChip, UnavailableBar } from './Location'
import { useAuth, useCart, useSite } from '../context'

const LINKS = [
  ['/', 'Home'], ['/products', 'Products'], ['/subscriptions', 'Subscriptions'], ['/about', 'About'],
  ['/quality', 'Quality'], ['/testimonials', 'Testimonials'], ['/blog', 'Blog'], ['/faq', 'FAQ'], ['/contact', 'Contact'],
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const { user, logout } = useAuth()
  const { count } = useCart()
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => { setOpen(false); setMenu(false) }, [loc.pathname])
  const home = user?.role === 'admin' ? '/admin' : user?.role === 'staff' ? '/staff' : '/account'

  return (
    <header className="nav-wrap">
      <nav className="nav" aria-label="Main">
        <div className="nav-logo"><Logo /></div>
        <ul className={`nav-links ${open ? 'open' : ''}`}>
          {LINKS.map(([to, label]) => (
            <li key={to}><NavLink to={to} end={to === '/'}>{label}</NavLink></li>
          ))}
        </ul>
        <div className="nav-actions">
          <LocationChip />
          <Link to="/cart" className="cart-btn" aria-label={`Cart, ${count} packets`}>
            <I.cart size={21} /><span className="badge">{count}</span>
          </Link>
          {user ? (
            <div className="user-menu">
              <button className="btn btn-navy btn-sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                <I.user size={16} /><span className="login-label">{user.name.split(' ')[0]}</span>
              </button>
              {menu && (
                <div className="dropdown">
                  <Link to={home}>{user.role === 'customer' ? 'My Dashboard' : user.role === 'admin' ? 'Admin Panel' : 'My Deliveries'}</Link>
                  {user.role === 'customer' && <><Link to="/account/subscriptions">My Subscriptions</Link><Link to="/account/deliveries">Deliveries</Link><Link to="/account/profile">Profile</Link></>}
                  <button onClick={() => { logout(); nav('/') }}>Log out</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="btn btn-navy btn-sm"><I.user size={16} /><span className="login-label">Login<span className="long"> / Sign Up</span></span></Link>
          )}
          <button className="nav-toggle" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>{open ? <I.close /> : <I.menu />}</button>
        </div>
      </nav>
      <div className="loc-mobile"><LocationChip /></div>
    </header>
  )
}

export function Footer() {
  const { business: b = {} } = useSite()
  const social = b.social || {}
  return (
    <footer>
      <div className="footer">
        <div className="container footer-grid">
          <div style={{ paddingTop: 10 }}><Logo light /></div>
          <div>
            <h4>Quick Links</h4>
            <div className="links">
              <div><Link to="/">Home</Link><Link to="/products">Products</Link><Link to="/subscriptions">Subscriptions</Link></div>
              <div><Link to="/about">About</Link><Link to="/quality">Quality</Link><Link to="/testimonials">Testimonials</Link></div>
              <div><Link to="/blog">Blog</Link><Link to="/faq">FAQ</Link><Link to="/contact">Contact</Link></div>
            </div>
          </div>
          <div>
            <h4>Contact Us</h4>
            <ul className="contact">
              <li><I.phone /><a href={`tel:${(b.phone || '').replace(/\s/g, '')}`}>{b.phone || '+91 98765 43210'}</a></li>
              <li><I.mail /><a href={`mailto:${b.email}`}>{b.email || 'info@adityamilkdairy.com'}</a></li>
              <li><I.pin /><span>{b.city || 'Vijayawada'}, India</span></li>
            </ul>
          </div>
          <div>
            <h4>Follow Us</h4>
            <div className="socials">
              {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><I.facebook /></a>}
              {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><I.instagram /></a>}
              {social.youtube && <a href={social.youtube} target="_blank" rel="noreferrer" aria-label="YouTube"><I.youtube /></a>}
              {b.whatsapp && <a href={`https://wa.me/${b.whatsapp}`} aria-label="WhatsApp" target="_blank" rel="noreferrer"><I.whatsapp /></a>}
            </div>
          </div>
          <div className="slogan" aria-hidden="true">Goodness in every<span>drop</span></div>
        </div>
        <img className="splash" src="/images/footer-splash.png" alt="" />
      </div>
      <div className="footer-bottom">
        <div className="container">
          <span>© {new Date().getFullYear()} {b.business_name || 'Aditya Milk Dairy'}. All rights reserved.</span>
          <span className="pol"><Link to="/policy/privacy">Privacy Policy</Link> | <Link to="/policy/terms">Terms &amp; Conditions</Link> | <Link to="/policy/refund">Refund Policy</Link></span>
        </div>
      </div>
    </footer>
  )
}

const TITLES = {
  '/products': 'Cow Milk & Buffalo Milk', '/subscriptions': 'Milk Subscription Plans', '/about': 'About Us',
  '/quality': 'Quality & Lab Reports', '/testimonials': 'Customer Reviews', '/blog': 'Dairy Blog', '/faq': 'FAQs',
  '/contact': 'Contact Us', '/cart': 'Cart', '/checkout': 'Checkout', '/login': 'Login', '/register': 'Create Account',
}

export function PublicLayout() {
  const loc = useLocation()
  const { business: b = {} } = useSite()
  useEffect(() => {
    window.scrollTo(0, 0)
    const t = TITLES[loc.pathname] || (loc.pathname.startsWith('/products/') ? 'Product' : loc.pathname.startsWith('/blog/') ? 'Blog' : null)
    document.title = t ? `${t} | Aditya Milk Dairy` : 'Aditya Milk Dairy – Farm Fresh Milk, Delivered to Your Home'
  }, [loc.pathname])
  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <Navbar />
      <main id="main"><Outlet /></main>
      <Footer />
      <UnavailableBar />
      {b.whatsapp && <a className="whatsapp-fab" href={`https://wa.me/${b.whatsapp}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"><I.whatsapp /></a>}
    </>
  )
}
