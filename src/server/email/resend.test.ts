import {
  assertServerRuntime,
  createEmailService,
  EmailConfigError,
  emailServiceFromEnv,
} from "./resend";
import type { EmailClient } from "./resend";
import { escapeHtml, tripNotificationEmail, verificationEmail } from "./templates";

const API_KEY = "re_test_secret_key";
const FROM = "Namma Lorry <no-reply@mail.nammalorry.example>";

type SendResponse = Awaited<ReturnType<EmailClient["emails"]["send"]>>;

function setup(response: SendResponse | Error = { data: { id: "email_1" }, error: null }) {
  const send = jest.fn<Promise<SendResponse>, Parameters<EmailClient["emails"]["send"]>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  const logger = { warn: jest.fn() };
  const service = createEmailService({
    apiKey: API_KEY,
    from: FROM,
    client: { emails: { send } },
    logger,
  });
  return { service, send, logger };
}

describe("createEmailService configuration", () => {
  it("refuses a missing API key", () => {
    expect(() => createEmailService({ apiKey: " ", from: FROM })).toThrow(EmailConfigError);
  });

  it("refuses a missing or malformed sender", () => {
    expect(() => createEmailService({ apiKey: API_KEY, from: "" })).toThrow(EmailConfigError);
    expect(() => createEmailService({ apiKey: API_KEY, from: "Namma Lorry" })).toThrow(
      EmailConfigError,
    );
  });

  it("refuses Resend's shared test sender unless explicitly allowed", () => {
    const from = "onboarding@resend.dev";
    expect(() => createEmailService({ apiKey: API_KEY, from })).toThrow(/verified/);
    expect(() =>
      createEmailService({ apiKey: API_KEY, from, allowTestSender: true }),
    ).not.toThrow();
  });

  it("reads RESEND_API_KEY and EMAIL_FROM from the environment", async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: "email_2" }, error: null });
    const service = emailServiceFromEnv(
      { RESEND_API_KEY: API_KEY, EMAIL_FROM: FROM },
      { client: { emails: { send } } },
    );
    await service.sendAdminNotification("ops@example.com", { title: "T", message: "M" });
    expect(send.mock.calls[0]?.[0].from).toBe(FROM);
    expect(() => emailServiceFromEnv({ EMAIL_FROM: FROM })).toThrow(/RESEND_API_KEY/);
  });

  it("refuses to run in a browser or in the mobile app", () => {
    expect(() => assertServerRuntime({})).not.toThrow();
    expect(() => assertServerRuntime({ document: {} })).toThrow(EmailConfigError);
    expect(() => assertServerRuntime({ navigator: { product: "ReactNative" } })).toThrow(
      EmailConfigError,
    );
  });
});

describe("sending", () => {
  it("sends each kind of email with a subject, HTML and text body", async () => {
    const { service, send } = setup();
    const results = await Promise.all([
      service.sendVerificationEmail("a@example.com", {
        verifyUrl: "https://app.example.com/verify?token=abc",
        expiresInMinutes: 30,
      }),
      service.sendSecurityNotification("a@example.com", {
        event: "new_sign_in",
        occurredAt: "2026-10-04T10:00:00Z",
      }),
      service.sendAdminNotification("ops@example.com", { title: "Review queue", message: "3" }),
      service.sendTripNotification("ops@example.com", {
        event: "trip_completed",
        reference: "Load NL-1042",
      }),
      service.sendVerificationStatus("a@example.com", {
        item: "Trip NL-1042",
        status: "rejected",
        reason: "Route gap",
      }),
      service.sendSupportMessage("support@example.com", {
        senderName: "Ravi",
        message: "Help",
        replyTo: "ravi@example.com",
      }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(send).toHaveBeenCalledTimes(6);
    for (const [payload] of send.mock.calls) {
      expect(payload.from).toBe(FROM);
      expect(payload.subject).not.toBe("");
      expect(payload.html).toContain("<p>");
      expect(payload.text).not.toBe("");
    }
    expect(send.mock.calls[5]?.[0]).toMatchObject({
      to: ["support@example.com"],
      replyTo: "ravi@example.com",
    });
  });

  it("passes the idempotency key through", async () => {
    const { service, send } = setup();
    await service.sendTripNotification(
      "ops@example.com",
      { event: "trip_started", reference: "Load NL-1" },
      { idempotencyKey: "trip-started/abc" },
    );
    expect(send.mock.calls[0]?.[1]).toEqual({ idempotencyKey: "trip-started/abc" });
  });

  it("rejects a bad recipient without calling the provider", async () => {
    const { service, send } = setup();
    const result = await service.sendAdminNotification("not-an-address", {
      title: "T",
      message: "M",
    });
    expect(result).toEqual({ ok: false, code: "invalid_recipient", retryable: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a result instead of throwing when the provider fails", async () => {
    const limited = setup({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } });
    await expect(
      limited.service.sendAdminNotification("ops@example.com", { title: "T", message: "M" }),
    ).resolves.toEqual({ ok: false, code: "rate_limited", retryable: true });

    const rejected = setup({ data: null, error: { name: "validation_error", statusCode: 422 } });
    await expect(
      rejected.service.sendAdminNotification("ops@example.com", { title: "T", message: "M" }),
    ).resolves.toEqual({ ok: false, code: "provider_error", retryable: false });

    const offline = setup(new Error(`fetch failed for ${API_KEY}`));
    await expect(
      offline.service.sendAdminNotification("ops@example.com", { title: "T", message: "M" }),
    ).resolves.toEqual({ ok: false, code: "network", retryable: true });
  });

  it("never logs the API key, the recipient or the content", async () => {
    const { service, logger } = setup(new Error(`fetch failed for ${API_KEY}`));
    await service.sendAdminNotification("ops@example.com", {
      title: "Secret title",
      message: "Secret body",
    });
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logged).toContain("email_send_failed");
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("ops@example.com");
    expect(logged).not.toContain("Secret");
  });
});

describe("templates", () => {
  it("escapes interpolated values in the HTML body", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    const content = tripNotificationEmail({
      event: "trip_flagged",
      reference: "<script>alert(1)</script>",
    });
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("only links to https URLs", () => {
    expect(() =>
      verificationEmail({ verifyUrl: "javascript:alert(1)", expiresInMinutes: 30 }),
    ).toThrow(/https/);
    expect(() => verificationEmail({ verifyUrl: "nope", expiresInMinutes: 30 })).toThrow();
  });

  it("keeps the subject on one line", async () => {
    const { service, send } = setup();
    await service.sendAdminNotification("ops@example.com", {
      title: "Line one\r\nBcc: someone@example.com",
      message: "M",
    });
    expect(send.mock.calls[0]?.[0].subject).not.toMatch(/[\r\n]/);
  });
});
