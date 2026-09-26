import type { ReactNode } from 'react';

import { Card, Screen, Text } from '@/components/ui';

/** Temporary route body: screen ID + title until its milestone builds the real screen. */
export function Placeholder({
  id,
  title,
  milestone,
  children,
}: {
  id: string;
  title: string;
  milestone: string;
  children?: ReactNode;
}) {
  return (
    <Screen scroll>
      <Card>
        <Text variant="caption" tone="secondary">
          {id} · built in {milestone}
        </Text>
        <Text variant="title">{title}</Text>
      </Card>
      {children}
    </Screen>
  );
}
