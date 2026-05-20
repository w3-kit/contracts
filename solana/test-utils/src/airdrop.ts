import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const DEFAULT_SOL = 10;

/**
 * Funds one or more keypairs via requestAirdrop on localnet / devnet.
 */
export async function fundKeypairs(
  connection: Connection,
  keypairs: Keypair[],
  solAmount = DEFAULT_SOL
): Promise<void> {
  const lamports = solAmount * LAMPORTS_PER_SOL;

  const signatures = await Promise.all(
    keypairs.map((kp) => connection.requestAirdrop(kp.publicKey, lamports))
  );

  await Promise.all(
    signatures.map((sig) => connection.confirmTransaction(sig, "confirmed"))
  );
}
