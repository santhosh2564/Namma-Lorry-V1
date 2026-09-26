import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, Screen, Text } from '@/components/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { useProfile } from '@/features/auth/useProfile';
import { formatPhone } from '@/features/console/consoleData';
import { formatDistanceKm } from '@/features/loads/status';
import { needsBatterySetup } from '@/features/onboarding/batteryFlag';
import { healthCheck, initials } from '@/features/onboarding/health';
import { useDriverStats } from '@/features/trips/api';
import { dayMonthIST } from '@/features/trips/history';
import { t } from '@/i18n/en';
import { config } from '@/lib/config';
import { permissionsQueryKey, readPermissions } from '@/tracking/permissions';
import { colors, fonts, radius, space } from '@/theme/tokens';

const p = t.profile;
type Icon = ComponentProps<typeof MaterialIcons>['name'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => {
  const d = new Date(Date.parse(iso) + 5.5 * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Phase 1 ships English only; the others arrive with M12a translations (docs/13 P13). */
const LANGUAGES = [
  { code: 'en', label: 'English', available: true },
  { code: 'ta', label: 'தமிழ் (Tamil)', available: false },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', available: false },
  { code: 'hi', label: 'हिन्दी (Hindi)', available: false },
] as const;

/** D8 My Profile (docs/12 D8): read-only verified experience + settings. */
export default function MyProfile() {
  const router = useRouter();
  const profile = useProfile();
  const stats = useDriverStats(true);
  const perms = useQuery({
    queryKey: [...permissionsQueryKey, 'snapshot'],
    queryFn: readPermissions,
    networkMode: 'always',
  });
  const battery = useQuery({
    queryKey: ['prefs', 'battery-needed'],
    queryFn: needsBatterySetup,
    networkMode: 'always',
  });
  const [languageOpen, setLanguageOpen] = useState(false);
  const health = perms.data ? healthCheck(perms.data, battery.data ?? false) : null;
  const me = profile.data;
  const s = stats.data;

  return (
    <Screen scroll>
      <View style={styles.header} testID="d8-header">
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(me?.full_name)}</Text>
        </View>
        <View style={styles.flex}>
          <Text variant="title" tone="onPrimary">
            {me?.full_name ?? ''}
          </Text>
          <Text tone="onPrimaryMuted">{formatPhone(me?.phone ?? null)}</Text>
        </View>
        {me?.created_at ? (
          <View style={styles.since}>
            <MaterialIcons name="check-circle" size={16} color={colors.verified} />
            <Text variant="caption" tone="onPrimary">
              {p.since(monthYear(me.created_at))}
            </Text>
          </View>
        ) : null}
      </View>

      <Card>
        <View style={styles.verifiedHead}>
          <MaterialIcons name="lock" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <Text variant="subtitle">{p.verifiedTitle}</Text>
            <Text variant="caption" tone="secondary" testID="d8-caption">
              {p.verifiedCaption}
            </Text>
          </View>
        </View>
        <View style={styles.stats} testID="d8-stats">
          <Stat value={String(s?.verified_trips ?? 0)} label={p.trips} testID="d8-trips" />
          <Stat
            value={formatDistanceKm(s?.verified_distance_m ?? 0).replace(' km', '')}
            label={p.km}
            testID="d8-km"
          />
          <Stat
            value={s?.last_verified_at ? dayMonthIST(s.last_verified_at) : '—'}
            label={p.lastTrip}
            testID="d8-last"
          />
        </View>
      </Card>

      <Card style={styles.list}>
        <Row
          icon="language"
          title={p.language}
          hint={p.languageHint}
          value="English"
          onPress={() => setLanguageOpen(true)}
          testID="d8-language"
        />
        <Row
          icon="battery-charging-full"
          title={p.health}
          hint={p.healthHint}
          testID="d8-health"
          onPress={() => router.push(health?.fixHref ?? '/permissions')}
          right={
            health ? (
              health.ok ? (
                <Chip label={p.healthGood} tone="verified" icon="check" />
              ) : (
                <Chip label={p.healthFix} tone="review" icon="warning-amber" />
              )
            ) : null
          }
        />
        {config.EXPO_PUBLIC_PRIVACY_POLICY_URL ? (
          <Row
            icon="description"
            title={p.privacy}
            hint={p.privacyHint}
            testID="d8-privacy"
            onPress={() => void Linking.openURL(config.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}
          />
        ) : null}
      </Card>

      {/* Blocked while a trip is active or its data hasn't uploaded (signOut.ts). */}
      <SignOutButton variant="outline" />
      <Text variant="caption" tone="secondary" align="center">
        {p.version(Constants.expoConfig?.version ?? '1.0.0')}
      </Text>

      <LanguageSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </Screen>
  );
}

function Stat({ value, label, testID }: { value: string; label: string; testID: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function Row({
  icon,
  title,
  hint,
  value,
  right,
  onPress,
  testID,
}: {
  icon: Icon;
  title: string;
  hint: string;
  value?: string;
  right?: ReactNode;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID} style={styles.row}>
      <View style={styles.rowIcon}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
        {right}
      </View>
      {value ? <Text>{value}</Text> : null}
      <MaterialIcons name="chevron-right" size={24} color={colors.textSecondary} />
    </Pressable>
  );
}

/** Language picker sheet (docs/12 overlays). English only until M12a. */
function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={p.close} />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="d8-language-sheet">
        <Text variant="title">{p.languageSheetTitle}</Text>
        {LANGUAGES.map((l) => (
          <View
            key={l.code}
            style={styles.langRow}
            accessibilityState={{ selected: l.code === 'en', disabled: !l.available }}
          >
            <MaterialIcons
              name={l.code === 'en' ? 'radio-button-checked' : 'radio-button-unchecked'}
              size={22}
              color={l.available ? colors.primary : colors.disabled}
            />
            <View style={styles.flex}>
              <Text tone={l.available ? 'default' : 'secondary'}>{l.label}</Text>
              {!l.available ? (
                <Text variant="caption" tone="secondary">
                  {p.languageSoon}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        <Button label={p.close} variant="outline" onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 24, color: colors.primary },
  since: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.sidebarActive,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  verifiedHead: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.input,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    gap: 2,
  },
  statValue: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.text },
  list: { gap: 0, paddingVertical: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.sm,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: space.md,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
  },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
});
