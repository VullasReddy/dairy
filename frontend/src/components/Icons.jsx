import * as Lu from 'lucide-react'
/* App icons come from Lucide (lucide-react). Brand logos (Facebook, Instagram, YouTube, WhatsApp)
   are not part of Lucide, so they are small inline SVGs below. */
const L = (C) => function LucideIcon({ size = 22, ...p }) { return <C size={size} strokeWidth={1.8} aria-hidden="true" {...p} /> }

export const I = {
  shield: L(Lu.ShieldCheck), barn: L(Lu.Warehouse), truck: L(Lu.Truck), lock: L(Lu.ShieldCheck), smile: L(Lu.Smile),
  cart: L(Lu.ShoppingCart), user: L(Lu.User), arrow: L(Lu.ArrowRight), play: L(Lu.SquarePlay), phone: L(Lu.Phone),
  mail: L(Lu.Mail), pin: L(Lu.MapPin), menu: L(Lu.Menu), close: L(Lu.X), plus: L(Lu.Plus), bell: L(Lu.Bell),
  home: L(Lu.House), box: L(Lu.Package), calendar: L(Lu.CalendarDays), card: L(Lu.CreditCard), map: L(Lu.MapPin),
  chat: L(Lu.MessageSquare), settings: L(Lu.Settings), chart: L(Lu.ChartColumn || Lu.BarChart3), users: L(Lu.Users),
  file: L(Lu.FileText), tag: L(Lu.Tag), logout: L(Lu.LogOut), check: L(Lu.Check), star: L(Lu.Star),
  search: L(Lu.Search), download: L(Lu.Download), edit: L(Lu.Pencil), trash: L(Lu.Trash2), drop: L(Lu.Droplet),
  route: L(Lu.Route), lab: L(Lu.FlaskConical), pack: L(Lu.PackageOpen), farm: L(Lu.Tractor), refresh: L(Lu.RefreshCw),
  pause: L(Lu.Pause), skip: L(Lu.SkipForward), orders: L(Lu.ClipboardList), history: L(Lu.History),
  roles: L(Lu.UserCog), approve: L(Lu.CheckCheck), alert: L(Lu.TriangleAlert || Lu.AlertTriangle),
  sheet: L(Lu.FileSpreadsheet), eye: L(Lu.Eye),
  facebook: (p) => <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" {...p}><path fill="currentColor" d="M12 2a10 10 0 00-1.6 19.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0012 2z" /></svg>,
  instagram: (p) => <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>,
  youtube: (p) => <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" {...p}><path fill="currentColor" d="M21.6 7.2a2.6 2.6 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 002.4 7.2 27 27 0 002 12a27 27 0 00.4 4.8 2.6 2.6 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 001.8-1.8A27 27 0 0022 12a27 27 0 00-.4-4.8zM10 15V9l5.2 3z" /></svg>,
  whatsapp: (p) => <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" {...p}><path fill="currentColor" d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5 0a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.5-.3z" /></svg>,
}

/* colourful quality-promise badges (as in the reference design) */
export const Promise = {
  leaf: () => <svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="20" r="17" fill="#2E9E5B" /><path d="M20 30c0-6 0-10 0-13" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><path d="M20 22c-6 0-9-3-9-9 6 0 9 3 9 9zM20 19c0-5 3-8 8-8 0 5-3 8-8 8z" fill="#BFEFC9" /></svg>,
  check: () => <svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="20" r="17" fill="#2E9E5B" /><path d="M12 20.5l5.5 5.5L28.5 14" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  medal: () => <svg viewBox="0 0 40 40" width="38" height="38"><path d="M14 24l-4 12 6-3 3 5 3-10M26 24l4 12-6-3-3 5-3-10" fill="#C99A2E" /><circle cx="20" cy="16" r="11" fill="#E8B75C" stroke="#B9861F" strokeWidth="2" /><circle cx="20" cy="16" r="6.5" fill="#F8D98D" stroke="#B9861F" strokeWidth="1.5" /><path d="M20 12l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="#B9861F" /></svg>,
  heart: () => <svg viewBox="0 0 40 40" width="38" height="38"><path d="M20 33S6 24.5 6 15a7 7 0 0114-2 7 7 0 0114 2c0 9.5-14 18-14 18z" fill="none" stroke="#7A4B12" strokeWidth="3.4" strokeLinejoin="round" /><path d="M20 29S9.5 22.5 9.5 15.5" stroke="#E8B75C" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>,
}

export const Swoosh = () => (
  <svg viewBox="0 0 150 10" aria-hidden="true"><path d="M2 8 C 40 1, 100 1, 148 6" stroke="#073B70" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
)
