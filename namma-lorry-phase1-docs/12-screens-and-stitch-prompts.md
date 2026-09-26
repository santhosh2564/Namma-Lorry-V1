# 12 — Final Screen List (Phase 1) & Google Stitch Prompts

This supersedes the screen list in doc 04 where they differ. Change from doc 04: **Review Decision is no longer a separate screen** — the review panel lives inside Trip Detail (C6), which saves one screen and keeps the map and evidence next to the decision.

## 1. Final count: 21 screens + 6 overlays

| Area | Platform | Screens |
|---|---|---|
| Shared | Mobile + Web | 4 — Splash, Sign in, Verify OTP, Access Notice |
| Driver app | Android + iOS | 8 — Location Permission, Battery Setup, My Trips, Trip Detail & Start, Active Trip, Trip Summary, Trip History, My Profile |
| Ops console | Web (desktop-first, tablet ok) | 9 — Live Dashboard, Loads, Create Load, Load Detail & Assign, Trips, Trip Detail & Review, Review Queue, Drivers, Vehicles |
| **Total** | | **21** |

**Overlays (not separate screens):** End Trip confirmation sheet · "Outside pickup" sheet · Tracking-problem banner (GPS off / permission revoked) · Add Driver modal · Add Vehicle modal · Language picker sheet.

## 2. Screen descriptions & use cases

### Shared
| # | Screen | Purpose | Use cases | Key states |
|---|---|---|---|---|
| S1 | **Splash** | Brand + decide where to go | App open; restores an active trip straight into Active Trip | Loading, restoring trip |
| S2 | **Sign in** | Enter mobile number | Driver/admin first login; re-login after sign-out | Invalid number, unregistered number, too many attempts |
| S3 | **Verify OTP** | 6-digit code | Confirm phone ownership | Wrong code, expired, resend countdown |
| S4 | **Access Notice** | Explain why this user can't continue here | Driver opened web → "Use the mobile app"; owner/shipper → "Coming soon"; deactivated account | 3 message variants |

### Driver app
| # | Screen | Purpose | Use cases | Key states |
|---|---|---|---|---|
| D1 | **Location Permission** | Prominent disclosure + request precise & "Allow all the time" location, notifications | First launch; permission later revoked | Each permission granted / denied / blocked (open settings) |
| D2 | **Battery Setup** (Android) | Stop the phone killing tracking | First launch on Xiaomi/Vivo/Oppo/Realme/Samsung; reminded if gaps appear | Brand-specific steps, done, skipped |
| D3 | **My Trips** (home tab) | See assigned + active trips | Check today's load; resume an active trip | Active trip pinned, list, empty, offline |
| D4 | **Trip Detail & Start** | Show load, pickup/drop on map, start trip | Driver reaches pickup and starts | Waiting for GPS, weak GPS, outside pickup (distance shown), ready (Start enabled), starting |
| D5 | **Active Trip** | Live tracking while driving | Glance at progress, sync status; end trip at drop | Tracking OK, offline (points waiting), GPS lost, near drop (End highlighted) |
| D6 | **Trip Summary** | Result after End | See verified km or why it needs review | Verifying, verified, needs review (reasons), ended offline (will sync) |
| D7 | **Trip History** (tab) | All past trips | Track record; check status of older trips | Filters, empty |
| D8 | **My Profile** (tab) | Read-only verified experience + settings | See verified trips/km; change language; check permissions; sign out | Sign-out blocked during active trip |

### Ops console (web)
| # | Screen | Purpose | Use cases | Key states |
|---|---|---|---|---|
| C1 | **Live Dashboard** | All active lorries on one map | Morning ops check; spot stale/offline trucks | No active trips, stale (>15 min) highlighted |
| C2 | **Loads** | List & search loads | Find a load by ID; see unassigned loads | Empty, filtered |
| C3 | **Create Load** | Create load with pickup/drop geofences | New order from shipper | Validation, fetching planned distance, saved |
| C4 | **Load Detail & Assign** | Review load, assign driver + vehicle | Dispatch a load; see its trip | Unassigned, assigned, driver busy warning |
| C5 | **Trips** | Table of all trips | Daily reconciliation; filter by driver/status/date | Filters, pagination |
| C6 | **Trip Detail & Review** | Route map, timeline, metrics, and review panel | Watch a live trip; replay a finished trip; approve/reject a flagged trip | Live, verifying, verified, needs review (review panel shown), rejected |
| C7 | **Review Queue** | Flagged trips waiting for a decision | Clear flags daily | Empty ("All caught up") |
| C8 | **Drivers** | Driver list + verified stats; add driver | Onboard a driver; check a driver's record | Add Driver modal, deactivated |
| C9 | **Vehicles** | Vehicle list; add vehicle | Register trucks and owners | Add Vehicle modal |

