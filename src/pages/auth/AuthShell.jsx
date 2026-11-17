import { CheckCircle2 } from 'lucide-react'

const POINTS = [
  'Stock, barcodes and daily quantity balances',
  'Purchases, importation costs and supplier accounts',
  'Cash sales, credit sales and customer statements',
  'Quotations that convert straight into invoices',
  'Cashbook and automatic double-entry journals',
]

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-ink-50 lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(560px circle at 15% 12%, rgba(224,32,32,0.32), transparent 60%), radial-gradient(480px circle at 92% 88%, rgba(193,18,31,0.24), transparent 62%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Devolve logo"
              className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/20"
            />
            <div>
              <p className="text-2xl font-bold tracking-[0.18em] uppercase">Devolve</p>
              <p className="text-xs text-ink-300">Motor Spares ERP</p>
            </div>
          </div>
          <h2 className="mt-12 max-w-md text-3xl leading-tight font-semibold">
            Source it. Import it. Stock it. Sell it. Track every dollar.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-300">
            One workspace for inventory, purchasing, quotations, credit sales and the books behind them.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-ink-200">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative border-t border-white/10 pt-5 text-xs text-ink-400">
          <p className="font-semibold text-ink-200">Devolve Motor Spares</p>
          <p className="mt-0.5">Sourcing &middot; Importation &middot; Distribution &middot; Retail</p>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/logo.jpg" alt="Devolve logo" className="h-11 w-11 rounded-lg object-cover" />
            <div>
              <p className="text-lg font-bold tracking-[0.16em] uppercase">Devolve</p>
              <p className="text-[11px] text-ink-500">Motor Spares ERP</p>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-500">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
