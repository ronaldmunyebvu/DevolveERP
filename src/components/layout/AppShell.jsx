import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  ChevronLeft,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { cn, greetingFor, initialsOf } from '@/lib/utils'
import { Badge, Button } from '@/components/ui'

const NAV_SECTIONS = [
  {
    label: 'Trading',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/app/inventory', label: 'Inventory', icon: Package, module: 'inventory' },
      { to: '/app/purchases', label: 'Purchases', icon: Truck, module: 'purchases' },
      { to: '/app/sales', label: 'Sales & Invoices', icon: ReceiptText, module: 'sales' },
      { to: '/app/quotations', label: 'Quotations', icon: ShoppingCart, module: 'quotations' },
      { to: '/app/contacts', label: 'Customers & Suppliers', icon: Users, module: 'contacts' },
      { to: '/app/transfers', label: 'Stock Transfers', icon: ArrowLeftRight, module: 'transfers' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/app/cashbook', label: 'Cashbook', icon: Wallet, module: 'cashbook' },
      { to: '/app/journals', label: 'Journals', icon: BookOpen, module: 'journals' },
      { to: '/app/ledger', label: 'General ledger', icon: BookOpenCheck, module: 'ledger' },
      { to: '/app/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
      { to: '/app/activity', label: 'Activity log', icon: History, module: 'activity' },
    ],
  },
]

function Brand({ collapsed = false }) {
  const { company } = useAuth()
  return (
    <div className={cn('flex items-center gap-2.5', collapsed ? 'justify-center' : 'px-5')}>
      <img
        src="/logo.jpg"
        alt="Devolve logo"
        className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
      />
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide text-white uppercase">
            {company?.name || 'Devolve'}
          </p>
          <p className="truncate text-[11px] text-ink-400">Truck & Trailer Spares</p>
        </div>
      )}
    </div>
  )
}

function SidebarContent({ onNavigate }) {
  const { user, isAdmin, signOut, can } = useAuth()
  return (
    <div className="flex h-full flex-col bg-ink-950 text-ink-300">
      <div className="py-5">
        <Brand />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-wider text-ink-500 uppercase">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items
                .filter((item) => !item.module || can(item.module))
                .map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'text-ink-300 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <item.icon size={17} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-wider text-ink-500 uppercase">
            Management
          </p>
          <ul className="space-y-0.5">
            {isAdmin && (
              <li>
                <NavLink
                  to="/app/settings"
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'text-ink-300 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Settings size={17} />
                  Settings
                </NavLink>
              </li>
            )}
            <li>
              <NavLink
                to="/app/account"
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-ink-300 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                <Users size={17} />
                My Account
              </NavLink>
            </li>
          </ul>
        </div>
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <NavLink
          to="/app/account"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
              isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500/20 text-[11px] font-semibold text-brand-200">
            {initialsOf(user?.full_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user?.full_name}</span>
            <span className="block truncate text-[11px] text-ink-400">{user?.email}</span>
          </span>
        </NavLink>
        <div className="mt-2 flex items-center gap-2 px-1">
          <Badge tone={isAdmin ? 'brand' : 'neutral'} size="sm">
            {isAdmin ? 'Owner' : 'Staff'}
          </Badge>
          <button
            type="button"
            onClick={signOut}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-400 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
        <p className="mt-3 rounded-md bg-white/5 px-2 py-2 text-center text-[10px] leading-relaxed text-ink-400">
          Sourcing, importation, distribution &amp; retail of motor spares.
        </p>
      </div>
    </div>
  )
}

function sectionTitle(pathname) {
  if (pathname === '/app') return 'Dashboard'
  const found = NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => item.to !== '/app' && pathname.startsWith(item.to),
  )
  if (found) return found.label
  if (pathname.startsWith('/app/settings')) return 'Settings'
  if (pathname.startsWith('/app/account')) return 'My Account'
  return 'Workspace'
}

export function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { user, signOut, can } = useAuth()
  const toast = useToast()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user?.id) return
    const key = `devolve-welcome-${user.id}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {
      // ignore storage failures (private mode)
    }
    const firstName = String(user.full_name || '').split(' ')[0] || 'there'
    toast.info(`Welcome. ${greetingFor(new Date())}, ${firstName}.`)
  }, [user?.id, user?.full_name, toast])

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={cn('no-print hidden shrink-0 transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-64')}
      >
        <div className="sticky top-0 h-screen">
          <div className={cn('h-full transition-[width] duration-200', collapsed && 'w-16')}>
            {collapsed ? (
              <div className="flex h-full flex-col items-center gap-4 bg-ink-950 py-4">
                <img
                  src="/logo.jpg"
                  alt="Devolve logo"
                  className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/15"
                />
                <nav className="flex flex-1 flex-col gap-1">
                  {NAV_SECTIONS.flatMap((section) => section.items)
                    .filter((item) => !item.module || can(item.module))
                    .map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        title={item.label}
                        className={({ isActive }) =>
                          cn(
                            'grid h-10 w-10 place-items-center rounded-lg transition-colors',
                            isActive ? 'bg-brand-600 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-white',
                          )
                        }
                      >
                        <item.icon size={18} />
                      </NavLink>
                    ))}
                </nav>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sign out"
                  className="grid h-10 w-10 place-items-center rounded-lg text-ink-400 hover:bg-white/5 hover:text-white"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <SidebarContent />
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute top-6 -right-3 grid h-6 w-6 place-items-center rounded-full border border-ink-300 bg-white text-ink-500 shadow-sm transition hover:text-ink-800"
          >
            {collapsed ? <ChevronLeft size={14} className="rotate-180" /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-80 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 -right-11 grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{sectionTitle(location.pathname)}</p>
              <p className="truncate text-[11px] text-ink-500">
                {user?.full_name} &middot; {user?.email}
              </p>
            </div>
            <div className="hidden h-8 w-px bg-ink-200 sm:block" />
            <Button variant="secondary" size="sm" onClick={signOut} className="hidden sm:inline-flex">
              <LogOut size={15} />
              Sign out
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  )
}
