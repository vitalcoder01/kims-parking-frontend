import {scrub, fingerprintOf, buildReport, shouldSend, __resetSessionForTests} from './reporter';

/**
 * The scrubber is the piece worth over-testing.
 *
 * Everything else here fails loudly if it is wrong. A scrubber that misses
 * fails silently, and what it leaks is a patient's phone number sitting in a
 * diagnostics table read by whoever is on triage. These cases are drawn from
 * the shapes this app's errors actually carry.
 */

describe('scrub', () => {
  it('removes an Indian plate in the forms this app produces', () => {
    expect(scrub('Failed to park TS09AB1234')).toBe('Failed to park [plate]');
    expect(scrub('Failed to park TS 09 AB 1234')).toBe('Failed to park [plate]');
    expect(scrub('Failed to park TS-09-AB-1234')).toBe('Failed to park [plate]');
  });

  it('removes mobile numbers with and without country code', () => {
    expect(scrub('notify 9876543210')).toBe('notify [phone]');
    expect(scrub('notify +91 9876543210')).toBe('notify [phone]');
  });

  it('removes emails and bearer tokens', () => {
    expect(scrub('user a.b+c@x.co.in failed')).toBe('user [email] failed');
    expect(scrub('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [token]');
  });

  it('leaves ordinary diagnostic text intact', () => {
    const msg = "Cannot read properties of undefined (reading 'carNumber')";
    expect(scrub(msg)).toBe(msg);
  });

  it('scrubs everything in a realistic mixed error', () => {
    const out = scrub('POST /visitors failed for TS09AB1234 (9876543210)');
    expect(out.includes('TS09AB1234')).toBe(false);
    expect(out.includes('9876543210')).toBe(false);
  });
});

describe('fingerprintOf', () => {
  const stack = 'Error: boom\n    at Lt (ValetRecordsScreen.js:1:6149)\n    at Suspense';

  it('collapses the same fault whose message differs only by numbers', () => {
    const a = fingerprintOf('Error', 'no driver for 5 min', stack, '1.9.17');
    const b = fingerprintOf('Error', 'no driver for 7 min', stack, '1.9.17');
    expect(a).toBe(b);
  });

  it('treats the same fault in a new release as new — it is a regression', () => {
    const a = fingerprintOf('Error', 'boom', stack, '1.9.17');
    const b = fingerprintOf('Error', 'boom', stack, '1.9.18');
    expect(a === b).toBe(false);
  });

  it('separates different faults', () => {
    const a = fingerprintOf('Error', 'boom', stack, '1.9.17');
    const b = fingerprintOf('TypeError', 'boom', stack, '1.9.17');
    expect(a === b).toBe(false);
  });

  it('does not depend on line/column drift within the same frame', () => {
    const a = fingerprintOf('Error', 'boom', 'Error\n    at Lt (X.js:1:6149)', '1.9.17');
    const b = fingerprintOf('Error', 'boom', 'Error\n    at Lt (X.js:1:7003)', '1.9.17');
    expect(a).toBe(b);
  });
});

describe('buildReport', () => {
  it('never carries unscrubbed identifiers out of the device', () => {
    const err = new Error('park TS09AB1234 for 9876543210');
    const r = buildReport(err, {platform: 'android', appVersion: '1.9.17', screen: 'ValetHome'});
    expect(r.message.includes('TS09AB1234')).toBe(false);
    expect(r.message.includes('9876543210')).toBe(false);
    expect(r.screen).toBe('ValetHome');
    expect(r.platform).toBe('android');
  });

  it('accepts a thrown non-Error without exploding', () => {
    const r = buildReport('plain string failure', {platform: 'web', appVersion: '1.0.0'});
    expect(r.name).toBe('Error');
    expect(r.message).toBe('plain string failure');
  });
});

describe('shouldSend', () => {
  it('sends a fault once per session and then stops', () => {
    __resetSessionForTests();
    expect(shouldSend('abc123')).toBe(true);
    expect(shouldSend('abc123')).toBe(false);
    expect(shouldSend('abc123')).toBe(false);
  });

  it('still sends a different fault', () => {
    __resetSessionForTests();
    expect(shouldSend('abc123')).toBe(true);
    expect(shouldSend('def456')).toBe(true);
  });
});
