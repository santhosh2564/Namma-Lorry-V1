import { MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Chip, Screen, Text } from '@/components/ui';
import { profileQueryKey } from '@/features/auth/useProfile';
import { useAuthStore } from '@/features/auth/store';
import { needsBatterySetup } from '@/features/onboarding/batteryFlag';
import { recordConsent } from '@/features/onboarding/consent';
import {
  canContinue,
  nextStep,
  permissionRows,
  readyCount,
  type PermissionKey,
  type PermissionRow,
  type PermissionSnapshot,
} from '@/features/onboarding/permissionModel';
import { t, useLanguage } from '@/i18n';
import { config } from '@/lib/config';
import {
  openAppSettings,
  openLocationServicesSettings,
  permissionsQueryKey,
  readPermissions,
  requestBackground,
  requestForeground,
  requestNotifications,
} from '@/tracking/permissions';
import { colors, radius, sizes, space } from '@/theme/tokens';

const s = t.permissions;
/** Icons for the three disclosure rows (texts in en.json permissions.disclosure). */
const DISCLOSURE_ICONS = ['play-circle-outline', 'verified', 'groups'] as const;
const snapshotKey = [...permissionsQueryKey, 'snapshot'] as const;

const REQUEST: Record<PermissionKey, () => Promise<void>> = {
  location: requestForeground,
  background: requestBackground,
  notifications: requestNotifications,
};

const ROW_ICON = {
  location: 'my-location',
  background: 'history',
  notifications: 'notifications-none',
} as const;

/**
 * D1 Location Permission (docs/12 D1, docs/09 §1–§3). The prominent disclosure is on screen
 * before any system dialog: nothing is requested until the driver taps a row's Allow.
 */
