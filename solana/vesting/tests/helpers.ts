import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vesting } from "../target/types/vesting";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { ProgramTestContext, Clock } from "solana-bankrun";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  MINT_SIZE,
  ACCOUNT_SIZE,
  createInitializeMintInstruction,
  createInitializeAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

const IDL = require("../target/idl/vesting.json");
export const PROGRAM_ID = new PublicKey(IDL.address);

export const TOKEN_PROGRAMS = [
  { name: "Token Program", id: TOKEN_PROGRAM_ID },
  { name: "Token-2022", id: TOKEN_2022_PROGRAM_ID },
];

export interface TestContext {
  context: ProgramTestContext;
  provider: BankrunProvider;
  program: Program<Vesting>;
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
 * Warp the bankrun clock to a specific unix timestamp.
 */
export async function warpTo(ctx: ProgramTestContext, unixTimestamp: number) {
  const clock = await ctx.banksClient.getClock();
  ctx.setClock(
    new Clock(
      clock.slot + 1n,
      BigInt(unixTimestamp),
      clock.epoch,
      clock.leaderScheduleEpoch,
      BigInt(unixTimestamp)
    )
  );
}

/**
 * Creates a full test context using bankrun: keypairs, mint, token accounts, and derived PDAs.
 */
export async function createTestContext(
  tokenProgramId: PublicKey,
  depositAmount: number = 1_000_000_000,
  scheduleId: number = 0
): Promise<TestContext> {
  const context = await startAnchor(".", [], []);
  const provider = new BankrunProvider(context);
  anchor.setProvider(provider as unknown as anchor.AnchorProvider);

  const program = new Program<Vesting>(IDL, provider as unknown as anchor.AnchorProvider);

  const authority = Keypair.generate();
  const beneficiary = Keypair.generate();
  const payer = context.payer;

  // Fund authority and beneficiary
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: authority.publicKey,
      lamports: 10_000_000_000,
    }),
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: beneficiary.publicKey,
      lamports: 2_000_000_000,
    })
  );
  await provider.sendAndConfirm!(fundTx, [payer]);

  // Create mint via raw instructions
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const mintLamports = 10_000_000; // enough for rent

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: mintLamports,
      programId: tokenProgramId,
    }),
    createInitializeMintInstruction(
      mint,
      6,
      authority.publicKey,
      null,
      tokenProgramId
    )
  );
  await provider.sendAndConfirm!(createMintTx, [authority, mintKeypair]);

  // Create authority token account
  const authorityTokenKeypair = Keypair.generate();
  const authorityTokenAccount = authorityTokenKeypair.publicKey;
  const createAuthAtaTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: authorityTokenAccount,
      space: ACCOUNT_SIZE,
      lamports: mintLamports,
      programId: tokenProgramId,
    }),
    createInitializeAccountInstruction(
      authorityTokenAccount,
      mint,
      authority.publicKey,
      tokenProgramId
    )
  );
  await provider.sendAndConfirm!(createAuthAtaTx, [authority, authorityTokenKeypair]);

  // Create beneficiary token account
  const beneficiaryTokenKeypair = Keypair.generate();
  const beneficiaryTokenAccount = beneficiaryTokenKeypair.publicKey;
  const createBenefAtaTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: beneficiary.publicKey,
      newAccountPubkey: beneficiaryTokenAccount,
      space: ACCOUNT_SIZE,
      lamports: mintLamports,
      programId: tokenProgramId,
    }),
    createInitializeAccountInstruction(
      beneficiaryTokenAccount,
      mint,
      beneficiary.publicKey,
      tokenProgramId
    )
  );
  await provider.sendAndConfirm!(createBenefAtaTx, [beneficiary, beneficiaryTokenKeypair]);

  // Mint tokens to authority token account
  const mintToTx = new Transaction().add(
    createMintToInstruction(
      mint,
      authorityTokenAccount,
      authority.publicKey,
      depositAmount,
      [],
      tokenProgramId
    )
  );
  await provider.sendAndConfirm!(mintToTx, [authority]);

  // Derive PDAs
  const scheduleIdBuffer = Buffer.alloc(8);
  scheduleIdBuffer.writeBigUInt64LE(BigInt(scheduleId));

  const [vestingSchedule] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vesting"),
      authority.publicKey.toBuffer(),
      beneficiary.publicKey.toBuffer(),
      mint.toBuffer(),
      scheduleIdBuffer,
    ],
    PROGRAM_ID
  );

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vestingSchedule.toBuffer()],
    PROGRAM_ID
  );

  return {
    context,
    provider,
    program,
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

/**
 * Get token balance via bankrun.
 */
export async function getTokenBalance(
  context: ProgramTestContext,
  account: PublicKey
): Promise<number> {
  const accInfo = await context.banksClient.getAccount(account);
  if (!accInfo) return 0;
  // Token account layout: offset 64 = amount (u64 LE)
  const data = Buffer.from(accInfo.data);
  const amount = data.readBigUInt64LE(64);
  return Number(amount);
}
