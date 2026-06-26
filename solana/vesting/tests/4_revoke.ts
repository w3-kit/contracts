import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  TOKEN_PROGRAMS,
  createTestContext,
  getTokenBalance,
  warpTo,
  TestContext,
} from "./helpers";

describe("revoke", () => {
  TOKEN_PROGRAMS.forEach(({ name, id: tokenProgramId }) => {
    describe(`[${name}]`, () => {
      /**
       * Helper: initialize (revocable) + deposit with deterministic clock.
       */
      async function setupRevocable(opts: {
        startTime: number;
        duration: number;
        cliffDuration?: number;
        depositAmount?: number;
      }): Promise<TestContext> {
        const ctx = await createTestContext(
          tokenProgramId,
          opts.depositAmount ?? 1_000_000
        );

        await warpTo(ctx.context, opts.startTime - 1);

        await ctx.program.methods
          .initialize(
            new anchor.BN(0),
            new anchor.BN(opts.startTime),
            new anchor.BN(opts.duration),
            new anchor.BN(opts.cliffDuration ?? 0),
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

        await ctx.program.methods
          .deposit(new anchor.BN(opts.depositAmount ?? 1_000_000))
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

        return ctx;
      }

      it("revokes at midpoint — splits tokens exactly 50/50", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupRevocable({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        const authorityBefore = await getTokenBalance(
          ctx.context,
          ctx.authorityTokenAccount
        );

        // Warp to exactly midpoint
        await warpTo(ctx.context, startTime + 50);

        await ctx.program.methods
          .revoke()
          .accountsPartial({
            authority: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            authorityTokenAccount: ctx.authorityTokenAccount,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const beneficiaryBalance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );
        const authorityAfter = await getTokenBalance(
          ctx.context,
          ctx.authorityTokenAccount
        );
        const authorityReceived = authorityAfter - authorityBefore;

        // Exactly 50% to beneficiary, 50% back to authority
        expect(beneficiaryBalance).to.equal(500_000);
        expect(authorityReceived).to.equal(500_000);

        // Verify state
        const schedule = await ctx.program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.revoked).to.equal(true);
      });

      it("revokes before vesting starts — all tokens to authority", async () => {
        const startTime = 1_700_000_000;
        const duration = 3600;
        const ctx = await setupRevocable({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        const authorityBefore = await getTokenBalance(
          ctx.context,
          ctx.authorityTokenAccount
        );

        // Clock is still before start
        await warpTo(ctx.context, startTime - 1);

        await ctx.program.methods
          .revoke()
          .accountsPartial({
            authority: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            authorityTokenAccount: ctx.authorityTokenAccount,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const authorityAfter = await getTokenBalance(
          ctx.context,
          ctx.authorityTokenAccount
        );
        const beneficiaryBalance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );

        expect(authorityAfter - authorityBefore).to.equal(1_000_000);
        expect(beneficiaryBalance).to.equal(0);
      });

      it("revokes after vesting ends — all tokens to beneficiary", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupRevocable({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        const authorityBefore = await getTokenBalance(
          ctx.context,
          ctx.authorityTokenAccount
        );

        // Warp past end
        await warpTo(ctx.context, startTime + duration + 1);

        await ctx.program.methods
          .revoke()
          .accountsPartial({
            authority: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            authorityTokenAccount: ctx.authorityTokenAccount,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const authorityAfter = await getTokenBalance(
          ctx.context,
          ctx.authorityTokenAccount
        );
        const beneficiaryBalance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );

        expect(beneficiaryBalance).to.equal(1_000_000);
        expect(authorityAfter - authorityBefore).to.equal(0);
      });

      it("rejects revoke on non-revocable schedule", async () => {
        const ctx = await createTestContext(tokenProgramId, 1_000_000);
        const startTime = 1_700_000_000;

        await warpTo(ctx.context, startTime - 1);

        await ctx.program.methods
          .initialize(
            new anchor.BN(0),
            new anchor.BN(startTime),
            new anchor.BN(3600),
            new anchor.BN(0),
            false
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

        await ctx.program.methods
          .deposit(new anchor.BN(1_000_000))
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

        try {
          await ctx.program.methods
            .revoke()
            .accountsPartial({
              authority: ctx.authority.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              authorityTokenAccount: ctx.authorityTokenAccount,
              beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.authority])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("NotRevocable");
        }
      });

      it("rejects double revoke", async () => {
        const startTime = 1_700_000_000;
        const duration = 3600;
        const ctx = await setupRevocable({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        await warpTo(ctx.context, startTime - 1);

        // First revoke succeeds
        await ctx.program.methods
          .revoke()
          .accountsPartial({
            authority: ctx.authority.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            authorityTokenAccount: ctx.authorityTokenAccount,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        // Second revoke fails
        try {
          await ctx.program.methods
            .revoke()
            .accountsPartial({
              authority: ctx.authority.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              authorityTokenAccount: ctx.authorityTokenAccount,
              beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.authority])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("AlreadyRevoked");
        }
      });
    });
  });
});
