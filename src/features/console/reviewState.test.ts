/**
 * C6 review rule tests (M11, docs/12 C6, docs/08 §4).
 *
 * The note is mandatory and the decision is not optimistic, so these assert the
 * two things that protect the audit trail: no note means no decision, and the
 * three expected `admin_review_trip` failures read as sentences.
 */
import { canSubmitReview, noteError, REVIEW_NOTE_MAX, reviewErrorKey } from "./reviewState";

describe("noteError", () => {
  it("rejects an empty or whitespace-only note", () => {
    expect(noteError("")).toBe("empty");
    expect(noteError("   \n ")).toBe("empty");
  });

  it("accepts a real sentence", () => {
    expect(noteError("Called the driver; load was short by 400 kg.")).toBeNull();
  });

  it("rejects a note past the limit", () => {
    expect(noteError("x".repeat(REVIEW_NOTE_MAX + 1))).toBe("tooLong");
    expect(noteError("x".repeat(REVIEW_NOTE_MAX))).toBeNull();
  });
});

describe("canSubmitReview", () => {
  const base = {
    note: "Checked with the driver.",
    status: "needs_review" as const,
    pending: false,
  };

  it("allows a decision on a flagged trip with a note", () => {
    expect(canSubmitReview(base)).toBe(true);
  });

  it("blocks a decision with no note", () => {
    expect(canSubmitReview({ ...base, note: "  " })).toBe(false);
  });

  it("blocks while the decision is in flight", () => {
    expect(canSubmitReview({ ...base, pending: true })).toBe(false);
  });

  it("blocks on a trip that is not in review — someone else decided first", () => {
    for (const status of [
      "verified",
      "rejected",
      "completed",
      "in_progress",
      "assigned",
    ] as const) {
      expect(canSubmitReview({ ...base, status })).toBe(false);
    }
  });
});

describe("reviewErrorKey", () => {
  it("maps each raise from admin_review_trip to a sentence", () => {
    expect(reviewErrorKey("NOTE_REQUIRED")).toBe("console.review.noteRequired");
    expect(reviewErrorKey("TRIP_NOT_IN_REVIEW")).toBe("console.review.notInReview");
    expect(reviewErrorKey("FORBIDDEN")).toBe("console.review.forbidden");
  });

  it("falls back to a generic failure for anything unexpected", () => {
    expect(reviewErrorKey("connection reset")).toBe("console.review.failed");
  });
});
