import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";

export interface TestContext {
  provider: anchor.AnchorProvider;
  connection: anchor.web3.Connection;
  payer: Keypair;
}

/**
 * Uses AnchorProvider.env() (cluster + wallet from Anchor.toml).
 * Call anchor.setProvider(provider) once in the test entry file.
 */
export function setupProvider(): TestContext {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  const payer = wallet.payer;

  return {
    provider,
    connection: provider.connection,
    payer,
  };
}

export function loadProgram<T extends anchor.Idl>(
  name: string
): Program<T> {
  return anchor.workspace[name] as Program<T>;
}
