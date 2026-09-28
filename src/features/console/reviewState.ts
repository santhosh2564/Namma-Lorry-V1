/**
 * C6 review-decision rules (M11, docs/12 C6, docs/08 §4).
 *
 * `admin_review_trip` is the only place in the product where a human changes
 * somebody else's record, so its client-side rules are deliberately small and
 * explicit:
 *
 * - The note is **mandatory** (0001 raises `NOTE_REQUIRED` without one) and the
 *   buttons stay disabled until there is one — a decision without a reason is
 *   not auditable, which is the whole point of the review queue.
 * - A decision is only offered for a trip that is actually in `needs_review`;
 *   0001 raises `TRIP_NOT_IN_REVIEW` otherwise, and an operator whose screen has
 *   been open since before another admin decided the trip should be told that
 *   rather than shown a database error.
 * - There is **no optimistic update** (docs/12 C6): the status flips in the
 *   database, `driver_stats` moves with it, and the screen re-reads. Painting
 *   "Verified" onto a row the server may reject would be a lie with a green
 *   tick on it.
 */
import type { TripStatus } from "@/theme/status";

/** A review note is a sentence, not an essay. */
export const REVIEW_NOTE_MAX = 500;

export type ReviewNoteError = "empty" | "tooLong" | null;

/** Pure: what is wrong with this note, if anything. */
export function noteError(note: string): ReviewNoteError {
  if (note.trim() === "") {
    return "empty";
  }
  if (note.length > REVIEW_NOTE_MAX) {
    return "tooLong";
  }
  return null;
}

/** Pure: may this decision be submitted right now? */
export function canSubmitReview(input: {
  note: string;
  status: TripStatus;
  pending: boolean;
}): boolean {
  if (input.pending) {
    return false;
  }
  if (input.status !== "needs_review") {
    return false;
  }
  return noteError(input.note) === null;
}

export type ReviewDecision = "approve" | "reject";

/**
 * Pure: Supabase error → message key.
 *
 * The three raises in `admin_review_trip` are the expected failures of this
 * screen, not exceptions: a non-admin, a missing note and a trip somebody else
 * already decided are all ordinary states of a shared queue.
 */
export function reviewErrorKey(message: string): string {
  if (message.includes("NOTE_REQUIRED")) {
    return "console.review.noteRequired";
  }
  if (message.includes("TRIP_NOT_IN_REVIEW")) {
    return "console.review.notInReview";
  }
  if (message.includes("FORBIDDEN")) {
    return "console.review.forbidden";
  }
  return "console.review.failed";
}
