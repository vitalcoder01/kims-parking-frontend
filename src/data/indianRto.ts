// Indian state / union-territory registration codes and their RTO ranges.
//
// Ships with the app. No network, no API key, no government service — plate
// validation has to work at a valet desk with no signal, and it has to work
// the same on every phone.
//
// RTO codes are stored as a MAXIMUM rather than an enumerated list. Two
// reasons: the enumerated form is thousands of entries for no extra accuracy,
// and — more importantly — new RTOs are created faster than an app ships.
// Being generous at the top of a range means an unusual-but-real plate is
// accepted; enumerating exactly means a brand-new district's plate is
// rejected at the desk, which is far worse than letting a wrong one through.
// Validation here is a typo-catcher, not an authority on what exists.

export interface StateEntry {
  code: string;
  name: string;
  /** Highest RTO number in use, give or take. See note above. */
  maxRto: number;
}

export const INDIAN_STATES: StateEntry[] = [
  {code: 'AN', name: 'Andaman & Nicobar', maxRto: 1},
  {code: 'AP', name: 'Andhra Pradesh', maxRto: 40},
  {code: 'AR', name: 'Arunachal Pradesh', maxRto: 22},
  {code: 'AS', name: 'Assam', maxRto: 33},
  {code: 'BR', name: 'Bihar', maxRto: 56},
  {code: 'CG', name: 'Chhattisgarh', maxRto: 30},
  {code: 'CH', name: 'Chandigarh', maxRto: 4},
  {code: 'DD', name: 'Daman & Diu', maxRto: 3},
  {code: 'DL', name: 'Delhi', maxRto: 20},
  {code: 'DN', name: 'Dadra & Nagar Haveli', maxRto: 9},
  {code: 'GA', name: 'Goa', maxRto: 12},
  {code: 'GJ', name: 'Gujarat', maxRto: 39},
  {code: 'HP', name: 'Himachal Pradesh', maxRto: 99},
  {code: 'HR', name: 'Haryana', maxRto: 99},
  {code: 'JH', name: 'Jharkhand', maxRto: 24},
  {code: 'JK', name: 'Jammu & Kashmir', maxRto: 22},
  {code: 'KA', name: 'Karnataka', maxRto: 71},
  {code: 'KL', name: 'Kerala', maxRto: 99},
  {code: 'LA', name: 'Ladakh', maxRto: 2},
  {code: 'LD', name: 'Lakshadweep', maxRto: 9},
  {code: 'MH', name: 'Maharashtra', maxRto: 50},
  {code: 'ML', name: 'Meghalaya', maxRto: 10},
  {code: 'MN', name: 'Manipur', maxRto: 7},
  {code: 'MP', name: 'Madhya Pradesh', maxRto: 70},
  {code: 'MZ', name: 'Mizoram', maxRto: 8},
  {code: 'NL', name: 'Nagaland', maxRto: 10},
  {code: 'OD', name: 'Odisha', maxRto: 35},
  {code: 'OR', name: 'Odisha (old series)', maxRto: 35},
  {code: 'PB', name: 'Punjab', maxRto: 99},
  {code: 'PY', name: 'Puducherry', maxRto: 5},
  {code: 'RJ', name: 'Rajasthan', maxRto: 58},
  {code: 'SK', name: 'Sikkim', maxRto: 8},
  {code: 'TN', name: 'Tamil Nadu', maxRto: 99},
  {code: 'TR', name: 'Tripura', maxRto: 8},
  {code: 'TS', name: 'Telangana', maxRto: 38},
  {code: 'UK', name: 'Uttarakhand', maxRto: 20},
  {code: 'UA', name: 'Uttarakhand (old series)', maxRto: 20},
  {code: 'UP', name: 'Uttar Pradesh', maxRto: 96},
  {code: 'WB', name: 'West Bengal', maxRto: 98},
];

const BY_CODE = new Map(INDIAN_STATES.map(s => [s.code, s]));

export function findState(code: string): StateEntry | undefined {
  return BY_CODE.get((code ?? '').toUpperCase());
}

/** State codes beginning with the letters typed so far. */
export function statesStartingWith(prefix: string): StateEntry[] {
  const p = (prefix ?? '').toUpperCase();
  if (!p) return [];
  return INDIAN_STATES.filter(s => s.code.startsWith(p));
}

// RTO numbers on an Indian plate are always exactly 2 digits (01-99), so
// that's the one true ceiling — not each state's own maxRto above. Real
// plates were being rejected with maxRto as the bound: RTOs are created
// faster than this file gets updated, and several states' numbers here
// were already stale (Karnataka capped at 71, Maharashtra at 50, etc.) —
// exactly the "unusual-but-real plate rejected" failure the file's own
// top comment says is far worse than being too generous. maxRto stays on
// StateEntry for documentation/display, it just no longer gates validation.
const MAX_RTO_NUMBER = 99;

/** Is this a real RTO number for this state? */
export function isValidRto(stateCode: string, rto: string): boolean {
  const st = findState(stateCode);
  if (!st) return false;
  const n = Number(rto);
  return Number.isInteger(n) && n >= 1 && n <= MAX_RTO_NUMBER;
}

/**
 * RTO numbers for a state that begin with the digits typed so far.
 *
 * Zero-padded to two digits, which is how they appear on a plate — "AP 9" is
 * not a thing, "AP 09" is.
 */
export function rtosStartingWith(stateCode: string, digits: string, limit = 8): string[] {
  const st = findState(stateCode);
  if (!st) return [];
  const d = (digits ?? '').replace(/\D/g, '');
  const out: string[] = [];
  for (let i = 1; i <= MAX_RTO_NUMBER && out.length < limit; i++) {
    const padded = String(i).padStart(2, '0');
    if (!d || padded.startsWith(d)) out.push(padded);
  }
  return out;
}
