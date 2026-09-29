# Phase 1 release pack (M12c)

| File | What |
|---|---|
| [BUILD_AND_DEPLOY.md](BUILD_AND_DEPLOY.md) | Versioning, EAS profiles, env vars per profile, EAS Update channels, Vercel web console |
| [SUPABASE_HOSTED.md](SUPABASE_HOSTED.md) | Staging/production projects, migrations, cron, auth + SMS (DLT), users, secrets, functions |
| [ASSETS.md](ASSETS.md) | Icons, splash, store graphics: **all missing** |
| [PLAY_BACKGROUND_LOCATION.md](PLAY_BACKGROUND_LOCATION.md) | Play location + foreground-service declarations, demo video shot list |
| [PLAY_DATA_SAFETY.md](PLAY_DATA_SAFETY.md) | Play Data safety answers (legal review) |
| [APPLE_APP_PRIVACY.md](APPLE_APP_PRIVACY.md) | App Store privacy label answers (legal review) |
| [APP_REVIEW_NOTES.md](APP_REVIEW_NOTES.md) | Reviewer notes, demo account setup |
| [PRIVACY_POLICY.md](PRIVACY_POLICY.md) | Privacy policy draft: **requires legal review** |
| [../RUNBOOK.md](../RUNBOOK.md) | Deploy, rollback, key rotation, stuck trips, re-verification, data incidents |

## What is ready vs blocked (29 Sep 2026)

**Ready:** `app.config.ts` (name per env, `com.nammalorry.app`, version 1.0.0, EAS-managed build numbers, doc 09 permission strings, location foreground service, backup off, unused permissions and background modes removed, iOS privacy manifest). Verified in `expo prebuild` (Android) and `expo config --type introspect` (iOS). Also `eas.json` profiles and channels, `expo-updates`, `vercel.json`, the asset gate, `scripts/provision-user.mjs`, `scripts/eas-update.mjs`, and all docs.

**Blocked on unbuilt milestones:** a store build today would be a shell. Auth screens (M5), `mappls-proxy` (M6), loads (M7), the tracking engine (M8) and D1–D6 (M9/M10) don't exist, and the Mappls map is a preview (M3). The demo video, screenshots and a real review submission need them. Open decisions that affect release: ND-5 (retention), ND-8 (poison batch), ND-12 (handled for the pilot by disabling sign-ups), ND-13, ND-25.
