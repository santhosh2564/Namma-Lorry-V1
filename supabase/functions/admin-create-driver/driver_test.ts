/**
 * `admin-create-driver` tests (M6).
 *
 * The service role is faked, so these run with no Supabase project: what is
 * being tested is the access control and the input contract, which are the two
 * things that would be dangerous to get wrong.
 *
 * Run with:  deno test supabase/functions/
 */
import {
  type CreateDriverDeps,
  type ServiceRoleApi,
  handleCreateDriver,
  normalisePhone,
  validateInput,
} from "./driver.ts";

const ADMIN = "admin-jwt";
const DRIVER_JWT = "driver-jwt";

type PatchedProfile = { id: string; full_name: string; role: string; phone: string };

function serviceRoleFake(overrides: Partial<ServiceRoleApi> = {}): ServiceRoleApi & {
  created: string[];
  patched: PatchedProfile[];
} {
  const created: string[] = [];
  const patched: PatchedProfile[] = [];
  return {
    created,
    patched,
    createAuthUser: overrides.createAuthUser ?? (async ({ phone }) => {
      created.push(phone);
      return { id: "new-user-id" };
    }),
    updateProfile:
      overrides.updateProfile ??
      (async (id, patch) => {
        patched.push({ id, ...patch });
        return { error: null };
      }),
  };
}