---

## 3. How to use Stitch for this project
1. Create **two Stitch projects**: *Namma Lorry Driver* (Mobile layout) and *Namma Lorry Console* (Web layout). Don't mix them.
2. Paste the **Design System** (§4 or `stitch/DESIGN.md`) as the first message of each project, or import the DESIGN.md if your Stitch version supports it.
3. Generate **one screen per prompt**, in the order below. Stitch's quality drops when asked for many screens at once.
4. After each screen, use the **state follow-ups** (one change at a time) to generate the important variants.
5. Maps: Stitch can't render Mappls — treat the map as a visual placeholder. In code it becomes the Mappls component.
6. Export to Figma or HTML/Tailwind as reference only; the real app is React Native — give the export to Claude Code as a visual spec, not as code to copy.

## 4. Design system (paste first)
```
Design system for "Namma Lorry" — a verified trip-tracking product for Indian lorry drivers and a logistics operations team.

Vibe: trustworthy, practical, calm, high-contrast, built for bright sunlight and one-handed use in a truck cab. Not playful, no gradients, no stock photos of people.

Colours:
- Primary (Ink Navy) #0F2A44 — headers, primary buttons, active tab
- Accent (Highway Amber) #F5A300 — lorry marker, highlights, Load ID chips
- Verified green #1E8E3E, Review orange #E37400, Rejected/End red #D93025, Live blue #1A73E8
- Background #F6F7F9, Surface white #FFFFFF, Border #E3E6EA, Text #1B1F24, Secondary text #5F6B7A

Typography: Noto Sans (must later support Tamil, Kannada, Hindi). Mobile: title 22/28 semibold, body 16/24, caption 13/18. Numbers (km, time) in tabular figures, large and bold.

Shape & spacing: 8 px grid, cards radius 16, buttons radius 12, chips fully rounded. Minimum touch target 48 px; primary driver buttons are full-width, 56–64 px tall.

Icons: Material Symbols Rounded, 24 px. Lorry icon for vehicles, pin for pickup (green) and flag for drop (red).

Status chips (text + colour, never colour alone): Ready to start (navy outline), Live (blue, pulsing dot), Verifying (grey), Verified (green, check), Needs review (orange, warning), Rejected (red).

Map style: light, low-saturation street map; route line navy 5 px; planned route dashed grey; geofences as translucent amber circles.

Sample data (use consistently): Driver Murugan S, +91 98xxxx4521; Vehicle TN 23 BK 4521, 19 ft container; Load NL-2026-000142, Sriperumbudur SIPCOT → Coimbatore Kurichi Industrial Estate, 512 km planned; Load NL-2026-000143, Hosur → Peenya, Bengaluru, 41 km.
```

## 5. Mobile prompts — project "Namma Lorry Driver" (Mobile layout)

**S1 Splash**
```
Mobile splash screen for Namma Lorry. Ink Navy #0F2A44 full background. Centered simple geometric lorry mark in Highway Amber above the wordmark "Namma Lorry" in white Noto Sans semibold, tagline below in 70% white: "Your work, verified." Small circular progress indicator near the bottom and tiny version text "v1.0". No illustrations, no photos.
```

**S2 Sign in**
```
Mobile sign-in screen for Namma Lorry drivers. Top: small lorry logo and title "Sign in with your mobile number". Subtitle: "We'll send a 6-digit code by SMS." One large phone input with fixed "+91" prefix segment and number keypad style. Full-width 56 px Ink Navy button "Send OTP" (disabled until 10 digits). Below, secondary text link "Change language" with a globe icon showing "English". At the bottom small grey text: "New driver? Contact Namma Lorry to get registered." Clean white background, generous spacing.
```
Follow-ups: `Show an error state: red helper text under the input "This number isn't registered with Namma Lorry."` · `Show the loading state of the Send OTP button.`

