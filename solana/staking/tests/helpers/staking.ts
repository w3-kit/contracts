import { PublicKey } from "@solana/web3.js";
import { findPda, type PdaResult } from "@w3-kit/solana-test-utils";

export function findPoolPda(
  programId: PublicKey,
  stakingMint: PublicKey,
  rewardMint: PublicKey
): PdaResult {
  return findPda(programId, [
    "pool",
    stakingMint.toBuffer(),
    rewardMint.toBuffer(),
  ]);
}

export function findUserStakePda(
  programId: PublicKey,
  pool: PublicKey,
  user: PublicKey
): PdaResult {
  return findPda(programId, [
    "user_stake",
    pool.toBuffer(),
    user.toBuffer(),
  ]);
}
