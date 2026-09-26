import { StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { errorMessage } from '@/lib/errorMessage';
import { space } from '@/theme/tokens';

import { Banner } from './Banner';
import { Button } from './Button';

/**
 * Network/data error state for a screen or card (M12a): a plain-language message for the error
 * code (offline, session expired, RPC code…) and a "Try again" that refetches.
 */
export function ErrorBanner({
  error,
  message,
  onRetry,
  testID,
}: {
  error?: unknown;
  /** Screen-specific text; defaults to the message for the error's code. */
  message?: string;
  onRetry?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.box}>
      <Banner tone="error" message={message ?? errorMessage(error)} testID={testID} />
      {onRetry ? (
        <Button
          label={t.common.retry}
          variant="text"
          icon="refresh"
          onPress={onRetry}
          testID={testID && `${testID}-retry`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.xs, alignItems: 'stretch' } });