**S3 Verify OTP**
```
Mobile OTP verification screen. Back arrow top-left. Title "Enter the code", subtitle "Sent to +91 98xxx x4521 · Edit". Six separate large digit boxes (56 px), the active one with navy border. Below: "Resend code in 0:24" in grey. Full-width Ink Navy button "Verify & continue". Keep the numeric keyboard space visible at the bottom.
```
Follow-up: `Show error state: boxes with red borders and text "Wrong code. 2 attempts left."`

**S4 Access Notice**
```
Simple full-screen notice for Namma Lorry. Centered large outlined phone icon in navy inside a light circle. Title "Trips run on the mobile app". Body: "To start and record trips, install Namma Lorry on your Android or iPhone. This web page is for the operations team." Two buttons stacked: "Get it on Google Play" and "Download on the App Store" (neutral outlined badges, no official logos), and a text button "Sign out".
```
Follow-up: `Create a variant: title "Coming soon for owners and shippers", body "Live tracking for your vehicles and loads is coming in the next release.", only a Sign out button.`

**D1 Location Permission**
```
Mobile onboarding screen: "Allow location for your trips". Top illustration: simple flat map pin over a road with a small amber lorry (vector, 2 colours). Short disclosure card with 3 rows, each with an icon: "Only during trips — tracking starts when you tap Start and stops when you tap End"; "Builds your verified experience — kilometres and trips count only from real GPS"; "Shared with Namma Lorry operations for this load". Below, a checklist of 3 permission rows, each with status on the right: "Precise location" (green check Allowed), "Allow all the time" (amber button "Allow"), "Notifications" (grey "Pending"). Link "Read privacy policy". Full-width Ink Navy button "Continue" disabled until all are allowed. Step indicator "Step 1 of 2" at the top.
```
Follow-up: `Show the state where "Allow all the time" was denied: a red info box "Background location is required to record trips. Open Settings → Location → Allow all the time" with an "Open settings" button.`

**D2 Battery Setup**
```
Mobile onboarding screen "Keep tracking running", step 2 of 2. Detected phone brand chip at top: "Xiaomi / Redmi". Explanation: "Some phones stop apps in the background to save battery. This can break your trip record." Numbered steps card: 1 "Tap Open settings", 2 "Choose Battery saver → No restrictions", 3 "Turn on Autostart for Namma Lorry", each with a small UI hint icon. Full-width Ink Navy button "Open settings", secondary outlined button "I've done this", text link "Skip for now" in grey.
```

**D3 My Trips**
```
Mobile home screen "My Trips" for a lorry driver. Top app bar: greeting "Vanakkam, Murugan" and a small sync status icon. Pinned card at top with blue left border and pulsing "Live" chip: "Trip in progress · NL-2026-000142 · Sriperumbudur → Coimbatore · 2h 14m · 138 km so far" with a large "Resume" button. Section "Assigned to you" with 2 trip cards: each shows amber Load ID chip, route "Hosur → Peenya, Bengaluru", material "Auto parts · 6.5 t", vehicle "TN 23 BK 4521", status chip "Ready to start", chevron. Bottom navigation with 3 tabs: Trips (active), History, Profile. Pull-to-refresh feel.
```
Follow-ups: `Show empty state: illustration of a parked lorry, "No trips assigned yet", "New trips appear here when Namma Lorry assigns them to you."` · `Add an offline banner at the top: "You're offline — trip data is saved on your phone."`

**D4 Trip Detail & Start**
```
Mobile trip detail screen for load NL-2026-000143. Top 55% is a light street map showing a green pickup pin with a translucent amber 500 m circle around it, a red drop flag far away, a dashed grey planned route, and the driver's blue location dot just inside the circle. Bottom sheet with rounded top: amber Load ID chip, route "Hosur SIPCOT Phase 2 → Peenya Industrial Area, Bengaluru", rows with icons: Material "Auto parts · 6.5 t", Vehicle "TN 23 BK 4521 · 19 ft", Planned "41 km". A green status row "You're at the pickup · GPS accuracy 8 m". Huge full-width 64 px green button "START TRIP" with play icon. Small grey text below: "Tracking starts now and stops when you end the trip."
```
Follow-ups: `Show the "outside pickup" state: driver dot 3.2 km away, START button disabled grey, amber info row "You're 3.2 km from the pickup. Move inside the circle to start."` · `Show "Waiting for GPS" state with a spinner in place of the status row.`

