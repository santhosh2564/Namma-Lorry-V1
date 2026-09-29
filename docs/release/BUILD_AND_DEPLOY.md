# Build, update and deploy — EAS + Vercel

Covers `eas.json`, EAS environment variables, EAS Update channels and the web console on Vercel. Hosted Supabase is in [SUPABASE_HOSTED.md](SUPABASE_HOSTED.md); day-2 operations (rollback, key rotation) are in [../RUNBOOK.md](../RUNBOOK.md).

## 1. Identity and versioning

| | Value |
|---|---|
| Display name | `Namma Lorry` (production), `Namma Lorry (Staging)` (preview), `Namma Lorry (Dev)` |
| iOS bundle id / Android package | `com.nammalorry.app`, the **same for every profile**: one store listing, and preview builds go to TestFlight / Play internal testing. Preview and production can't be installed side by side; the display name tells testers which one they have |
| `version` | `1.0.0` in `app.config.ts` (and `package.json`). User-facing; also the EAS Update **runtime version** |
| Build numbers | Owned by EAS: `appVersionSource: "remote"` + `autoIncrement` on `preview` and `production`. The counter is shared across profiles, so versionCodes always increase. Seed once with `eas build:version:set` |
| Runtime version | `policy: "appVersion"`. **Any native change** (new native module, plugin, permission, `app.config.ts` native field) ⇒ bump `version`, or old binaries will download a JS bundle they can't run |

## 2. Build profiles (`eas.json`)

| Profile | Distribution | Android | iOS | Channel | EAS environment | Backend |
|---|---|---|---|---|---|---|
| `development` | internal | dev client APK | simulator | `development` | development | local / staging |
| `development_device` | internal | dev client APK | device (ad hoc) | `development` | development | local / staging |
| `preview` | **store** | AAB → Play **internal testing** | → **TestFlight** | `preview` | preview | **staging** project |
| `preview_apk` | internal | APK, sideload via EAS link | — (Android only) | `preview` | preview | staging |
| `production` | store | AAB → Play internal → promote | → TestFlight → App Store | `production` | production | **production** project |

```bash
npx eas build -p all --profile preview          # TestFlight + Play internal (staging backend)
npx eas submit -p ios --profile preview --latest
npx eas submit -p android --profile preview --latest   # track: internal
npx eas build -p android --profile preview_apk  # quick APK for a pilot phone
npx eas build -p all --profile production
npx eas submit -p all --profile production --latest    # Android lands as a *draft* on internal
```

**Never promote a preview build to production.** It points at the staging database. Build `production` and promote that on the Play internal track instead.

**First Android upload must be manual.** Google's API can't create the first release. Download the first AAB from EAS and upload it in Play Console → Testing → Internal testing. `eas submit` works from the second build on.

## 3. Environment variables per profile

`EXPO_PUBLIC_*` values are **inlined into the JS bundle** and are public by design. Real secrets never use that prefix.

| Variable | development | preview | production | EAS visibility |
|---|---|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | `development` | `preview` | `production` | plain text (also in `eas.json` for builds) |
| `EXPO_PUBLIC_SUPABASE_URL` | local or staging | `https://<staging-ref>.supabase.co` | `https://<prod-ref>.supabase.co` | plain text |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | local | staging publishable/anon key | prod publishable/anon key | sensitive |
| `EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY` | dev key | key restricted to `com.nammalorry.app` | same key or a separate prod key | sensitive |
| `EXPO_PUBLIC_SENTRY_DSN` | empty | Sentry DSN | Sentry DSN (same project; `environment` tag separates them) | sensitive |
| `SENTRY_AUTH_TOKEN` | — | token (source maps) | token | **secret** |
| `SENTRY_ORG`, `SENTRY_PROJECT` | — | slugs | slugs | plain text |

```bash
npx eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<prod-ref>.supabase.co --visibility plaintext
npx eas env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production --visibility plaintext
npx eas env:create --environment production --name SENTRY_AUTH_TOKEN --value <token> --visibility secret
# …repeat per variable × environment; check with: npx eas env:list --environment production
```

`EXPO_PUBLIC_APP_ENV` must also exist as an **EAS environment variable**, not only in `eas.json`. `eas update` ignores `eas.json` `build.env`. The `npm run update:*` wrapper sets it too, as a second guard.

`src/lib/config.ts` rejects a non-`https://` Supabase URL outside `development`. A misconfigured preview or production build fails loudly instead of talking to a local stack.

## 4. EAS Update (OTA JavaScript fixes)

- Needs `expo-updates` (installed, `~57.0.23`) and the project id from `eas init` pasted into `EAS_PROJECT_ID` in `app.config.ts`. Until then updates are compiled **off** (verified in the prebuild output: `expo.modules.updates.ENABLED=false`, and `true` once an id is set).
- Channels map to branches of the same name. A build embeds its channel (`preview` or `production`); `eas update` publishes to that channel's branch.
- Launch behaviour: `checkAutomatically: ON_LOAD` with `fallbackToCacheTimeout: 0`. The app never waits on the network at launch; a downloaded update applies on the **next** cold start.

```bash
npm run update:preview -- "Fix trip list refresh"       # refuses on a dirty tree
npm run update:production -- "Fix trip list refresh"
npx eas update:list --branch production
```

An update can only change JS and assets. Anything touching native code, permissions or `app.config.ts` native fields needs a new build plus a `version` bump.

## 5. Web console (Vercel)

`vercel.json` holds the whole configuration:

- **Build:** `npm ci --legacy-peer-deps`, then `npm run export:web` (`expo export -p web`), output `dist/`. (Before R0 the repo `.npmrc` had `os=win32` and this needed `--os=linux`; that line is gone, so no override.)
- **SPA fallback:** every path that isn't a real file rewrites to `/index.html` (`web.output: "single"`), so deep links like `/console/trips/<id>` work on reload.
- **Security headers:** CSP (self + `*.supabase.co` https/wss + `*.mappls.com`/`*.mapmyindia.com` + Sentry ingest; no inline scripts; `frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` (no geolocation/camera/mic), COOP, `X-Robots-Tag: noindex`. `/_expo/static/*` is cached immutably (content-hashed).
- `Referrer-Policy` is `strict-origin-when-cross-origin`, **not** `no-referrer`. The Mappls web key is domain-restricted and Mappls checks the Referer origin.
- **The CSP has only been checked against today's bundle.** The real Mappls web map (M3) will load tiles, fonts, sprites and workers. After M3, open the console with DevTools open, fix any CSP violation in `vercel.json`, and redeploy.

Vercel project settings: import the GitHub repo, Framework Preset **Other** (vercel.json overrides the rest).

| Vercel environment | Git | Env vars |
|---|---|---|
| Production | `main` | `EXPO_PUBLIC_APP_ENV=production`, prod Supabase URL + anon key, Mappls key, Sentry DSN |
| Preview | other branches / PRs | `EXPO_PUBLIC_APP_ENV=preview`, **staging** Supabase URL + anon key, … |

Turn on **Deployment Protection → Vercel Authentication** for Preview deployments. The console is already behind login, but previews shouldn't be public at all.

Local check: `npm run export:web && npx serve dist -s` (the `-s` flag emulates the SPA fallback).
