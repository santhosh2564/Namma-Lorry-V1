/**
 * C6 replay rule tests (M11, docs/12 C6).
 *
 * The replay is a small state machine, and the cases that break it are the
 * edges: starting again from the end, a tab that was throttled for an hour, and
 * scrubbing while playing.
 */
import {
  atEnd,
  canReplay,
  initialReplay,
  indexAtTime,
  pauseReplay,
  playReplay,
  replayClock,
  replayDurationLabel,
  replayMarker,
  replayProgress,
  REPLAY_STEP_MS,
  seekReplay,
  tickReplay,
  type ReplayPoint,
  type ReplayState,
} from "./replayState";

const T0 = Date.parse("2026-09-28T06:10:00.000Z");

function points(count: number): ReplayPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    seq: index + 1,
    recordedAt: new Date(T0 + index * 60_000).toISOString(),
    lat: 12.9 + index * 0.01,
    lng: 79.9 + index * 0.01,
  }));
}

describe("replay availability", () => {
  it("needs two points before there is a route to move along", () => {
    expect(canReplay(0)).toBe(false);
    expect(canReplay(1)).toBe(false);
    expect(canReplay(2)).toBe(true);
  });

  it("parks on the first point, paused", () => {
    const state = initialReplay();
    expect(state).toEqual({ index: 0, playing: false, nextStepAt: null });
  });
});

describe("play and pause", () => {
  it("starts playing and schedules the first step", () => {
    const state = playReplay(initialReplay(), 5, T0);
    expect(state.playing).toBe(true);
    expect(state.nextStepAt).toBe(T0 + REPLAY_STEP_MS);
  });

  it("restarts from the beginning when play is pressed at the end", () => {
    const atLast = { index: 4, playing: false, nextStepAt: null };
    const state = playReplay(atLast, 5, T0);
    expect(state.index).toBe(0);
    expect(state.playing).toBe(true);
  });

  it("does nothing for a trip with no points", () => {
    expect(playReplay(initialReplay(), 1, T0)).toEqual(initialReplay());
  });

  it("keeps its place when paused", () => {
    const playing = { index: 3, playing: true, nextStepAt: T0 + 10 };
    expect(pauseReplay(playing)).toEqual({ index: 3, playing: false, nextStepAt: null });
  });
});

describe("tick", () => {
  it("does not advance before the step is due", () => {
    const playing = playReplay(initialReplay(), 5, T0);
    expect(tickReplay(playing, 5, T0 + 10).index).toBe(0);
  });

  it("advances one point per step", () => {
    let state = playReplay(initialReplay(), 5, T0);
    state = tickReplay(state, 5, T0 + REPLAY_STEP_MS);
    expect(state.index).toBe(1);
    state = tickReplay(state, 5, T0 + REPLAY_STEP_MS * 2);
    expect(state.index).toBe(2);
  });

  it("catches up after a throttled tab rather than losing the trip", () => {
    let state = playReplay(initialReplay(), 5, T0);
    state = tickReplay(state, 5, T0 + REPLAY_STEP_MS * 3);
    expect(state.index).toBe(3);
  });

  it("stops on the last point instead of running off the end", () => {
    let state: ReplayState = { index: 3, playing: true, nextStepAt: T0 + REPLAY_STEP_MS };
    state = tickReplay(state, 5, T0 + REPLAY_STEP_MS * 10);
    expect(state).toEqual({ index: 4, playing: false, nextStepAt: null });
    expect(atEnd(state, 5)).toBe(true);
  });

  it("leaves a paused replay alone", () => {
    const paused = { index: 2, playing: false, nextStepAt: null };
    expect(tickReplay(paused, 5, T0 + 100_000)).toBe(paused);
  });
});

describe("seeking", () => {
  it("clamps a drag to the points that exist", () => {
    expect(seekReplay(initialReplay(), 99, 5, T0).index).toBe(4);
    expect(seekReplay(initialReplay(), -4, 5, T0).index).toBe(0);
  });

  it("keeps playing after a scrub and restarts the step clock", () => {
    const playing = playReplay(initialReplay(), 5, T0);
    const scrubbed = seekReplay(playing, 2, 5, T0 + 500);
    expect(scrubbed.playing).toBe(true);
    expect(scrubbed.nextStepAt).toBe(T0 + 500 + REPLAY_STEP_MS);
  });

  it("stays paused after a scrub when it was paused", () => {
    const scrubbed = seekReplay(initialReplay(), 2, 5, T0);
    expect(scrubbed).toEqual({ index: 2, playing: false, nextStepAt: null });
  });
});

describe("indexAtTime — timeline taps", () => {
  it("finds the last point recorded at or before the event", () => {
    const list = points(5);
    const target = Date.parse(list[3]!.recordedAt);
    expect(indexAtTime(list, new Date(target).toISOString())).toBe(3);
    expect(indexAtTime(list, new Date(target - 1).toISOString())).toBe(2);
  });

  it("starts at the beginning for an event before the trip or unreadable", () => {
    const list = points(5);
    expect(indexAtTime(list, new Date(T0 - 60_000).toISOString())).toBe(0);
    expect(indexAtTime(list, null)).toBe(0);
    expect(indexAtTime(list, "nonsense")).toBe(0);
  });
});

describe("cursor", () => {
  it("puts the marker on the point at the cursor", () => {
    const list = points(3);
    expect(replayMarker(list, { index: 1, playing: false, nextStepAt: null })).toEqual({
      lat: list[1]!.lat,
      lng: list[1]!.lng,
    });
  });

  it("has no marker without points", () => {
    expect(replayMarker([], initialReplay())).toBeNull();
  });

  it("reports progress along the route", () => {
    expect(replayProgress({ index: 0, playing: false, nextStepAt: null }, 5)).toBe(0);
    expect(replayProgress({ index: 2, playing: false, nextStepAt: null }, 5)).toBe(0.5);
    expect(replayProgress({ index: 4, playing: false, nextStepAt: null }, 5)).toBe(1);
  });

  it("has no progress to report for a single-point trip", () => {
    expect(replayProgress(initialReplay(), 1)).toBe(0);
  });
});

describe("labels", () => {
  it("formats a recorded time as a clock", () => {
    expect(replayClock(new Date(T0).toISOString())).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns null rather than an Invalid Date string", () => {
    expect(replayClock(null)).toBeNull();
    expect(replayClock("nonsense")).toBeNull();
  });

  it("formats the trip duration, and only when it is finished", () => {
    const start = new Date(T0).toISOString();
    const end = new Date(T0 + (9 * 60 + 42) * 60_000).toISOString();
    expect(replayDurationLabel(start, end)).toBe("9h 42m");
    expect(replayDurationLabel(start, new Date(T0 + 3 * 3_600_000).toISOString())).toBe("3h");
    expect(replayDurationLabel(start, new Date(T0 + 42 * 60_000).toISOString())).toBe("42m");
    expect(replayDurationLabel(start, null)).toBeNull();
    expect(replayDurationLabel(end, start)).toBeNull();
  });
});
