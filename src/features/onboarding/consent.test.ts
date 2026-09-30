/**
 * recordConsent error mapping (re-consent, migrations 0009/0010).
 *
 * The server accepts the current policy version or a newer one. A build whose
 * CONSENT_VERSION is *older* than the server's gets VERSION_NOT_CURRENT, which
 * D1 must show as "update the app", not as a connection problem the driver can
 * retry forever.
 */
import { CONSENT_VERSION, recordConsent } from "@/features/onboarding/consent";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

beforeEach(() => mockRpc.mockReset());

describe("recordConsent", () => {
  it("records this build's CONSENT_VERSION", async () => {
    mockRpc.mockResolvedValue({ error: null });
    await expect(recordConsent()).resolves.toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("record_consent", { p_version: CONSENT_VERSION });
  });

  it("reports an outdated build when the server's version is newer", async () => {
    mockRpc.mockResolvedValue({ error: { message: "VERSION_NOT_CURRENT" } });
    await expect(recordConsent()).resolves.toMatchObject({ ok: false, kind: "outdated" });
  });

  it("still reports a network failure as network", async () => {
    mockRpc.mockResolvedValue({ error: { message: "TypeError: Network request failed" } });
    await expect(recordConsent()).resolves.toMatchObject({ ok: false, kind: "network" });
  });
});
