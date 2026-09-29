import en from '@/i18n/en.json';

import { eventText, formatAge, formatKm, maskPhone, reasonText, statusText } from '../format';

describe('maskPhone', () => {
  it.each([
    ['919000004521', '+91 90xxxx4521'],
    ['+91 98765 43210', '+91 98xxxx3210'],
    ['9876543210', '+91 98xxxx3210'],
  ])('%s → %s', (input, expected) => expect(maskPhone(input)).toBe(expected));

  it('never returns the full number for odd formats', () => {
    expect(maskPhone('12345')).toBe('x2345');
    expect(maskPhone(null)).toBe('');
  });
});

describe('labels', () => {
  it('uses the docs/08 driver-facing text for every reason code', () => {
    for (const [code, text] of Object.entries(en.reasons)) {
      if (code !== 'unknown') expect(reasonText(code)).toBe(text);
    }
    expect(reasonText('SOMETHING_NEW')).toBe(en.reasons.unknown);
  });

  it('uses docs/06 §5 driver vs console status wording', () => {
    expect(statusText('completed', 'driver')).toBe('Verifying…');
    expect(statusText('completed', 'console')).toBe('Awaiting data');
    expect(statusText('in_progress', 'console')).toBe('Live');
  });

  it('labels audit events', () => {
    expect(eventText('approved')).toBe('Approved by admin');
    expect(eventText('weird')).toBe(en.events.unknown);
  });
});

describe('numbers and times', () => {
  it('formats km with one decimal and a placeholder for null', () => {
    expect(formatKm(512000)).toBe('512.0 km');
    expect(formatKm(null)).toBe('--');
  });

  it('formats ages', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(formatAge('2026-09-28T11:59:40Z', now)).toBe('now');
    expect(formatAge('2026-09-28T11:48:00Z', now)).toBe('12m ago');
    expect(formatAge('2026-09-28T09:30:00Z', now)).toBe('2h 30m ago');
  });
});
