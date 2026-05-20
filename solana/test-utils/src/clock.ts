import { Connection } from "@solana/web3.js";

export interface ChainClock {
  slot: number;
  unixTimestamp: number;
}

/**
 * Reads the current slot and block time from the cluster.
 * Useful for assertions around time-based program logic.
 */
export async function getChainClock(
  connection: Connection
): Promise<ChainClock> {
  const slot = await connection.getSlot("confirmed");
  const unixTimestamp = (await connection.getBlockTime(slot)) ?? 0;
  return { slot, unixTimestamp };
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for real time to pass on the local validator.
 *
 * Programs that read Clock::get() cannot warp unix time on the default
 * anchor test validator. Keep reward periods short in tests, or use a
 * Bankrun / LiteSVM setup for deterministic clock control (see docs/testing-solana.md).
 */
export async function waitSeconds(seconds: number): Promise<void> {
  await sleepMs(seconds * 1000);
}

/**
 * Scale wait duration in CI via ANCHOR_TEST_TIME_SCALE (e.g. 0.5 halves waits).
 * Defaults to 1.
 */
export function scaledWaitMs(baseMs: number): number {
  const raw = process.env.ANCHOR_TEST_TIME_SCALE;
  if (!raw) {
    return baseMs;
  }
  const scale = Number.parseFloat(raw);
  if (!Number.isFinite(scale) || scale <= 0) {
    return baseMs;
  }
  return Math.max(100, Math.floor(baseMs * scale));
}

export async function waitScaledSeconds(seconds: number): Promise<void> {
  await sleepMs(scaledWaitMs(seconds * 1000));
}
