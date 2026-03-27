/**
 * Protocol fee calculations.
 * Supports fee-on-input, fee-on-output, and tiered fee schedules.
 */

export interface FeeResult {
  /** Fee amount */
  fee: bigint;
  /** Amount after fee deduction */
  net: bigint;
}

export interface GrossFeeResult {
  /** Fee amount */
  fee: bigint;
  /** Total amount including fee */
  gross: bigint;
}

export interface FeeTier {
  /** Upper bound of this tier (exclusive). Use 0n for unlimited. */
  threshold: bigint;
  /** Fee rate in basis points for this tier */
  bps: number;
}

const BPS_DIVISOR = 10_000n;

function assertNonNegativeAmount(name: string, amount: bigint): void {
  if (amount < 0n) {
    throw new RangeError(`${name} must be non-negative, got ${amount}`);
  }
}

function assertBps(name: string, bps: number, max: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > max) {
    throw new RangeError(`${name} must be an integer 0–${max}, got ${bps}`);
  }
}

/**
 * Fee-on-input: fee is deducted from the input amount.
 * net = amount - fee, where fee = floor(amount * bps / 10000)
 *
 * Example: onInput(1_000_000n, 30) → { fee: 3_000n, net: 997_000n }
 */
export function onInput(amount: bigint, bps: number): FeeResult {
  assertNonNegativeAmount('amount', amount);
  assertBps('bps', bps, 10_000);
  const fee = (amount * BigInt(bps)) / BPS_DIVISOR;
  return { fee, net: amount - fee };
}

/**
 * Fee-on-output: determines the gross amount a user must provide
 * so that after fee deduction, `amount` remains.
 * gross = ceil(amount * 10000 / (10000 - bps))
 *
 * Example: onOutput(997_000n, 30) → { fee: 3_000n, gross: 1_000_000n }
 */
export function onOutput(amount: bigint, bps: number): GrossFeeResult {
  assertNonNegativeAmount('amount', amount);
  assertBps('bps', bps, 9_999);
  const denom = BPS_DIVISOR - BigInt(bps);
  // ceiling division: (a + b - 1) / b
  const gross = (amount * BPS_DIVISOR + denom - 1n) / denom;
  const fee = gross - amount;
  return { fee, gross };
}

/**
 * Tiered fee schedule. Each tier defines a bps rate up to a threshold.
 * Amounts are split across tiers and each portion is charged its tier's rate.
 *
 * Tiers must be sorted by threshold ascending. The last tier's threshold
 * should be 0n (meaning unlimited / catch-all).
 *
 * Example:
 *   tiered(1_500_000n, [
 *     { threshold: 1_000_000n, bps: 50 },
 *     { threshold: 0n, bps: 30 },
 *   ])
 *   → first 1M charged at 50 bps, remaining 500K charged at 30 bps
 */
export function tiered(amount: bigint, tiers: FeeTier[]): FeeResult {
  if (!tiers.length) {
    throw new Error('At least one fee tier is required');
  }
  assertNonNegativeAmount('amount', amount);

  let prevThreshold = 0n;
  let hasUnlimitedTier = false;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    assertBps(`tiers[${i}].bps`, tier.bps, 10_000);
    if (tier.threshold < 0n) {
      throw new RangeError(`tiers[${i}].threshold must be non-negative, got ${tier.threshold}`);
    }

    if (tier.threshold === 0n) {
      if (i !== tiers.length - 1) {
        throw new RangeError('Unlimited tier (threshold 0n) must be the last tier');
      }
      hasUnlimitedTier = true;
      continue;
    }

    if (tier.threshold <= prevThreshold) {
      throw new RangeError('Tier thresholds must be strictly increasing, with 0n only as final catch-all');
    }
    prevThreshold = tier.threshold;
  }

  let remaining = amount;
  let totalFee = 0n;
  let prev = 0n;

  for (const tier of tiers) {
    if (remaining <= 0n) break;

    const isUnlimited = tier.threshold === 0n;
    const tierSize = isUnlimited ? remaining : tier.threshold - prev;
    const taxable = remaining < tierSize ? remaining : tierSize;

    totalFee += (taxable * BigInt(tier.bps)) / BPS_DIVISOR;
    remaining -= taxable;
    prev = tier.threshold;
  }

  if (remaining > 0n && !hasUnlimitedTier) {
    throw new RangeError('Tier schedule must include a final threshold of 0n to cover all amounts');
  }

  return { fee: totalFee, net: amount - totalFee };
}
