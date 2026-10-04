/**
 * Transactional email through Resend — SERVER-ONLY.
 *
 * Nothing under `app/` or the rest of `src/` may import this folder (ESLint
 * enforces it, and CI checks the web export does not contain it): the API key
 * must never reach a browser bundle or a mobile build. It is read from
 * `RESEND_API_KEY`, never from an `EXPO_PUBLIC_*` variable.
 *
 * Sending never throws for a delivery problem; it returns a result. Call it
 * after the database transaction has committed, so a failed email cannot undo
 * or block a trip or load change. Logs carry the email kind and an error code
 * only — never the key, a recipient or the content.
 */
import { Resend } from "resend";

import {
  adminNotificationEmail,
  securityNotificationEmail,
  supportMessageEmail,
  tripNotificationEmail,
  verificationEmail,
  verificationStatusEmail,
} from "./templates";
import type {
  AdminNotificationInput,
  EmailContent,
  SecurityNotificationInput,
  SupportMessageInput,
  TripNotificationInput,
  VerificationEmailInput,
  VerificationStatusInput,
} from "./templates";

export type EmailKind =
  "verification" | "security" | "admin" | "trip" | "verification_status" | "support";

export type EmailErrorCode = "invalid_recipient" | "rate_limited" | "provider_error" | "network";

export type EmailResult =
  { ok: true; id: string } | { ok: false; code: EmailErrorCode; retryable: boolean };

/** The part of the Resend SDK this module uses; tests pass a fake. */
export type EmailClient = {
  emails: {
    send(
      payload: {
        from: string;
        to: string[];
        subject: string;
        html: string;
        text: string;
        replyTo?: string;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{
      data: { id: string } | null;
      error: { name: string; statusCode: number | null } | null;
    }>;
  };
};

export type EmailLogger = {
  warn(message: string, details: Record<string, unknown>): void;
};

export type EmailServiceOptions = {
  apiKey: string;
  /** Sender on a domain verified in Resend, e.g. `Namma Lorry <no-reply@example.com>`. */
  from: string;
  client?: EmailClient;
  logger?: EmailLogger;
  /** Allows Resend's shared `resend.dev` test sender. Never set in production. */
  allowTestSender?: boolean;
};

export type SendOptions = {
  /** Makes a retry safe: Resend sends once per key. */
  idempotencyKey?: string;
};

export class EmailConfigError extends Error {
  override name = "EmailConfigError";
}

const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

function isAddress(value: string): boolean {
  return value.length <= 254 && ADDRESS.test(value);
}

/** The address part of `Name <address>` or of a bare address. */
function senderAddress(from: string): string | null {
  const address = (/<([^<>]+)>\s*$/.exec(from)?.[1] ?? from).trim();
  return isAddress(address) && !/[\r\n]/.test(from) ? address : null;
}

/** Throws when loaded where a secret must not be: a browser or the mobile app. */
export function assertServerRuntime(
  scope: { document?: unknown; navigator?: { product?: string } } = globalThis,
): void {
  if (scope.document !== undefined || scope.navigator?.product === "ReactNative") {
    throw new EmailConfigError("The email service is server-only");
  }
}

export function createEmailService(options: EmailServiceOptions) {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new EmailConfigError("RESEND_API_KEY is not set");
  }
  const address = senderAddress(options.from);
  if (!address) {
    throw new EmailConfigError("EMAIL_FROM is not a valid sender address");
  }
  if (!options.allowTestSender && address.toLowerCase().endsWith("@resend.dev")) {
    throw new EmailConfigError("EMAIL_FROM must be on a domain verified in Resend");
  }

  const from = options.from.trim();
  const client: EmailClient = options.client ?? new Resend(apiKey);
  const logger: EmailLogger = options.logger ?? console;

  function failure(kind: EmailKind, code: EmailErrorCode, detail: Record<string, unknown> = {}) {
    const retryable = code === "rate_limited" || code === "network";
    logger.warn("email_send_failed", { kind, code, ...detail });
    return { ok: false, code, retryable } as const;
  }

  async function send(
    kind: EmailKind,
    to: string,
    content: EmailContent,
    sendOptions: SendOptions & { replyTo?: string } = {},
  ): Promise<EmailResult> {
    const recipient = to.trim();
    if (!isAddress(recipient) || (sendOptions.replyTo && !isAddress(sendOptions.replyTo))) {
      return failure(kind, "invalid_recipient");
    }
    try {
      const { data, error } = await client.emails.send(
        {
          from,
          to: [recipient],
          subject: content.subject.replace(/[\r\n]+/g, " "),
          html: content.html,
          text: content.text,
          ...(sendOptions.replyTo ? { replyTo: sendOptions.replyTo } : {}),
        },
        sendOptions.idempotencyKey ? { idempotencyKey: sendOptions.idempotencyKey } : undefined,
      );
      if (error || !data) {
        // The provider's message can repeat the recipient, so only its code is kept.
        const status = error?.statusCode ?? null;
        return failure(kind, status === 429 ? "rate_limited" : "provider_error", {
          provider: error?.name ?? "empty_response",
          status,
        });
      }
      return { ok: true, id: data.id };
    } catch {
      return failure(kind, "network");
    }
  }

  return {
    sendVerificationEmail: (to: string, input: VerificationEmailInput, opts?: SendOptions) =>
      send("verification", to, verificationEmail(input), opts),
    sendSecurityNotification: (to: string, input: SecurityNotificationInput, opts?: SendOptions) =>
      send("security", to, securityNotificationEmail(input), opts),
    sendAdminNotification: (to: string, input: AdminNotificationInput, opts?: SendOptions) =>
      send("admin", to, adminNotificationEmail(input), opts),
    sendTripNotification: (to: string, input: TripNotificationInput, opts?: SendOptions) =>
      send("trip", to, tripNotificationEmail(input), opts),
    sendVerificationStatus: (to: string, input: VerificationStatusInput, opts?: SendOptions) =>
      send("verification_status", to, verificationStatusEmail(input), opts),
    /** Delivers a contact-form message to the support inbox; replies go to the sender. */
    sendSupportMessage: (
      supportInbox: string,
      input: SupportMessageInput & { replyTo: string },
      opts?: SendOptions,
    ) =>
      send("support", supportInbox, supportMessageEmail(input), {
        ...opts,
        replyTo: input.replyTo,
      }),
  };
}

export type EmailService = ReturnType<typeof createEmailService>;

/** Builds the service from server environment variables; throws if they are missing. */
export function emailServiceFromEnv(
  env: Record<string, string | undefined>,
  overrides: Pick<EmailServiceOptions, "client" | "logger"> = {},
): EmailService {
  assertServerRuntime();
  return createEmailService({
    apiKey: env.RESEND_API_KEY ?? "",
    from: env.EMAIL_FROM ?? "",
    ...overrides,
  });
}
