import { PublicKey } from "@solana/web3.js";

export type PdaResult = [PublicKey, number];

/**
 * Derives a program address from seed segments (strings or buffers).
 */
export function findPda(
  programId: PublicKey,
  seeds: Array<string | Buffer | Uint8Array>
): PdaResult {
  const buffers = seeds.map((seed) =>
    typeof seed === "string" ? Buffer.from(seed) : Buffer.from(seed)
  );
  return PublicKey.findProgramAddressSync(buffers, programId);
}
