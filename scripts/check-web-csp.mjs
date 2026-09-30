#!/usr/bin/env node
/**
 * Web console CSP check (validation B5d). Serves the web export (`dist/`) with
 * the headers and rewrites from vercel.json, loads the console sign-in page in
 * headless Chromium, and fails on any Content-Security-Policy violation.
 *
 *   bun run export:web && bun run check:web-csp
 *   node scripts/check-web-csp.mjs --config vercel.json --dist dist
 *
 * Needs Playwright's Chromium (`bunx playwright install chromium`). The Mappls
 * map needs EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY and a signed-in admin, so the map
 * hosts in the CSP are not exercised here.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

/**
 * vercel.json `source` → RegExp. Vercel uses path-to-regexp; the patterns in
 * this repo are plain paths with regex groups, which read the same as a RegExp.
 */
export const sourceToRegExp = (source) => new RegExp(`^${source}$`);

/** Headers Vercel would send for `path`: every matching rule in order, later wins. */
export function headersFor(vercel, path) {
  const out = {};
  for (const rule of vercel.headers ?? []) {
    if (!sourceToRegExp(rule.source).test(path)) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

/** The destination of the first matching rewrite, or null. */
export function rewriteFor(vercel, path) {
  const rule = (vercel.rewrites ?? []).find((r) => sourceToRegExp(r.source).test(path));
  return rule ? rule.destination : null;
}

/** "a b; c d e" → { a: ["b"], c: ["d", "e"] } */
export function parseCsp(value) {
  const directives = {};
  for (const part of value.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives[name] = sources;
  }
  return directives;
}

async function fileAt(dist, path) {
  const file = normalize(join(dist, decodeURIComponent(path)));
  if (!file.startsWith(dist + sep) && file !== dist) return null;
  try {
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

/** Static server with Vercel's order: filesystem first, then rewrites, else 404. */
export function serve(vercel, dist, port = 0) {
  const root = resolve(dist);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    let file = await fileAt(root, path === "/" ? "/index.html" : path);
    if (!file) {
      const destination = rewriteFor(vercel, path);
      file = destination ? await fileAt(root, destination) : null;
    }
    const headers = headersFor(vercel, path);
    if (!file) {
      res.writeHead(404, headers);
      res.end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      ...headers,
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

/** Loads each path and returns the CSP violations (empty = pass). */
export async function findViolations(baseUrl, paths) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const violations = [];
  try {
    for (const path of paths) {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          window.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI || "inline"}`);
        });
      });
      page.on("console", (msg) => {
        if (/Content Security Policy/i.test(msg.text())) violations.push(`${path}: ${msg.text()}`);
      });
      await page.goto(baseUrl + path, { waitUntil: "load" });
      await page.getByText("Sign in with your mobile number").waitFor({ timeout: 30_000 });
      // Let lazy work (fonts, the auth bootstrap) settle.
      await page.waitForTimeout(2_000);
      if (path === "/sign-in") {
        // Exercise connect-src for real: Send OTP calls Supabase auth. The
        // probe host does not resolve, but CSP is checked before the network.
        const request = page.waitForRequest(/\.supabase\.co\/auth\//, { timeout: 15_000 });
        await page
          .getByTestId("sign-in-phone")
          .locator("input")
          .or(page.getByTestId("sign-in-phone"))
          .first()
          .fill("9876543210");
        await page.getByTestId("sign-in-submit").click();
        await request.catch(() =>
          violations.push(`${path}: Send OTP made no Supabase auth request`),
        );
        await page.waitForTimeout(1_000);
      }
      const events = await page.evaluate(() => window.__cspViolations);
      violations.push(...events.map((v) => `${path}: ${v}`));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return [...new Set(violations)];
}

async function main() {
  const { values } = parseArgs({
    options: {
      config: { type: "string", default: "vercel.json" },
      dist: { type: "string", default: "dist" },
    },
  });
  const vercel = JSON.parse(await readFile(values.config, "utf8"));
  const server = await serve(vercel, values.dist);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(`${baseUrl}/`);
    if (!home.headers.get("content-security-policy")) {
      throw new Error("no Content-Security-Policy header on /");
    }
    // `/` (the splash routes to sign-in) and a deep link that needs the SPA rewrite.
    const violations = await findViolations(baseUrl, ["/", "/sign-in"]);
    if (violations.length > 0) {
      console.error(`[check:web-csp] ${violations.length} CSP violation(s):`);
      for (const v of violations) console.error(`  ✖ ${v}`);
      process.exitCode = 1;
    } else {
      console.log("[check:web-csp] sign-in page loaded with zero CSP violations (/, /sign-in)");
    }
  } catch (e) {
    console.error(`[check:web-csp] ${e.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
