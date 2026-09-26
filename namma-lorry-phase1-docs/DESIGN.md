# DESIGN.md — Namma Lorry

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

