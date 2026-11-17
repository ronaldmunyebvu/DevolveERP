import { cn } from '@/lib/utils'

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  ink: 'bg-ink-100 text-ink-700',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  sky: 'bg-sky-50 text-sky-600',
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand', className }) {
  return (
    <div className={cn('card flex items-start gap-3 px-4 py-4', className)}>
      {Icon && (
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', TONES[tone])}>
          <Icon size={19} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-ink-900 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-ink-400">{hint}</p>}
      </div>
    </div>
  )
}
