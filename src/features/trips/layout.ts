// Layout rules for the driver trip screens at large system font sizes (M12a accessibility).
// Android/iOS "large text" scales every Text; the map is fixed-height, so it gives up space
// to keep the stats, status and the START/END button reachable without much scrolling.

/** Above this font scale the map shrinks (130 % is Android's "Large"). */
export const LARGE_FONT_SCALE = 1.3;

/** D5 map: 45 % of the window normally, 30 % with large text, never under 180 px. */
export function activeTripMapHeight(windowHeight: number, fontScale: number): number {
  return Math.max(180, Math.round(windowHeight * (fontScale > LARGE_FONT_SCALE ? 0.3 : 0.45)));
}

/** D4 map: 320 px normally, 220 px with large text. */
export function tripDetailMapHeight(fontScale: number): number {
  return fontScale > LARGE_FONT_SCALE ? 220 : 320;
}
