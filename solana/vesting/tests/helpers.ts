import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vesting } from "../target/types/vesting";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

export const program = anchor.workspace
  .Vesting as Program<Vesting>;

export const TOKEN_PROGRAMS = [
  { name: "Token Program", id: TOKEN_PROGRAM_ID },
  { name: "Token-2022", id: TOKEN_2022_PROGRAM_ID },
];

export interface TestContext {
  authority: Keypair;
  beneficiary: Keypair;
  mint: PublicKey;
  authorityTokenAccount: PublicKey;
  beneficiaryTokenAccount: PublicKey;
  vestingSchedule: PublicKey;
  vault: PublicKey;
  tokenProgramId: PublicKey;
}

/**
 * Creates a full test context: keypairs, mint, token accounts, and derived PDAs.
 */
export async function createTestContext(
  tokenProgramId: PublicKey,
  depositAmount: number = 1_000_000_000
): Promise<TestContext> {
  const authority = Keypair.generate();
  const beneficiary = Keypair.generate();

  await airdrop(authority.publicKey, 10);
  await airdrop(beneficiary.publicKey, 2);

  const mint = await createMint(
    provider.connection,
    authority,
    authority.publicKey,
    null,
    6,
    Keypair.generate(),
    undefined,
    tokenProgramId
  );

  const authorityTokenAccount = await createAccount(
    provider.connection,
    authority,
    mint,
    authority.publicKey,
    Keypair.generate(),
    undefined,
    tokenProgramId
  );

  const beneficiaryTokenAccount = await createAccount(
    provider.connection,
    beneficiary,
    mint,
    beneficiary.publicKey,
    Keypair.generate(),
    undefined,
    tokenProgramId
  );

  await mintTo(
    provider.connection,
    authority,
    mint,
    authorityTokenAccount,
    authority,
    depositAmount,
    [],
    undefined,
    tokenProgramId
  );

  const [vestingSchedule] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting"),
      authority.publicKey.toBuffer(),
      beneficiary.publicKey.toBuffer(),
      mint.toBuffer(),
    ],
    program.programId
  );

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vestingSchedule.toBuffer()],
    program.programId
  );

  return {
    authority,
    beneficiary,
    mint,
    authorityTokenAccount,
    beneficiaryTokenAccount,
    vestingSchedule,
    vault,
    tokenProgramId,
  };
}

export async function airdrop(to: PublicKey, sol: number) {
  const sig = await provider.connection.requestAirdrop(
    to,
    sol * anchor.web3.LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig);
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export async function getTokenBalance(
  account: PublicKey,
  tokenProgramId?: PublicKey
): Promise<number> {
  const info = await getAccount(
    provider.connection,
    account,
    undefined,
    tokenProgramId
  );
  return Number(info.amount);
}
