import { Badge } from '@/components/ui'
import { titleCase } from '@/lib/utils'

const TONES = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
  converted: 'purple',
  ordered: 'info',
  received: 'success',
  pending: 'warning',
  partial: 'warning',
  cancelled: 'danger',
  paid: 'success',
  unpaid: 'danger',
  overdue: 'danger',
  void: 'neutral',
  active: 'success',
  inactive: 'neutral',
  posted: 'success',
}

export function StatusBadge({ status, size = 'md' }) {
  if (!status) return null
  return (
    <Badge tone={TONES[status] || 'neutral'} size={size} dot>
      {titleCase(status)}
    </Badge>
  )
}
