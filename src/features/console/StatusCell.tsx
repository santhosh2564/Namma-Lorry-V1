import { Chip } from '@/components/ui';
import { t } from '@/i18n';

import type { Activity } from './consoleData';

export function ActivityChip({ status }: { status: Activity }) {
  if (status === 'on_trip')
    return <Chip label={t.console.status.on_trip} tone="live" icon="local-shipping" />;
  if (status === 'inactive') return <Chip label={t.console.status.inactive} tone="neutral" icon="block" />;
  return <Chip label={t.console.status.available} tone="verified" icon="check-circle" />;
}
