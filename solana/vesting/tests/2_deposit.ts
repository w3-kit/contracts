import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  program,
  TOKEN_PROGRAMS,
  createTestContext,
  now,
  getTokenBalance,
  TestContext,
} from "./helpers";

describe("deposit", () => {
  TOKEN_PROGRAMS.forEach(({ name, id: tokenProgramId }) => {
    describe(`[${name}]`, () => {
      let ctx: TestContext;

      beforeEach(async () => {
        ctx = await createTestContext(tokenProgramId);

        // Initialize the schedule first
        await program.methods
          .initialize(
            new anchor.BN(now() + 60),
            new anchor.BN(3600),
            new anchor.BN(600),
            true
          )
          .accountsPartial({
            authority: ctx.authority.publicKey,
            beneficiary: ctx.beneficiary.publicKey,
            mint: ctx.mint,
            vestingSchedule: ctx.vestingSchedule,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();
      });

      it("deposits tokens into the vault", async () => {
        const depositAmount = 500_000_000;

        await program.methods
          .deposit(new anchor.BN(depositAmount))
          .accountsPartial({
            depositor: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            depositorTokenAccount: ctx.authorityTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        // Verify vault balance
        const vaultBalance = await getTokenBalance(ctx.vault, tokenProgramId);
        expect(vaultBalance).to.equal(depositAmount);

        // Verify state
        const schedule = await program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.totalDeposited.toNumber()).to.equal(depositAmount);
      });

      it("allows multiple deposits", async () => {
        const first = 300_000_000;
        const second = 200_000_000;

        await program.methods
          .deposit(new anchor.BN(first))
          .accountsPartial({
            depositor: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            depositorTokenAccount: ctx.authorityTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        await program.methods
          .deposit(new anchor.BN(second))
          .accountsPartial({
            depositor: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            depositorTokenAccount: ctx.authorityTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const schedule = await program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.totalDeposited.toNumber()).to.equal(first + second);

        const vaultBalance = await getTokenBalance(ctx.vault, tokenProgramId);
        expect(vaultBalance).to.equal(first + second);
      });

      it("rejects deposit of 0 amount", async () => {
        try {
          await program.methods
            .deposit(new anchor.BN(0))
            .accountsPartial({
              depositor: ctx.authority.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              depositorTokenAccount: ctx.authorityTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.authority])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("InvalidDepositAmount");
        }
      });
    });
  });
});
