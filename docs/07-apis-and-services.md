# 07 — APIs & Services (free-first) for Phase 1

## 1. Use these
| Need | Service / library | Phase | Free? | Notes |
|---|---|---|---|---|
| Map display (Android/iOS) | `mappls-map-react-native` | 1 | Mappls free developer tier | Native module → needs EAS dev build; iOS needs Mappls `.olf`/`.conf` config files in the bundle |
| Map display (web) | Mappls Web Maps JS SDK | 1 | Same key/tier | Restrict key by domain |
| Address search for pickup/drop | Mappls **Autosuggest** API | 1 | Tier quota | Call via `mappls-proxy` edge function |
| Coordinates ↔ address | Mappls **Geocoding / Reverse Geocoding** | 1 (reverse = P1) | Tier quota | Show readable start/end address on trips |
| Planned distance | Mappls **Distance Matrix / Route** API | 1 | Tier quota | Once per load, store in `loads.planned_distance_m` |
| Clean route line | Mappls **Snap to Road** | P1/P2 | Tier quota | Display only — never the official km |
| Live tracking animation | `mappls-tracking-react-native` plugin | Optional | Tier quota | Smooth truck animation on native; not required |
| GPS + background | `expo-location` + `expo-task-manager` | 1 | Free (MIT) | Foreground service on Android, "Always" on iOS |
| Offline queue | `expo-sqlite` | 1 | Free | |
| Secure session | `expo-secure-store` | 1 | Free | |
| Network status | `@react-native-community/netinfo` | 1 | Free | Trigger uploads on reconnect |
| Device info | `expo-device`, `expo-application` | 1 | Free | Stored in `trips.device_info` for audits |
| Database, auth, realtime, functions, cron | Supabase | 1 | Free tier | Enable PostGIS + pg_cron extensions |
| Push notifications | `expo-notifications` (FCM / APNs via Expo push) | P1 | Free | |
| Crash reporting | Sentry | 1 | Free developer tier | |
| Web hosting | Vercel / Netlify / Cloudflare Pages | 1 | Free tier | `npx expo export -p web` |
| CI | GitHub Actions | 1 | Free for public / quota for private | |
| QR code (Phase 2) | `react-native-qrcode-svg` | 2 | Free | Encodes verification URL |
| Device integrity (Phase 2) | Google Play Integrity API, Apple App Attest | 2 | Free quota | Verify on server in an edge function |

## 2. Paid but unavoidable
- **Apple Developer Program** (~US$99/yr) for any iOS distribution.
- **Google Play Console** (~US$25 one-time).
- **SMS OTP** in production (MSG91 / Twilio via Supabase phone auth or Send-SMS hook). India requires DLT template registration. Until pilot, use Supabase's test phone numbers + fixed OTPs in development.

## 3. Don't use
- **OpenStreetMap / Google / Mapbox tiles or OSRM routing alongside Mappls** — Mappls terms prohibit showing Mappls content on or next to a non-Mappls map. Pick Mappls everywhere.
- **`react-native-maps`** — would bring Google/Apple maps.
- **Paid background-geolocation SDKs** (e.g. Transistor `react-native-background-geolocation` needs a licence for Android release builds) — `expo-location` is enough for Phase 1.
- **Mappls InTouch SDK** — it's a full device-tracking platform with its own dashboard and needs separate access approval; we want our own verified pipeline in Supabase.

## 4. Key handling
| Key | Where | Protection |
|---|---|---|
| Mappls map SDK key | App bundle (`EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY`) | Restrict to package name, bundle id, web domain in Mappls console |
| Mappls REST client id/secret | Edge Function secrets | Never shipped to the app |
| Supabase anon key | App bundle | Safe only with RLS on every table |
| Supabase service role key | Edge Functions / CI only | Never in the app |

> Verify current Mappls quotas, auth model (static key vs OAuth client credentials) and SDK install steps in the Mappls developer console before W0 — they change between SDK versions.
