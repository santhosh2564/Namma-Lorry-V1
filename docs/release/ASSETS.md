# Release assets — what exists and what's missing

**Status (29 Sep 2026): every app asset is a placeholder.** There is no `design/` folder (pre-flight ND-24 was never done). The only brand artwork in the repo is `SCREENS/namma_lorry_brand_logo/screen.png`, a 400×123 **screenshot of a wordmark**. It is too small and the wrong shape for any icon, so nothing was generated from it.

`npm run release:assets` checks the files below. It runs automatically on EAS for the `preview` and `production` profiles, so a TestFlight or Play build cannot ship the 1×1 placeholders. Dev builds and `preview_apk` are not gated.

## App assets (referenced by `app.config.ts`) — all missing

| File | Spec | Used for | Status |
|---|---|---|---|
| `assets/icon.png` | 1024×1024 PNG, **no transparency**, no rounded corners (iOS masks it) | iOS app icon, Android legacy icon | ✖ 1×1 placeholder |
| `assets/adaptive-icon.png` | 1024×1024 PNG, transparent background, logo inside the central **66 %** circle | Android adaptive icon foreground (background is Ink Navy `#0F2A44`, set in config) | ✖ 1×1 placeholder |
| `assets/splash.png` | Square, ≥ 512 px (1024 recommended), transparent background | Splash logo, drawn at 200 dp on Ink Navy | ✖ 1×1 placeholder |
| `assets/notification-icon.png` | ≥ 96×96, **pure white silhouette on transparent** (Android tints it; colour is ignored) | "Trip in progress" foreground-service notification | ✖ 1×1 placeholder (new in M12c) |
| `assets/favicon.png` | ≥ 48×48 (192 recommended) | Web console tab icon | ✖ 1×1 placeholder |

Brand references: Ink Navy `#0F2A44`, Highway Amber `#F5A300` (stitch/DESIGN.md). A lorry glyph in amber on navy is the obvious direction, but that's a design call for the client.

## Store listing assets — all missing

| Asset | Spec | Needed for |
|---|---|---|
| Play hi-res icon | 512×512 PNG, 32-bit | Play listing (even internal testing asks for it before the first rollout) |
| Play feature graphic | 1024×500 JPG/PNG, no alpha | Play listing |
| Play phone screenshots | 2–8, 9:16, each side 320–3840 px | Play listing |
| iOS screenshots | 6.9" (1320×2868) **or** 6.5" (1284×2778), 1–10 | App Store submission (not needed for TestFlight) |
| Play background-location **video** | Unlisted YouTube link, ≤ 30 s ideal | Play location-permission declaration — shot list in [PLAY_BACKGROUND_LOCATION.md](PLAY_BACKGROUND_LOCATION.md) |
| Play foreground-service video | Can reuse the same video | Play foreground-service (location) declaration |
| Privacy policy URL | Public HTTPS page | Both stores + the in-app D1 notice — text in [PRIVACY_POLICY.md](PRIVACY_POLICY.md) |

**Screenshots and the video can't be captured yet:** D1–D6 (onboarding, trip start, live trip, summary) are placeholders until M5–M10.