**D5 Active Trip**
```
Mobile active trip screen while driving, designed to be read at a glance. Full-screen light map following an amber lorry marker with a navy route line behind it and the red drop flag ahead. Top floating card: blue pulsing "Live" chip, "NL-2026-000142", and "To Coimbatore". Bottom panel with 3 large stats in a row using big bold tabular numbers: "3h 05m" Time, "186 km" Distance (caption "approx."), "412 km" To drop. A sync row with green cloud-check icon: "All trip data synced · 20 s ago". A GPS row: "GPS good". Full-width 56 px red outlined button "END TRIP". No other buttons.
```
Follow-ups: `Offline state: sync row turns amber "Offline · 142 points saved on phone, will upload automatically".` · `Near-drop state: banner "You've reached the delivery area" and END TRIP becomes a solid red filled button.` · `Show the End Trip confirmation bottom sheet: title "End this trip?", body "Make sure you have delivered the load.", buttons "End trip" (red) and "Keep tracking".`

**D6 Trip Summary**
```
Mobile trip result screen. Large green check-circle at top, title "Trip verified", subtitle "Added to your verified experience". Big stat card with two bold numbers: "512 km verified" and "9h 42m". Route summary card with a small static map thumbnail and "Sriperumbudur SIPCOT → Coimbatore Kurichi · 26 Sep 2026". Row "Your total: 38 verified trips · 14,860 km". Full-width Ink Navy button "Back to My Trips".
```
Follow-ups: `"Needs review" variant: orange warning icon, title "Trip under review", list of reasons in plain language with icons: "Trip didn't end at the delivery location (1.8 km away)". Text: "Namma Lorry will check this. You don't need to do anything."` · `"Verifying" variant: grey spinner, "Checking your trip…", "Ended offline — will verify when you're online".`

**D7 Trip History**
```
Mobile "Trip history" tab. Horizontal filter chips: All, Verified, Under review, Not verified. Summary strip: "38 verified · 2 under review". Vertical list of trip rows grouped by month header "September 2026": each row shows date "26 Sep", route "Sriperumbudur → Coimbatore", Load ID small, distance "512 km" right-aligned, and a status chip (Verified green / Needs review orange / Rejected red). Bottom navigation with History active.
```

**D8 My Profile**
```
Mobile "My Profile" tab. Header card on Ink Navy: initials avatar "MS", name "Murugan S", phone "+91 98xxx x4521", small chip "Driver since Oct 2026 on Namma Lorry". Below, a white card titled "Verified experience" with a lock icon and caption "Calculated by Namma Lorry from GPS — can't be edited": 3 big stats "38 trips", "14,860 km", "Last trip 26 Sep". Settings list: Language (English), Location & battery check (green "All good"), Privacy policy, Help & support, Sign out (red text). Bottom navigation with Profile active.
```

## 6. Web prompts — project "Namma Lorry Console" (Web layout)

Common shell (paste once, before C1):
```
Desktop operations console for Namma Lorry, 1440 px wide. Left sidebar 240 px on Ink Navy #0F2A44 with white logo "Namma Lorry Ops" and nav items with Material Symbols icons: Live, Loads, Trips, Review (orange count badge "3"), Drivers, Vehicles. Top bar white with page title, global search "Search Load ID, vehicle or driver", and admin avatar menu. Content area on #F6F7F9 with white cards radius 16. Data-dense but calm, clear tables, sticky table headers.
```

**C1 Live Dashboard**
```
Console "Live" page. Content split: left 65% a large light street map of Tamil Nadu and Karnataka with 6 amber lorry markers rotated by heading and navy route tails; one marker has a red ring (stale). Right 35% panel "Active trips (6)" with search and a list: each row shows vehicle "TN 23 BK 4521", driver "Murugan S", load "NL-2026-000142", "Sriperumbudur → Coimbatore", last update "40 s ago" with green dot; one row shows "18 min ago" in red with "No recent data". KPI strip above the map: "6 live", "1 stale", "12 assigned today", "3 need review".
```

