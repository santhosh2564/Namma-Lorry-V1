// STUB until M9. The real check verifies precise + background ("all the time")
// location and notification permissions (D1). Until then drivers always go
// through the onboarding placeholder.

export async function checkTrackingPermissions(): Promise<{ ok: boolean }> {
  return { ok: false };
}
