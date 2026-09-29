#!/usr/bin/env node
/**
 * Builds test/gpx/<route>.gpx from test/gpx/routes.json (M12b).
 * One track point every `intervalS` seconds at `avgSpeedKmh`, interpolated along the
 * waypoints (great-circle length, linear lat/lng between waypoints — fine at this scale).
 * Timestamps start at a fixed time so output is reproducible; the Android emulator
 * (Extended controls → Location → Routes → Load GPX/KML) replays them in real time
 * or at a chosen speed multiplier.
 * Usage: npm run gpx:gen
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'gpx');
const { routes } = JSON.parse(readFileSync(join(dir, 'routes.json'), 'utf8'));
const START = Date.parse('2026-10-05T06:00:00Z');
const R = 6371008.8;

export function haversine([lat1, lng1], [lat2, lng2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function build(route) {
  const pts = route.waypoints.map(([, lat, lng]) => [lat, lng]);
  const legs = pts.slice(1).map((p, i) => haversine(pts[i], p));
  const total = legs.reduce((a, b) => a + b, 0);
  const step = (route.avgSpeedKmh / 3.6) * route.intervalS; // metres between fixes
  const count = Math.ceil(total / step);
  const track = [];
  for (let i = 0; i <= count; i += 1) {
    let d = Math.min(i * step, total);
    let leg = 0;
    while (leg < legs.length - 1 && d > legs[leg]) d -= legs[leg++];
    const f = legs[leg] === 0 ? 0 : d / legs[leg];
    const [a, b] = [pts[leg], pts[leg + 1]];
    track.push({
      lat: a[0] + (b[0] - a[0]) * f,
      lng: a[1] + (b[1] - a[1]) * f,
      time: new Date(
        START + Math.min(i * route.intervalS, (total / step) * route.intervalS) * 1000,
      ),
    });
  }
  return { track, total };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

for (const route of routes) {
  const { track, total } = build(route);
  const hours = (track.at(-1).time - track[0].time) / 3.6e6;
  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="namma-lorry scripts/gen-gpx.mjs" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${esc(route.name)}</name><desc>${esc(
      `Load ${route.loadCode} · ${(total / 1000).toFixed(1)} km waypoint-path · ${track.length} fixes every ${route.intervalS} s at ${route.avgSpeedKmh} km/h (${hours.toFixed(1)} h). Generated from test/gpx/routes.json.`,
    )}</desc></metadata>`,
    ...route.waypoints.map(
      ([name, lat, lng]) => `  <wpt lat="${lat}" lon="${lng}"><name>${esc(name)}</name></wpt>`,
    ),
    `  <trk><name>${esc(route.name)}</name><trkseg>`,
    ...track.map(
      (p) =>
        `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${p.time.toISOString()}</time></trkpt>`,
    ),
    '  </trkseg></trk>',
    '</gpx>',
    '',
  ].join('\n');
  writeFileSync(join(dir, `${route.id}.gpx`), gpx);
  console.log(
    `${route.id}.gpx: ${(total / 1000).toFixed(1)} km, ${track.length} points, ${hours.toFixed(2)} h`,
  );
}
