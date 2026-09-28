/**
 * C6 review decision panel (M11, docs/12 C6, docs/08 §4).
 *
 * The sticky card at the bottom of the trip: why it was flagged, a note that is
 * **required**, and two buttons. It only exists while the trip is in
 * `needs_review` — a verified or rejected trip shows its outcome instead,
 * because a decision form on a decided trip would invite a second, conflicting
 * decision that the database would refuse anyway.
 *
 * No optimistic update: the status change, the queue, the sidebar badge and the
 * driver's verified totals all move in the database, and the screen re-reads
 * them (`useAdminReviewTrip`). A green tick painted on a row the server
 * rejects would be a lie.
 */
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Banner, Button, Card, SectionHeader, TextField } from "@/components/ui";
import { noteError, REVIEW_NOTE_MAX } from "@/features/console/reviewState";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type ReviewPanelProps = {
  /** Only `needs_review` may be decided; anything else is rendered as an outcome. */
  canReview: boolean;
  note: string;
  pending: boolean;
  /** A message key from `reviewState.reviewErrorKey`, or null. */
  errorKey: string | null;
  verifiedKm: number | null;
  reviewedByName: string | null;
  reviewedNote: string | null;
  onNoteChange: (note: string) => void;
  onDecide: (approve: boolean) => void;
};

export function ReviewPanel({
  canReview,
  note,
  pending,
  errorKey,
  verifiedKm,
  reviewedByName,
  reviewedNote,
  onNoteChange,
  onDecide,
}: ReviewPanelProps) {
  const { t } = useTranslation();

  if (!canReview) {
    return (
      <Card testID="review-outcome">
        <SectionHeader title={t("console.trip.reviewOutcome")} />
        <Text style={styles.outcome}>
          {verifiedKm === null
            ? t("console.trip.reviewNoKm")
            : t("console.trip.reviewDecided", { km: verifiedKm })}
        </Text>
        {reviewedByName === null ? null : (
          <Text style={styles.outcomeDetail}>
            {t("console.trip.reviewBy", { name: reviewedByName })}
          </Text>
        )}
        {reviewedNote === null || reviewedNote === "" ? null : (
          <Text style={styles.outcomeNote} testID="review-outcome-note">
            “{reviewedNote}”
          </Text>
        )}
      </Card>
    );
  }

  const error = noteError(note);
  const trimmed = note.trim();

  return (
    <Card testID="review-panel">
      <SectionHeader
        subtitle={t("console.trip.reviewHint")}
        title={t("console.trip.reviewTitle")}
      />

      {errorKey === null ? null : (
        <Banner message={t(errorKey)} variant="error" testID="review-error" />
      )}

      <TextField
        errorText={
          error === "tooLong"
            ? t("console.trip.reviewNoteTooLong", { max: REVIEW_NOTE_MAX })
            : undefined
        }
        helperText={t("console.trip.reviewNoteRequired")}
        label={t("console.trip.reviewNoteLabel")}
        maxLength={REVIEW_NOTE_MAX}
        multiline
        onChangeText={onNoteChange}
        placeholder={t("console.trip.reviewNotePlaceholder")}
        testID="review-note"
        value={note}
      />

      <View style={styles.actions}>
        <Button
          disabled={error !== null || pending}
          fullWidth
          icon="check_circle"
          label={t("console.trip.reviewApprove")}
          loading={pending}
          onPress={() => onDecide(true)}
          size="lg"
          testID="review-approve"
          variant="success"
        />
        <Button
          disabled={error !== null || pending}
          fullWidth
          icon="cancel"
          label={t("console.trip.reviewReject")}
          onPress={() => onDecide(false)}
          size="lg"
          testID="review-reject"
          variant="dangerOutline"
        />
      </View>

      <Text style={styles.hint} testID="review-note-required">
        {trimmed === "" ? t("console.trip.reviewNoteMandatory") : t("console.trip.reviewNoteOk")}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  hint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  outcome: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  outcomeDetail: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  outcomeNote: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.text,
  },
});
