/**
 * `admin-create-driver` core (M6).
 *
 * Phase 1 has no self-signup: the M5 gate sends `shouldCreateUser: false`, so
 * an unknown number is refused with "Contact Namma Lorry to register". This
 * function is the only way a driver gets an account, and it is admin-only.
 *
 * It needs the service-role key because creating a row in `auth.users` is not
 * something RLS can allow a client to do — and that is exactly why the key
 * lives here, in a function, and never in the app bundle (CLAUDE.md rule 6,
 * docs/07 §4). Everything here is dependency-injected so `driver_test.ts` can
 * run the whole request path with fakes.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** 10-digit Indian mobile number, same rule as the S2 sign-in screen (M5). */
export const PHONE_PATTERN = /^[6-9]\d{9}$/;
export const MAX_NAME_LENGTH = 80;

export type CreateDriverInput = { fullName: string; phone: string };

export type ServiceRoleApi = {
  /** Mirrors `auth.admin.createUser` from supabase-js. */
  createAuthUser: (input: { phone: string }) => Promise<
    { id: string } | { error: { message: string } }
  >;
  /**
   * Mirrors a service-role `profiles` update. The `handle_new_user` trigger
   * already inserts a profile with the default role, so this only fills in the
   * name (and is the single place a role could ever be set).
   */
  updateProfile: (
    userId: string,
    patch: { full_name: string; role: "driver"; phone: string },
  ) => Promise<{ error: { message: string } | null }>;
};

export type CreateDriverDeps = {
  getUser: (jwt: string) => Promise<{ id: string } | null>;
  isAdmin: (jwt: string) => Promise<boolean>;
  serviceRole: ServiceRoleApi;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function fail(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Strips formatting a dispatcher may have typed, then applies the S2 rule.
 *
 * A pasted `919000000011` (the way the test numbers are written in
 * `docs/DEV_SETUP.md`) loses its country code, so the console accepts the same
 * number written either way.
 */
export function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  return PHONE_PATTERN.test(digits) ? digits : null;
}

export function validateInput(body: unknown): { input: CreateDriverInput } | { error: Response } {
  if (!isRecord(body)) {
    return { error: fail("BAD_REQUEST", "Body must be a JSON object.", 400) };
  }

  const phone = normalisePhone(body.phone);
  if (phone === null) {
    return {
      error: fail("BAD_REQUEST", "Enter a 10-digit Indian mobile number.", 400),
    };
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
  if (fullName.length === 0) {
    return { error: fail("BAD_REQUEST", "Enter the driver's name.", 400) };
  }
  if (fullName.length > MAX_NAME_LENGTH) {
    return { error: fail("BAD_REQUEST", `Name must be ${MAX_NAME_LENGTH} characters or fewer.`, 400) };
  }

  return { input: { fullName, phone } };
}

/** Supabase's wording for "this phone already has an account". */
function isDuplicatePhone(message: string): boolean {
  return /already been registered|already registered|already exists/i.test(message);
}

/** Handles one `POST /functions/v1/admin-create-driver` request. */
export async function handleCreateDriver(req: Request, deps: CreateDriverDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Use POST.", 405);
  }

  const jwt = bearerToken(req);
  if (jwt === null) {
    return fail("UNAUTHENTICATED", "Missing bearer token.", 401);
  }

  const caller = await deps.getUser(jwt);
  if (caller === null) {
    return fail("UNAUTHENTICATED", "Invalid or expired session.", 401);
  }
  if (!(await deps.isAdmin(jwt))) {
    return fail("FORBIDDEN", "Only an admin can add a driver.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "Body must be JSON.", 400);
  }

  const validated = validateInput(body);
  if ("error" in validated) {
    return validated.error;
  }
  const { fullName, phone } = validated.input;

  // Service role: `auth.users` is not writable through RLS by design.
  const created = await deps.serviceRole.createAuthUser({ phone });
  if ("error" in created) {
    if (isDuplicatePhone(created.error.message)) {
      return fail(
        "PHONE_EXISTS",
        "That number already has an account. Sign in as the driver instead, or deactivate the old account.",
        409,
      );
    }
    return fail("CREATE_FAILED", "Could not create the driver account.", 500);
  }

  const updated = await deps.serviceRole.updateProfile(created.id, {
    full_name: fullName,
    role: "driver",
    phone: `+91${phone}`,
  });
  if (updated.error !== null) {
    return fail("PROFILE_FAILED", "Account created but the driver profile could not be saved.", 500);
  }

  // The phone is echoed back so the console can confirm what was registered.
  // The driver can sign in with it immediately: the auth user exists, so the
  // M5 gate's `shouldCreateUser: false` check passes for this number.
  return json({ id: created.id, fullName, phone: `+91${phone}` }, 201);
}
