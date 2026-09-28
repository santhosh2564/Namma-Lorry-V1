/**
 * C6 replay logic (M11, docs/12 C6).
 *
 * "Replay a finished trip" is a slider over the recorded points: play, pause,
 * scrub. The state is a pure machine over (index, playing, next step deadline)
 * so the screen only has to feed it a clock, and so the boundaries — reaching
 * the end, starting again from the top, scrubbing to the last point — are
 * testable without a running app.
 *
 * Playback advances one recorded point per {@link REPLAY_STEP_MS} rather than
 * replaying real time: a nine-hour trip watched at 1× is a way to lose a
 * reviewer, and the point of the slider is to see *where the truck went and
 * when*, not to sit through it.
 */
import type { LatLng } from "@/components/map";

/** One recorded point, as far as the replay cares. */
export type ReplayPoint = {
  seq: number;
  recordedAt: string;
  lat: number;
  lng: number;
};

/** One point per two seconds of wall clock while playing. */
export const REPLAY_STEP_MS = 2_000;

export type ReplayState = {
  /** Index into the ordered point list, 0-based. */
  index: number;
  playing: boolean;
  /** Epoch ms of the next advance; null while paused. */
  nextStepAt: number | null;
};

function clampIndex(index: number, pointCount: number): number {
  if (pointCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(pointCount - 1, Math.round(index)));
}

/** Pure: a fresh replay, parked on the first point. */
export function initialReplay(): ReplayState {
  return { index: 0, playing: false, nextStepAt: null };
}

/** Pure: a trip needs at least two points before there is anything to replay. */
export function canReplay(pointCount: number): boolean {
  return pointCount >= 2;
}

/** Pure: is the cursor sitting on the final point? */
export function atEnd(state: ReplayState, pointCount: number): boolean {
  return pointCount > 0 && state.index >= pointCount - 1;
}

/**
 * Pure: start (or restart) playback.
 *
 * Pressing play at the end of the route starts again from the first point —
 * a reviewer who watched the whole thing and wants to see the start again
 * should not have to scrub back by hand.
 */
export function playReplay(state: ReplayState, pointCount: number, nowMs: number): ReplayState {
  if (!canReplay(pointCount)) {
    return initialReplay();
  }
  const index = atEnd(state, pointCount) ? 0 : clampIndex(state.index, pointCount);
  return { index, playing: true, nextStepAt: nowMs + REPLAY_STEP_MS };
}

/** Pure: stop where we are. */
export function pauseReplay(state: ReplayState): ReplayState {
  return { index: state.index, playing: false, nextStepAt: null };
}

/**
 * Pure: drag the slider.
 *
 * Scrubbing while playing keeps playing (the reviewer is inspecting, not
 * stopping) and restarts the step clock so the next point arrives one full step
 * after they let go, not immediately.
 */
export function seekReplay(
  state: ReplayState,
  index: number,
  pointCount: number,
  nowMs: number,
): ReplayState {
  return {
    index: clampIndex(index, pointCount),
    playing: state.playing,
    nextStepAt: state.playing ? nowMs + REPLAY_STEP_MS : null,
  };
}

/** Pure: jump to the last point recorded at or before `iso` (timeline taps). */
export function indexAtTime(points: readonly ReplayPoint[], iso: string | null): number {
  if (iso === null || points.length === 0) {
    return 0;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return 0;
  }
  let index = 0;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point && Date.parse(point.recordedAt) <= at) {
      index = i;
    }
  }
  return index;
}

/**
 * Pure: one animation step.
 *
 * Steps as many times as the clock says have passed, so a throttled tab (the
 * console left in the background over lunch) catches up instead of losing the
 * trip, and stops cleanly on the last point.
 */
export function tickReplay(state: ReplayState, pointCount: number, nowMs: number): ReplayState {
  if (!state.playing || state.nextStepAt === null || !canReplay(pointCount)) {
    return state;
  }
  let { index, nextStepAt } = state;
  while (nextStepAt !== null && nowMs >= nextStepAt && index < pointCount - 1) {
    index += 1;
    nextStepAt += REPLAY_STEP_MS;
  }
  if (index >= pointCount - 1) {
    return { index: pointCount - 1, playing: false, nextStepAt: null };
  }
  return { index, playing: true, nextStepAt };
}

/** Pure: the truck marker position at the cursor, or null with no points. */
export function replayMarker(points: readonly ReplayPoint[], state: ReplayState): LatLng | null {
  const point = points[clampIndex(state.index, points.length)];
  return point === undefined ? null : { lat: point.lat, lng: point.lng };
}

/** Pure: 0–1 along the route, for the slider fill and the time labels. */
export function replayProgress(state: ReplayState, pointCount: number): number {
  if (pointCount <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(1, state.index / (pointCount - 1)));
}

/**
 * Pure: `"06:10"` in the viewer's local time.
 *
 * Hand-rolled like D6's `formatTripDate`: Hermes ships without full ICU data,
 * so `Intl` cannot be trusted to produce the same string on every platform.
 */
export function replayClock(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Pure: `"9h 42m"`, or null when the trip has not finished. */
export function replayDurationLabel(startIso: string | null, endIso: string | null): string | null {
  if (startIso === null || endIso === null) {
    return null;
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const minutes = Math.floor((end - start) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
}
