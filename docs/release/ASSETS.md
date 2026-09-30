# Release assets

**Status (30 Sep 2026): none exist.** There is no `assets/` folder on `main`, and `app.config.ts` sets `icon` and `web.favicon` to `undefined`. The brand artwork is a human item (CLAUDE.md hard rule 11): nothing here generates or fakes it.

`bun run release:assets` (`scripts/check-release-assets.mjs`) checks the files below by reading their PNG headers. CI runs it in report-only mode; run `bun run release:assets --strict` before any store build, and it exits 1 until every file passes. `test/config/release-docs.test.mjs` fails if this table and the script's `SPECS` disagree.

## App assets

All PNG. Brand colours from `stitch/DESIGN.md`: Ink Navy `#0F2A44`, Highway Amber `#F5A300`.

| File                            | Size              | Transparency | app.config field                    | Notes                                                                                                   |
| ------------------------------- | ----------------- | ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `assets/icon.png`               | 1024×1024         | not allowed  | `icon`                              | App Store icon and Android legacy icon. No rounded corners; iOS applies the mask. An alpha channel is rejected by App Store upload |
| `assets/adaptive-icon.png`      | 1024×1024         | required     | `android.adaptiveIcon.foregroundImage` | Android adaptive icon foreground. Keep the logo inside the central 66 % safe zone; set `android.adaptiveIcon.backgroundColor` to Ink Navy |
| `assets/splash.png`             | ≥ 512×512, square | either       | `plugins.expo-splash-screen.image`  | Splash logo, 1024 px recommended; transparent background drawn on the plugin's `backgroundColor` (Ink Navy) at `imageWidth` 200 |
| `assets/notification-icon.png`  | ≥ 96×96, square   | required     | `plugins.expo-notifications.icon`   | The "trip in progress" notification. Pure white silhouette on transparent: Android ignores colour and tints it |
| `assets/favicon.png`            | ≥ 48×48, square   | either       | `web.favicon`                       | Web console tab icon, 192 px recommended                                                               |

"Either" means the check does not test transparency. The notes above give the designer's preference.

**Wiring them in:** add the files, then set the fields above in `app.config.ts` (the splash and notification icon go in the plugin entries, for example `["expo-splash-screen", { image: "./assets/splash.png", imageWidth: 200, backgroundColor: "#0F2A44" }]`). Icons, splash and the notification icon are native: they ship only with a new binary, not an EAS Update.

## Store listing assets (uploaded in the consoles, not in the repo)

| Asset                                   | Spec                                                     | Needed for                                              |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Play hi-res icon                        | 512×512 PNG, 32-bit                                      | Play listing; asked for before the first rollout        |
| Play feature graphic                    | 1024×500 JPG or PNG, no alpha                            | Play listing                                            |
| Play phone screenshots                  | 2–8, 9:16, each side 320–3840 px                         | Play listing                                            |
| iOS screenshots                         | 6.9" (1320×2868) or 6.5" (1284×2778), 1–10               | App Store submission (not TestFlight)                   |
| Background-location video               | Unlisted YouTube link                                    | Play location and foreground-service declarations: [BACKGROUND_LOCATION.md](BACKGROUND_LOCATION.md) §3 |
| Privacy policy URL                      | Public HTTPS page                                        | Both stores: [PRIVACY_POLICY.md](PRIVACY_POLICY.md) after legal review |