**C2 Loads**
```
Console "Loads" page. Header with title and primary Ink Navy button "+ Create load". Filter row: status tabs (All, Unassigned, Assigned, In trip, Done), date range, search. Table columns: Load ID (amber mono chip), Pickup, Drop, Planned km, Material, Created, Status chip, Assigned driver, row action "…". 10 realistic rows of Tamil Nadu / Karnataka industrial routes. Pagination footer.
```

**C3 Create Load**
```
Console "Create load" page, two columns. Left form card: section "Pickup" with an address search field showing an autosuggest dropdown ("SIPCOT Industrial Park, Sriperumbudur, Tamil Nadu"), a radius slider 100–2000 m set to 500 m; section "Drop" with the same; section "Load details": material, weight (tonnes), shipper (select), notes. Right: map card showing the pickup green pin and drop red flag with translucent amber radius circles and a dashed planned route, and a result strip "Planned distance 512 km · ~10 h". Footer bar: "Cancel" and Ink Navy "Create load". Caption: "Load ID is generated automatically."
```

**C4 Load Detail & Assign**
```
Console load detail page for "NL-2026-000143". Top summary card: route, material, weight, planned 41 km, created by, status "Unassigned". Left: map with both geofence circles and planned route. Right: "Assign trip" card with searchable driver select (shows "Murugan S · 38 verified trips · Available"), vehicle select ("TN 23 BK 4521 · 19 ft"), primary button "Assign". Below, an info note "The driver sees this trip in their app immediately." A warning variant row style for busy drivers: "Currently on another trip".
```

**C5 Trips**
```
Console "Trips" table page. Filters: status multi-select, driver, vehicle, date range, export CSV button. Table columns: Load ID, Driver, Vehicle, Started, Ended, Duration, Verified km, Status chip (Live/Verifying/Verified/Needs review/Rejected), reasons count. Rows with "Needs review" have a subtle orange left border. Row click opens detail. Pagination.
```

**C6 Trip Detail & Review**
```
Console trip detail page for NL-2026-000142. Header: Load ID, driver "Murugan S", vehicle, status chip "Needs review". Main left 65%: map with navy actual route, dashed grey planned route, green start pin, red end flag 1.8 km before the drop circle; a replay timeline slider under the map with play button and time labels. Right 35%: "Verification" card listing reason chips in orange ("END_OUTSIDE_DROP · ended 1.8 km from drop"), metrics grid (points 3,412 · max gap 4 min · avg speed 52 km/h · planned ratio 0.97 · mocked 0); "Timeline" card with events (Started 06:10, Ended 15:52, Flagged 15:53); and a sticky "Review decision" card with required note textarea and two buttons: "Approve & verify" green and "Reject" red outlined.
```
Follow-ups: `Live variant: blue "Live" chip, lorry marker moving, no review card, a "Last update 20 s ago" pill on the map.` · `Verified variant: green chip, review card replaced by "Verified by system · 512 km".`

**C7 Review Queue**
```
Console "Review" page. Title "Trips to review (3)" with oldest-first sort. Card list, each card: Load ID, driver, vehicle, ended "2 h ago", route, orange reason chips with plain text ("Tracking stopped for 22 min", "Didn't end at delivery location"), mini map thumbnail on the right, button "Open & review". Empty state variant text "All caught up".
```

**C8 Drivers**
```
Console "Drivers" page. Header button "+ Add driver". Table: avatar initials, Name, Phone, Verified trips, Verified km, Last trip, Current status (On trip / Available / Inactive), app permission health (green/amber dot). Show an "Add driver" side drawer open on the right with fields Name, Mobile (+91), Preferred language, and "Send invite SMS" toggle, primary "Add driver".
```

**C9 Vehicles**
```
Console "Vehicles" page. Header button "+ Add vehicle". Table: Registration no. in Indian plate style ("TN 23 BK 4521"), Type (407 / 14 ft / 17 ft / 19 ft / 22 ft / 24 ft / Multi-axle), Owner, Trips, Last used, Status. "Add vehicle" modal open: registration number with format hint, vehicle type select, owner select, primary "Save vehicle".
```

## 7. After Stitch
Save the chosen designs as images in `design/` and tell Claude Code: *"Match `design/D5-active-trip.png` using our design tokens in `src/theme/`; the map area is `@/components/map/MapView`."* Put the colours and type scale from §4 into `src/theme/tokens.ts` first so every screen stays consistent.
