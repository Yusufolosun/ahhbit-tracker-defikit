/**
 * Slippage tolerance calculations.
 */

const BPS_DIVISOR = 10_000n;

function assertToleranceBps(toleranceBps: number): void {
  if (!Number.isInteger(toleranceBps) || toleranceBps < 0 || toleranceBps > 10_000) {
    throw new RangeError(`toleranceBps must be an integer 0–10000, got ${toleranceBps}`);
  }
}

function assertNonNegativeAmount(name: string, amount: bigint): void {
  if (amount < 0n) {
    throw new RangeError(`${name} must be non-negative, got ${amount}`);
  }
}

/**
 * Calculate minimum acceptable output given a slippage tolerance.
 * minOutput = expectedOutput * (10000 - toleranceBps) / 10000
 *
 * Example: minOutput(1_000_000n, 50) → 995_000n (0.5% slippage)
 */
export function minOutput(expectedOutput: bigint, toleranceBps: number): bigint {
  assertNonNegativeAmount('expectedOutput', expectedOutput);
  assertToleranceBps(toleranceBps);
  return (expectedOutput * (BPS_DIVISOR - BigInt(toleranceBps))) / BPS_DIVISOR;
}

/**
 * Calculate maximum acceptable input for a given slippage tolerance.
 * maxInput = expectedInput * (10000 + toleranceBps) / 10000
 */
export function maxInput(expectedInput: bigint, toleranceBps: number): bigint {
  assertNonNegativeAmount('expectedInput', expectedInput);
  assertToleranceBps(toleranceBps);
  return (expectedInput * (BPS_DIVISOR + BigInt(toleranceBps))) / BPS_DIVISOR;
}

/**
 * Check whether the actual output exceeds the slippage tolerance
 * relative to the expected output. Returns true if slippage is excessive.
 */
export function isExcessive(
  expected: bigint,
  actual: bigint,
  toleranceBps: number,
): boolean {
  assertNonNegativeAmount('expected', expected);
  assertNonNegativeAmount('actual', actual);
  assertToleranceBps(toleranceBps);
  if (expected === 0n) return actual === 0n ? false : true;
  const min = minOutput(expected, toleranceBps);
  return actual < min;
}

/**
 * Measure the realized slippage between expected and actual amounts.
 * Returns slippage in basis points (positive = unfavorable).
 *
 * Example: fromAmounts(1_000n, 995n) → 50 (0.5%)
 */
export function fromAmounts(expected: bigint, actual: bigint): number {
  assertNonNegativeAmount('expected', expected);
  assertNonNegativeAmount('actual', actual);
  if (expected === 0n) return 0;
  const diff = expected - actual;
  // Convert to number only at the end for precision
  return Number((diff * BPS_DIVISOR) / expected);
}
