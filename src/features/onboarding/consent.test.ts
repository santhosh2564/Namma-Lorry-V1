/**
 * recordConsent error mapping (re-consent, migration 0009).
 *
 * The server accepts only the current policy version. A build whose
 * CONSENT_VERSION is behind gets CONSENT_VERSION_OUTDATED, which D1 must show
 * as "update the app", not as a connection problem the driver can retry forever.
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

  it("reports an outdated build when the server wants a newer policy version", async () => {
    mockRpc.mockResolvedValue({ error: { message: "CONSENT_VERSION_OUTDATED" } });
    await expect(recordConsent()).resolves.toMatchObject({ ok: false, kind: "outdated" });
  });

  it("still reports a network failure as network", async () => {
    mockRpc.mockResolvedValue({ error: { message: "TypeError: Network request failed" } });
    await expect(recordConsent()).resolves.toMatchObject({ ok: false, kind: "network" });
  });
});
