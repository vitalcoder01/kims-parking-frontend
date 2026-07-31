// Indian registration plates, parsed into their four blocks.
//
//   AP 39 AB 1234
//   ^^                state
//      ^^             RTO (district office)
//         ^^          series
//            ^^^^     registration number
//
// Series is 0-3 letters: older plates run "AP 39 1234" with none, and modern
// ones have one to three. Registration number is up to 4 digits.
//
// Everything here is local and synchronous — a valet desk with no signal must
// still format and validate a plate.

import {findState, isValidRto} from '../data/indianRto';

export interface PlateParts {
  state: string;
  rto: string;
  series: string;
  number: string;
}

/** Strip separators and upper-case. Handles every paste shape we've seen:
 *  "AP39AB1234", "AP 39 AB 1234", "AP-39-AB-1234", "AP/39/AB/1234". */
export function normalisePlate(v: string): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Split raw input into blocks as far as it goes.
 *
 * Deliberately tolerant: it parses partial input ("AP3", "AP39A") so the field
 * can format and suggest WHILE typing rather than only once a whole plate is
 * present. Returns null only when the input can't be the start of a plate.
 */
export function parsePlate(input: string): PlateParts | null {
  const raw = normalisePlate(input);
  const m = raw.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,3})(\d{0,4})$/);
  if (!m) return null;
  const [, state, rto, series, number] = m;
  if (!state) return null;
  return {state, rto, series, number};
}

/** "AP 39 AB 1234" — display form. Partial input formats too. */
export function formatPlate(input: string): string {
  const p = parsePlate(input);
  if (!p) return (input ?? '').toUpperCase().trim();
  return [p.state, p.rto, p.series, p.number].filter(Boolean).join(' ');
}

export type PlateBlock = 'state' | 'rto' | 'series' | 'number';
export type PlateIssue = {block: PlateBlock; message: string} | null;

/**
 * The first thing wrong with this plate, or null when it is complete and
 * valid. Ordered by block so the message names the part that needs fixing
 * rather than restating the whole format.
 */
export function validatePlate(input: string): PlateIssue {
  const raw = normalisePlate(input);
  if (!raw) return {block: 'state', message: 'Vehicle number is required'};

  const p = parsePlate(input);
  if (!p) return {block: 'state', message: 'Not a valid registration number'};

  if (p.state.length < 2) return {block: 'state', message: 'Start with a 2-letter state code'};
  if (!findState(p.state)) return {block: 'state', message: `"${p.state}" is not an Indian state code`};

  if (!p.rto) return {block: 'rto', message: 'Add the RTO number'};
  if (!isValidRto(p.state, p.rto)) return {block: 'rto', message: `RTO ${p.rto} does not exist for ${p.state}`};

  // Series is legitimately absent on older plates, so its only rule is that
  // when present it is 1-3 letters — which the parse already guarantees.
  if (!p.number) return {block: 'number', message: 'Add the 4-digit number'};
  if (p.number.length < 4) return {block: 'number', message: `${p.number.length} of 4 digits`};

  return null;
}

export function isCompletePlate(input: string): boolean {
  return validatePlate(input) === null;
}

/** 2 state + 2 rto + 3 series + 4 number. */
export const MAX_PLATE_CHARS = 11;
