/*
 * Runs the co-pilot specs without jest.
 *
 * jest.config.js points at @react-native/jest-preset, which is not installed
 * in this checkout — `npx jest` fails to resolve the preset before it runs a
 * single test. The specs themselves are plain describe/it/expect over pure
 * functions with no React or native imports, so they need none of that
 * machinery. This supplies the three globals they use and runs them under
 * tsx.
 *
 * Delete this the day jest actually runs here; until then a test nobody can
 * execute is worth nothing.
 *
 *     npx tsx scripts/run-copilot-tests.ts
 */
let pass = 0, fail = 0, suite = '';
(globalThis as any).describe = (n: string, f: () => void) => { suite = n; console.log(`\n${n}`); f(); };
(globalThis as any).it = (n: string, f: () => void) => {
  try { f(); pass++; console.log(`  PASS  ${n}`); }
  catch (e: any) { fail++; console.log(`  FAIL  ${n}\n        ${e.message}`); }
};
(globalThis as any).expect = (got: unknown) => ({
  toEqual(want: unknown) {
    const a = JSON.stringify(got), b = JSON.stringify(want);
    if (a !== b) throw new Error(`got ${a}, want ${b}`);
  },
  toBe(want: unknown) {
    if (got !== want) throw new Error(`got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  },
});
Promise.all([
  import('../src/core/copilot/insights.test'),
  import('../src/core/copilot/reporter.test'),
]).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