export default function LocationPermission() {
  useLanguage(); // re-render on language change (M12a)
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useAuthStore((st) => st.session?.user.id);
  const snapshot = useQuery({ queryKey: snapshotKey, queryFn: readPermissions, networkMode: 'always' });
  const [busy, setBusy] = useState<PermissionKey | 'continue' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: permissionsQueryKey });

  async function runStep(row: PermissionRow) {
    setBusy(row.key);
    try {
      if (row.state === 'settings' || row.state === 'optional-denied') await openAppSettings();
      else await REQUEST[row.key]();
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  async function onContinue() {
    setBusy('continue');
    setError(null);
    try {
      await recordConsent();
      await Promise.all([qc.invalidateQueries({ queryKey: profileQueryKey(userId) }), refresh()]);
      router.replace((await needsBatterySetup()) ? '/battery' : '/');
    } catch {
      setError(s.consentFailed);
    } finally {
      setBusy(null);
    }
  }

  const snap = snapshot.data;
  const next = snap ? nextStep(snap) : null;

  return (
    <Screen scroll background="surface">
      <View style={styles.header}>
        <Text variant="caption" tone="secondary" testID="d1-step">
          {snap?.platform === 'ios' ? s.stepIos : s.step}
        </Text>
        <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no">
          <MaterialIcons name="place" size={48} color={colors.primary} />
          <View style={styles.road} />
          <MaterialIcons name="local-shipping" size={28} color={colors.accent} style={styles.lorry} />
        </View>
        <Text variant="title" accessibilityRole="header">
          {s.title}
        </Text>
      </View>

      <Card>
        {s.disclosure.map((d, i) => (
          <View key={DISCLOSURE_ICONS[i]} style={styles.disclosureRow}>
            <View style={styles.iconBubble}>
              <MaterialIcons name={DISCLOSURE_ICONS[i] ?? 'info-outline'} size={20} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{d.title}</Text>
              <Text variant="caption" tone="secondary">
                {d.body}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {snap && !snap.servicesEnabled ? (
        <View style={styles.stack}>
          <Banner tone="warn" message={s.gpsOff} testID="d1-gps-off" />
          <Button label={s.turnOnGps} variant="outline" onPress={() => void openLocationServicesSettings()} />
        </View>
      ) : null}

      <Card>
        <View style={styles.cardHead}>
          <Text variant="subtitle">{s.checklist}</Text>
          {snap ? (
            <Text variant="caption" tone="secondary" testID="d1-ready-count">
              {s.readyCount(readyCount(snap))}
            </Text>
          ) : null}
        </View>
        {snap ? (
          permissionRows(snap).map((row) => (
            <PermissionRowView
              key={row.key}
              row={row}
              isNext={next?.key === row.key}
              busy={busy === row.key}
              disabled={busy !== null}
              onPress={() => void runStep(row)}
            />
          ))
        ) : (
          <Text tone="secondary">…</Text>
        )}
      </Card>

      {snap ? <StepHelp snap={snap} next={next} onSettings={() => void openAppSettings()} /> : null}

      {config.EXPO_PUBLIC_PRIVACY_POLICY_URL ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(config.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}
          style={styles.link}
        >
          <Text variant="bodyStrong" style={styles.linkText}>
            {s.privacyPolicy}
          </Text>
        </Pressable>
      ) : null}

      {error ? <Banner tone="error" message={error} testID="d1-error" /> : null}
      <Text variant="caption" tone="secondary">
        {s.agree}
      </Text>
      <Button
        label={s.continue}
        onPress={() => void onContinue()}
        disabled={!snap || !canContinue(snap) || (busy !== null && busy !== 'continue')}
        loading={busy === 'continue'}
        testID="d1-continue"
      />
    </Screen>
  );
}

function PermissionRowView({
  row,
  isNext,
  busy,
  disabled,
  onPress,
}: {
  row: PermissionRow;
  isNext: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const copy = s.rows[row.key];
  let right;
  if (row.state === 'allowed') right = <Chip label={s.status.allowed} tone="verified" icon="check-circle" />;
  else if (row.state === 'optional-denied')
    right = <Chip label={s.status.off} tone="review" icon="notifications-off" />;
  else if (isNext) {
    right = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.state === 'settings' ? s.status.settings : s.status.allow}: ${copy.title}`}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        hitSlop={8}
        testID={`d1-${row.key}-action`}
        style={({ pressed }) => [
          styles.action,
          row.state === 'settings' && styles.actionSettings,
          pressed && styles.pressed,
        ]}
      >
        <Text
          variant="bodyStrong"
          style={row.state === 'settings' ? styles.actionSettingsText : styles.actionText}
        >
          {busy ? '…' : row.state === 'settings' ? s.status.settings : s.status.allow}
        </Text>
      </Pressable>
    );
  } else right = <Chip label={s.status.waiting} tone="neutral" icon="schedule" />;

  return (
    <View
      style={styles.permRow}
      testID={`d1-row-${row.key}`}
      accessibilityLabel={`${copy.title}: ${row.state}`}
    >
      <MaterialIcons name={ROW_ICON[row.key]} size={22} color={colors.textSecondary} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{copy.title}</Text>
        <Text variant="caption" tone="secondary">
          {copy.hint}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** Explains a blocked step (the system won't ask again) and the notifications-off trade-off. */
function StepHelp({
  snap,
  next,
  onSettings,
}: {
  snap: PermissionSnapshot;
  next: PermissionRow | null;
  onSettings: () => void;
}) {
  if (next?.state === 'settings') {
    const msg =
      next.key === 'location'
        ? snap.foreground === 'granted' && !snap.precise
          ? s.blocked.precise
          : s.blocked.location
        : s.blocked.background;
    return (
      <View style={styles.stack} testID="d1-blocked">
        <Banner tone="error" message={msg} />
        <Button label={s.status.settings} variant="danger" icon="settings" onPress={onSettings} />
      </View>
    );
  }
  if (permissionRows(snap).some((r) => r.key === 'notifications' && r.state === 'optional-denied')) {
    return (
      <View style={styles.stack} testID="d1-notifications-off">
        <Banner tone="warn" message={s.notificationsOff} />
        <Button label={s.status.settings} variant="outline" onPress={onSettings} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  stack: { gap: space.sm },
  header: { gap: space.md },
  illustration: {
    height: 120,
    borderRadius: radius.card,
    backgroundColor: colors.liveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  road: { width: '60%', height: 6, borderRadius: 3, backgroundColor: colors.disabled, marginTop: space.xs },
  lorry: { position: 'absolute', bottom: 22, right: '24%' },
  disclosureRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: sizes.touchMin,
    paddingVertical: space.xs,
  },
  action: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    justifyContent: 'center',
  },
  actionText: { color: colors.text },
  actionSettings: { backgroundColor: colors.dangerSoft },
  actionSettingsText: { color: colors.dangerText },
  pressed: { opacity: 0.85 },
  link: { minHeight: sizes.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { color: colors.liveText, textDecorationLine: 'underline' },
});