function deps(overrides: Partial<CreateDriverDeps> = {}): CreateDriverDeps {
  return {
    getUser: async () => ({ id: "admin-1" }),
    isAdmin: async () => true,
    serviceRole: serviceRoleFake(),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${ADMIN}` }) {
  return new Request("http://localhost/functions/v1/admin-create-driver", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function expectStatus(response: Response, expected: number): void {
  if (response.status !== expected) {
    throw new Error(`expected status ${expected}, got ${response.status}`);
  }
}

function expectEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message === undefined ? `expected ${b}, got ${a}` : `${message} (expected ${b}, got ${a})`);
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// --- access control --------------------------------------------------------

Deno.test("a request without a bearer token is 401 and creates nothing", async () => {
  const serviceRole = serviceRoleFake();
  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }, {}),
    deps({ serviceRole }),
  );

  expectStatus(response, 401);
  expectEquals(serviceRole.created.length, 0);
});

Deno.test("an invalid session is 401", async () => {
  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }),
    deps({ getUser: async () => null }),
  );
  expectStatus(response, 401);
  expectEquals(((await body(response)).error as { code: string }).code, "UNAUTHENTICATED");
});

Deno.test("a non-admin JWT is 403 and never touches the service role", async () => {
  const serviceRole = serviceRoleFake();
  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }, { Authorization: `Bearer ${DRIVER_JWT}` }),
    deps({ isAdmin: async () => false, serviceRole }),
  );

  expectStatus(response, 403);
  expectEquals(((await body(response)).error as { code: string }).code, "FORBIDDEN");
  expectEquals(serviceRole.created.length, 0);
  expectEquals(serviceRole.patched.length, 0);
});

Deno.test("an inactive admin (is_admin() false because is_active is false) is 403", async () => {
  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }),
    deps({ isAdmin: async () => false }),
  );
  expectStatus(response, 403);
});

Deno.test("a non-POST method is refused and a preflight is answered", async () => {
  const get = new Request("http://localhost/functions/v1/admin-create-driver", { method: "GET" });
  expectStatus(await handleCreateDriver(get, deps()), 405);

  const options = new Request("http://localhost/functions/v1/admin-create-driver", {
    method: "OPTIONS",
  });
  const preflight = await handleCreateDriver(options, deps());
  expectStatus(preflight, 204);
  expectEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
});

// --- the happy path (P0-1: the driver can now sign in) ---------------------

Deno.test("an admin creates the auth user and a driver profile", async () => {
  const serviceRole = serviceRoleFake();
  const national = "9000000011";
  const e164 = `+91${national}`;

  const response = await handleCreateDriver(
    post({ fullName: "  Murugan   S ", phone: "90000 00011" }),
    deps({ serviceRole }),
  );

  expectStatus(response, 201);
  const result = (await body(response)) as { id: string; fullName: string; phone: string };
  expectEquals(result.fullName, "Murugan S", "name is trimmed and collapsed");
  expectEquals(result.phone, e164, "the console is told the E.164 that was registered");

  // The service role created the auth user with the bare 10 digits, which is
  // what `signInWithOtp` will later be given as +91xxxxxxxxxx.
  expectEquals(serviceRole.created, [national]);
  expectEquals(serviceRole.patched, [
    { id: "new-user-id", full_name: "Murugan S", role: "driver", phone: e164 },
  ]);
});

Deno.test("the profile is always a driver, whatever the request says", async () => {
  const serviceRole = serviceRoleFake();
  const response = await handleCreateDriver(
    post({ fullName: "Sneaky", phone: "9000000012", role: "admin" }),
    deps({ serviceRole }),
  );

  expectStatus(response, 201);
  expectEquals(serviceRole.patched[0]?.role, "driver");
});

// --- validation ------------------------------------------------------------

Deno.test("bad input is rejected before the service role is used", async () => {
  const serviceRole = serviceRoleFake();
  const cases: unknown[] = [
    {},
    { phone: "9000000011" },
    { fullName: "Murugan S" },
    { fullName: "Murugan S", phone: "12345" },
    { fullName: "Murugan S", phone: "1000000001" },
    { fullName: "   ", phone: "9000000011" },
    { fullName: "x".repeat(81), phone: "9000000011" },
    { fullName: 42, phone: 9000000011 },
  ];

  for (const payload of cases) {
    const response = await handleCreateDriver(post(payload), deps({ serviceRole }));
    expectStatus(response, 400);
  }
  expectEquals(serviceRole.created.length, 0, "no user may be created from invalid input");
});

Deno.test("the phone is normalised from anything a dispatcher might type", () => {
  expectEquals(normalisePhone("9000000011"), "9000000011");
  expectEquals(normalisePhone("+91 90000 00011"), "9000000011");
  expectEquals(normalisePhone("(90000) 00011"), "9000000011");
  // The seeded numbers are written with the country code in docs/DEV_SETUP.md.
  expectEquals(normalisePhone("919000000011"), "9000000011");
  expectEquals(normalisePhone("+919000000011"), "9000000011");
  expectEquals(normalisePhone("1000000001"), null);
  expectEquals(normalisePhone("900000001"), null);
  expectEquals(normalisePhone("90000000001"), null, "an 11-digit number is not a mobile number");
  expectEquals(normalisePhone(9000000011), null);
});

Deno.test("validateInput is total: every failure is a 400-shaped response", () => {
  const good = validateInput({ fullName: "Murugan S", phone: "9000000011" });
  if (!("input" in good)) {
    throw new Error("expected the valid case to pass");
  }
  expectEquals(good.input, { fullName: "Murugan S", phone: "9000000011" });

  for (const payload of [null, "nope", 42, [], {}]) {
    const result = validateInput(payload);
    if (!("error" in result)) {
      throw new Error("expected an error response");
    }
  }
});

// --- failure modes ---------------------------------------------------------

Deno.test("a number that already has an account is 409, not a new user", async () => {
  const serviceRole = serviceRoleFake({
    createAuthUser: async () => ({
      error: { message: "User already registered" },
    }),
  });

  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }),
    deps({ serviceRole }),
  );

  expectStatus(response, 409);
  expectEquals(((await body(response)).error as { code: string }).code, "PHONE_EXISTS");
  expectEquals(serviceRole.patched.length, 0);
});

Deno.test("any other auth failure is a 500 that does not leak the message", async () => {
  const serviceRole = serviceRoleFake({
    createAuthUser: async () => ({ error: { message: "connection to auth server failed" } }),
  });

  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }),
    deps({ serviceRole }),
  );

  expectStatus(response, 500);
  const error = (await body(response)).error as { code: string; message: string };
  expectEquals(error.code, "CREATE_FAILED");
  expect(!error.message.includes("auth server"), "internal wording must not reach the console");
});

Deno.test("a failed profile update is reported, not swallowed", async () => {
  const serviceRole = serviceRoleFake({
    updateProfile: async () => ({ error: { message: "row level security" } }),
  });

  const response = await handleCreateDriver(
    post({ fullName: "Murugan S", phone: "9000000011" }),
    deps({ serviceRole }),
  );

  expectStatus(response, 500);
  expectEquals(((await body(response)).error as { code: string }).code, "PROFILE_FAILED");
});

Deno.test("a body that is not JSON is 400", async () => {
  const req = new Request("http://localhost/functions/v1/admin-create-driver", {
    method: "POST",
    headers: { Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" },
    body: "not json",
  });
  expectStatus(await handleCreateDriver(req, deps()), 400);
});
