---
name: Namma Lorry
colors:
  surface: '#f8f9ff'
  surface-dim: '#d7dae1'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4fb'
  surface-container: '#ebeef5'
  surface-container-high: '#e5e8ef'
  surface-container-highest: '#e0e2e9'
  on-surface: '#181c21'
  on-surface-variant: '#43474d'
  inverse-surface: '#2d3136'
  inverse-on-surface: '#eef1f8'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#48607d'
  primary: '#00152a'
  on-primary: '#ffffff'
  primary-container: '#0f2a44'
  on-primary-container: '#7992b1'
  inverse-primary: '#b0c9ea'
  secondary: '#825500'
  on-secondary: '#ffffff'
  secondary-container: '#feaa11'
  on-secondary-container: '#694300'
  tertiary: '#201100'
  on-tertiary: '#ffffff'
  tertiary-container: '#3c2300'
  on-tertiary-container: '#af895a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#b0c9ea'
  on-primary-fixed: '#001d36'
  on-primary-fixed-variant: '#304864'
  secondary-fixed: '#ffddb4'
  secondary-fixed-dim: '#ffb952'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#633f00'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ebbf8c'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#5f4119'
  background: '#f8f9ff'
  on-background: '#181c21'
  surface-variant: '#e0e2e9'
  verified-green: '#1E8E3E'
  review-orange: '#E37400'
  rejected-red: '#D93025'
  live-blue: '#1A73E8'
  surface-bg: '#F6F7F9'
  surface-card: '#FFFFFF'
  border-subtle: '#E3E6EA'
  text-secondary: '#5F6B7A'
typography:
  headline-lg:
    fontFamily: Noto Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Noto Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-md:
    fontFamily: Noto Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  headline-sm:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Noto Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Noto Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
  data-display:
    fontFamily: Noto Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

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
