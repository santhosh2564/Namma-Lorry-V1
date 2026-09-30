// vercel.json for the web console (validation B5d): build, SPA rewrite,
// caching, security headers and a CSP that allows exactly what the console
// uses. scripts/check-web-csp.mjs loads the real export under these headers in
// Chromium; this file pins the policy itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { headersFor, parseCsp, rewriteFor } from "../../scripts/check-web-csp.mjs";

const root = join(import.meta.dirname, "..", "..");
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const csp = () => parseCsp(headersFor(vercel, "/sign-in")["content-security-policy"] ?? "");

const IMMUTABLE = "public, max-age=31536000, immutable";

test("builds the static export with bun, from the lockfile", () => {
  assert.equal(vercel.installCommand, "bun install --frozen-lockfile");
  assert.equal(vercel.buildCommand, "bun run export:web");
  assert.equal(vercel.outputDirectory, "dist");
  // No framework preset: Vercel must not guess a build for an Expo app.
  assert.equal(vercel.framework, null);
});

test("SPA rewrite: app routes go to /index.html, files and bundles do not", () => {
  for (const path of ["/", "/sign-in", "/verify", "/trips/123", "/loads/new", "/review"]) {
    assert.equal(rewriteFor(vercel, path), "/index.html", path);
  }
  for (const path of [
    "/_expo/static/js/web/entry-abc.js",
    "/_expo/anything",
    "/assets/node_modules/x/NotoSans.abc.ttf",
    "/favicon.ico",
    "/metadata.json",
  ]) {
    assert.equal(rewriteFor(vercel, path), null, path);
  }
});

test("caching: hashed bundles and assets are immutable; pages always revalidate", () => {
  assert.equal(headersFor(vercel, "/_expo/static/js/web/entry-abc.js")["cache-control"], IMMUTABLE);
  assert.equal(headersFor(vercel, "/assets/node_modules/x/a.abc.ttf")["cache-control"], IMMUTABLE);
  for (const path of ["/", "/index.html", "/sign-in", "/trips/123"]) {
    assert.equal(headersFor(vercel, path)["cache-control"], "no-cache", path);
  }
});

test("security headers on every response, bundles included", () => {
  for (const path of ["/", "/sign-in", "/_expo/static/js/web/entry-abc.js"]) {
    const h = headersFor(vercel, path);
    assert.ok(h["content-security-policy"], `${path}: CSP`);
    assert.match(h["strict-transport-security"], /^max-age=(\d+); includeSubDomains$/);
    assert.ok(Number(/max-age=(\d+)/.exec(h["strict-transport-security"])[1]) >= 31536000);
    assert.equal(h["x-content-type-options"], "nosniff");
    assert.equal(h["referrer-policy"], "strict-origin-when-cross-origin");
    assert.equal(h["x-frame-options"], "DENY");
    // The console never asks for the admin's location (maps are centred on trips).
    assert.match(h["permissions-policy"], /(^|, )geolocation=\(\)/);
    assert.match(h["permissions-policy"], /camera=\(\)/);
    assert.match(h["permissions-policy"], /microphone=\(\)/);
  }
});

test("CSP: locked-down defaults", () => {
  const d = csp();
  assert.deepEqual(d["default-src"], ["'self'"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["form-action"], ["'self'"]);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
  assert.ok("upgrade-insecure-requests" in d);
});

test("CSP script-src: self + the Mappls web SDK; no inline, no eval, no wasm", () => {
  const src = csp()["script-src"];
  assert.deepEqual(src, ["'self'", "https://sdk.mappls.com", "https://*.mappls.com"]);
  // Verified in B5d: the export has no inline <script>, and web never opens
  // expo-sqlite (src/tracking/db.ts uses the memory store), so no wasm either.
  for (const banned of ["'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "*", "https:"]) {
    assert.ok(!src.includes(banned), banned);
  }
});

test("CSP style-src: 'unsafe-inline' is the one documented exception", () => {
  // react-native-web and expo-font create <style> elements at runtime (one
  // hash per style, so hashes are not workable); a strict style-src blocks
  // them (measured in B5d with scripts/check-web-csp.mjs).
  assert.deepEqual(csp()["style-src"], ["'self'", "'unsafe-inline'", "https://*.mappls.com"]);
});

test("CSP connect-src: Supabase (REST, auth, functions, realtime), Sentry ingest, Mappls", () => {
  const src = csp()["connect-src"];
  for (const host of [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
    "https://*.mappls.com",
    "https://*.mapmyindia.com",
  ]) {
    assert.ok(src.includes(host), host);
  }
  assert.ok(!src.includes("*") && !src.includes("https:") && !src.includes("http:"));
});

test("CSP img/font/worker: self plus the map's tiles, glyphs and GL workers", () => {
  const d = csp();
  assert.deepEqual(d["img-src"], [
    "'self'",
    "data:",
    "blob:",
    "https://*.mappls.com",
    "https://*.mapmyindia.com",
  ]);
  assert.deepEqual(d["font-src"], ["'self'", "https://*.mappls.com"]);
  assert.deepEqual(d["worker-src"], ["'self'", "blob:"]);
});

test("no Google Fonts: the app bundles its fonts (src/theme/fonts.ts)", () => {
  assert.doesNotMatch(JSON.stringify(vercel), /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});
