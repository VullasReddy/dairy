import { Route, Routes } from 'react-router-dom'
import { PublicLayout } from './components/Layout'
import { AppShell, RequireAuth } from './components/Shell'
import { useAuth, useFetch } from './context'
import Home from './pages/public/Home'
import { Products, ProductDetail, Subscriptions, Cart } from './pages/public/Catalog'
import { About, Quality, Testimonials, Blog, BlogPost, FAQ, Contact, Policy, NotFound } from './pages/public/Pages'
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from './pages/public/Auth'
import * as C from './pages/customer/Customer'
import * as A from './pages/admin/AdminCore'
import * as M from './pages/admin/AdminManage'
import StaffApp from './pages/staff/StaffApp'

const CUSTOMER_LINKS = [
  { group: 'My account', items: [
    { to: '/account', label: 'Dashboard', icon: 'home', end: true },
    { to: '/account/subscriptions', label: 'My Subscriptions', icon: 'calendar' },
    { to: '/account/orders', label: 'My Orders', icon: 'orders' },
    { to: '/account/deliveries', label: 'Delivery History', icon: 'truck' },
    { to: '/account/payments', label: 'Payment History', icon: 'card' },
    { to: '/cart', label: 'My Cart', icon: 'cart' },
  ] },
  { group: 'Settings', items: [
    { to: '/account/addresses', label: 'Addresses', icon: 'map' },
    { to: '/account/profile', label: 'Profile & Security', icon: 'user' },
    { to: '/account/notifications', label: 'Notifications', icon: 'bell' },
    { to: '/account/reviews', label: 'My Reviews', icon: 'star' },
    { to: '/account/support', label: 'Help & Support', icon: 'chat' },
  ] },
]

function CustomerShell() {
  const { data } = useFetch('/api/me/notifications')
  const unread = (data || []).filter((n) => !n.is_read).length
  return <AppShell links={CUSTOMER_LINKS} badge={unread} bellTo="/account/notifications" />
}

function AdminShell() {
  const { data, meta } = useFetch('/api/admin/notifications')
  const { user } = useAuth()
  const can = (m) => (user?.permissions || []).includes(`${m}.view`)
  const all = [
    { group: 'Overview', items: [
      { to: '/admin', label: 'Dashboard', icon: 'home', end: true , perm: 'dashboard' },
      { to: '/admin/reports', label: 'Reports & Analytics', icon: 'chart' , perm: 'reports' },
    ] },
    { group: 'Operations', items: [
      { to: '/admin/bookings', label: 'Bookings', icon: 'calendar' , perm: 'bookings' },
      { to: '/admin/deliveries', label: 'Daily Deliveries', icon: 'truck' , perm: 'deliveries' },
      { to: '/admin/staff', label: 'Delivery Staff & Routes', icon: 'route' , perm: 'staff' },
      { to: '/admin/payments', label: 'Payments', icon: 'card' , perm: 'payments' },
      { to: '/admin/customers', label: 'Customers', icon: 'users' , perm: 'customers' },
    ] },
    { group: 'Catalogue', items: [
      { to: '/admin/products', label: 'Products & Pricing', icon: 'box' , perm: 'products' },
      { to: '/admin/plans', label: 'Subscription Plans', icon: 'tag' , perm: 'plans' },
    ] },
    { group: 'Engagement', items: [
      { to: '/admin/content', label: 'Website Content', icon: 'file' , perm: 'content' },
      { to: '/admin/enquiries', label: 'Enquiries', icon: 'chat' , perm: 'enquiries' },
      { to: '/admin/notifications', label: 'Notifications', icon: 'bell', count: meta?.unread || 0 , perm: 'notifications' },
      { to: '/admin/settings', label: 'Settings', icon: 'settings' , perm: 'settings' },
    ] },
  ]
  const links = all.map((g) => ({ ...g, items: g.items.filter((l) => l.perm === 'notifications' || can(l.perm) || (l.perm === 'settings' && can('roles'))) })).filter((g) => g.items.length)
  return <AppShell links={links} badge={meta?.unread || (data || []).filter((n) => !n.is_read).length} bellTo="/admin/notifications" />
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:slug" element={<ProductDetail />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/about" element={<About />} />
        <Route path="/quality" element={<Quality />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/policy/:key" element={<Policy />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/checkout" element={<RequireAuth roles={['customer']}><C.Checkout /></RequireAuth>} />
        <Route path="/pay/:orderId" element={<RequireAuth roles={['customer']}><C.Pay /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/account" element={<RequireAuth roles={['customer']}><CustomerShell /></RequireAuth>}>
        <Route index element={<C.Dashboard />} />
        <Route path="subscriptions" element={<C.MySubscriptions />} />
        <Route path="subscriptions/:id" element={<C.SubscriptionDetail />} />
        <Route path="orders" element={<C.Orders />} />
        <Route path="deliveries" element={<C.Deliveries />} />
        <Route path="payments" element={<C.Payments />} />
        <Route path="addresses" element={<C.Addresses />} />
        <Route path="profile" element={<C.Profile />} />
        <Route path="notifications" element={<C.Notifications />} />
        <Route path="reviews" element={<C.Reviews />} />
        <Route path="support" element={<C.Support />} />
      </Route>

      <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminShell /></RequireAuth>}>
        <Route index element={<A.AdminDashboard />} />
        <Route path="bookings" element={<A.Bookings />} />
        <Route path="bookings/:id" element={<A.BookingDetail />} />
        <Route path="deliveries" element={<A.Deliveries />} />
        <Route path="customers" element={<A.Customers />} />
        <Route path="customers/:id" element={<A.CustomerDetail />} />
        <Route path="payments" element={<A.Payments />} />
        <Route path="reports" element={<A.Reports />} />
        <Route path="products" element={<M.Products />} />
        <Route path="plans" element={<M.Plans />} />
        <Route path="staff" element={<M.Staff />} />
        <Route path="content" element={<M.Content />} />
        <Route path="enquiries" element={<M.Enquiries />} />
        <Route path="notifications" element={<M.AdminNotifications />} />
        <Route path="settings" element={<M.Settings />} />
      </Route>

      <Route path="/staff" element={<RequireAuth roles={['staff']}><StaffApp /></RequireAuth>} />
    </Routes>
  )
}
