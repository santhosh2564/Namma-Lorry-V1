/**
 * Transactional email content (server-only, see ./resend.ts).
 *
 * Pure builders: each returns a subject plus an HTML and a plain-text body.
 * They take only what the message needs — no phone numbers and no GPS
 * coordinates (docs/09 §1 data minimisation) — and escape every value they
 * interpolate. English only for now; the app's own strings stay in `src/i18n/`.
 */
export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

const BRAND = "Namma Lorry";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Only absolute https links go into an email; anything else is a caller bug. */
function httpsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Email link is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Email link must use https");
  }
  return url.toString();
}

type Link = { label: string; url: string };

function layout(subject: string, paragraphs: string[], link?: Link): EmailContent {
  const href = link ? httpsUrl(link.url) : undefined;
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">`,
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    ...(link && href ? [`<p><a href="${escapeHtml(href)}">${escapeHtml(link.label)}</a></p>`] : []),
    `<p style="color:#666666;font-size:13px">${BRAND}</p>`,
    `</div>`,
  ].join("");
  const text = [...paragraphs, ...(link && href ? [`${link.label}: ${href}`] : []), BRAND].join(
    "\n\n",
  );
  return { subject, html, text };
}

export type VerificationEmailInput = {
  verifyUrl: string;
  expiresInMinutes: number;
};

export function verificationEmail(input: VerificationEmailInput): EmailContent {
  return layout(
    `Confirm your email address for ${BRAND}`,
    [
      `Confirm this email address to finish setting up your ${BRAND} account.`,
      `The link expires in ${input.expiresInMinutes} minutes. If you did not ask for it, you can ignore this email.`,
    ],
    { label: "Confirm email address", url: input.verifyUrl },
  );
}

export type SecurityEvent =
  "new_sign_in" | "email_changed" | "password_changed" | "account_deactivated";

const SECURITY_TEXT: Record<SecurityEvent, string> = {
  new_sign_in: "There was a new sign-in to your account.",
  email_changed: "The email address on your account was changed.",
  password_changed: "The password on your account was changed.",
  account_deactivated: "Your account was deactivated.",
};

export type SecurityNotificationInput = {
  event: SecurityEvent;
  /** ISO 8601 timestamp of the event. */
  occurredAt: string;
};

export function securityNotificationEmail(input: SecurityNotificationInput): EmailContent {
  return layout(`${BRAND} security notice`, [
    SECURITY_TEXT[input.event],
    `Time: ${input.occurredAt}`,
    "If this was not you, contact your Namma Lorry administrator straight away.",
  ]);
}

export type AdminNotificationInput = {
  title: string;
  message: string;
  actionUrl?: string;
};

export function adminNotificationEmail(input: AdminNotificationInput): EmailContent {
  return layout(
    `[${BRAND} admin] ${input.title}`,
    [input.message],
    input.actionUrl ? { label: "Open the console", url: input.actionUrl } : undefined,
  );
}

export type TripEvent = "load_assigned" | "trip_started" | "trip_completed" | "trip_flagged";

const TRIP_TEXT: Record<TripEvent, string> = {
  load_assigned: "was assigned to a driver",
  trip_started: "has started",
  trip_completed: "has been completed",
  trip_flagged: "needs a manual review",
};

export type TripNotificationInput = {
  event: TripEvent;
  /** A load or trip reference to show (never a location). */
  reference: string;
  tripUrl?: string;
};

export function tripNotificationEmail(input: TripNotificationInput): EmailContent {
  return layout(
    `${BRAND}: ${input.reference} ${TRIP_TEXT[input.event]}`,
    [`${input.reference} ${TRIP_TEXT[input.event]}.`],
    input.tripUrl ? { label: "View the trip", url: input.tripUrl } : undefined,
  );
}

export type VerificationStatus = "approved" | "rejected" | "needs_review";

const STATUS_TEXT: Record<VerificationStatus, string> = {
  approved: "was approved",
  rejected: "was rejected",
  needs_review: "is waiting for a manual review",
};

export type VerificationStatusInput = {
  /** What was checked, for example "Trip NL-1042" or "Driving licence". */
  item: string;
  status: VerificationStatus;
  reason?: string;
};

export function verificationStatusEmail(input: VerificationStatusInput): EmailContent {
  return layout(`${BRAND}: ${input.item} ${STATUS_TEXT[input.status]}`, [
    `${input.item} ${STATUS_TEXT[input.status]}.`,
    ...(input.reason ? [`Reason: ${input.reason}`] : []),
  ]);
}

export type SupportMessageInput = {
  senderName: string;
  message: string;
};

export function supportMessageEmail(input: SupportMessageInput): EmailContent {
  return layout(`[${BRAND} support] Message from ${input.senderName}`, [
    `From: ${input.senderName}`,
    input.message,
  ]);
}
