import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  TOKEN_PROGRAMS,
  createTestContext,
  getTokenBalance,
  warpTo,
  TestContext,
} from "./helpers";

describe("release", () => {
  TOKEN_PROGRAMS.forEach(({ name, id: tokenProgramId }) => {
    describe(`[${name}]`, () => {
      /**
       * Helper: initialize + deposit with configurable schedule using deterministic clock.
       */
      async function setupVesting(opts: {
        startTime: number;
        duration: number;
        cliffDuration?: number;
        depositAmount?: number;
        initClockAt?: number;
      }): Promise<TestContext> {
        const ctx = await createTestContext(
          tokenProgramId,
          opts.depositAmount ?? 1_000_000
        );

        // Set clock to a known time for initialization
        await warpTo(ctx.context, opts.initClockAt ?? opts.startTime - 1);

        await ctx.program.methods
          .initialize(
            new anchor.BN(0),
            new anchor.BN(opts.startTime),
            new anchor.BN(opts.duration),
            new anchor.BN(opts.cliffDuration ?? 0),
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

      it("releases exact 50% tokens at midpoint", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupVesting({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        // Warp to exactly midpoint: start + 50
        await warpTo(ctx.context, startTime + 50);

        await ctx.program.methods
          .release()
          .accountsPartial({
            payer: ctx.authority.publicKey,
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const balance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );
        // Exactly 50% vested: 1_000_000 * 50 / 100 = 500_000
        expect(balance).to.equal(500_000);

        // Verify state updated
        const schedule = await ctx.program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.releasedAmount.toNumber()).to.equal(500_000);
      });

      it("releases all tokens after vesting ends", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupVesting({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        // Warp past the end
        await warpTo(ctx.context, startTime + duration + 1);

        await ctx.program.methods
          .release()
          .accountsPartial({
            payer: ctx.authority.publicKey,
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const balance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );
        expect(balance).to.equal(1_000_000);
      });

      it("respects cliff — nothing releasable before cliff ends", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const cliffDuration = 50;
        const ctx = await setupVesting({
          startTime,
          duration,
          cliffDuration,
          depositAmount: 1_000_000,
        });

        // Warp to just before cliff ends: start + 49
        await warpTo(ctx.context, startTime + 49);

        try {
          await ctx.program.methods
            .release()
            .accountsPartial({
              payer: ctx.authority.publicKey,
              beneficiary: ctx.beneficiary.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.authority])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("NothingToRelease");
        }
      });

      it("releases correct amount after cliff passes", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const cliffDuration = 50;
        const ctx = await setupVesting({
          startTime,
          duration,
          cliffDuration,
          depositAmount: 1_000_000,
        });

        // Warp to start + 80 (past cliff, 80% vested)
        await warpTo(ctx.context, startTime + 80);

        await ctx.program.methods
          .release()
          .accountsPartial({
            payer: ctx.authority.publicKey,
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        const balance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );
        // 1_000_000 * 80 / 100 = 800_000
        expect(balance).to.equal(800_000);
      });

      it("allows third-party to crank release (permissionless)", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupVesting({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        // Warp past end
        await warpTo(ctx.context, startTime + duration + 1);

        // Authority (not beneficiary) cranks the release
        await ctx.program.methods
          .release()
          .accountsPartial({
            payer: ctx.authority.publicKey,
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.authority])
          .rpc();

        // Tokens still go to beneficiary
        const balance = await getTokenBalance(
          ctx.context,
          ctx.beneficiaryTokenAccount
        );
        expect(balance).to.equal(1_000_000);
      });

      it("rejects release after schedule is revoked", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await createTestContext(tokenProgramId, 1_000_000);

        await warpTo(ctx.context, startTime - 1);

        await ctx.program.methods
          .initialize(
            new anchor.BN(0),
            new anchor.BN(startTime),
            new anchor.BN(duration),
            new anchor.BN(0),
            true // revocable
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

        // Warp to midpoint, then revoke
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

        // Attempt to release after revocation should fail
        try {
          await ctx.program.methods
            .release()
            .accountsPartial({
              payer: ctx.authority.publicKey,
              beneficiary: ctx.beneficiary.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
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

      it("rejects release before vesting starts", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupVesting({
          startTime,
          duration,
          depositAmount: 1_000_000,
          initClockAt: startTime - 10,
        });

        // Clock stays before start
        await warpTo(ctx.context, startTime - 5);

        try {
          await ctx.program.methods
            .release()
            .accountsPartial({
              payer: ctx.authority.publicKey,
              beneficiary: ctx.beneficiary.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.authority])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("NothingToRelease");
        }
      });
      it("rejects release to attacker token account (owner mismatch)", async () => {
        const startTime = 1_700_000_000;
        const duration = 100;
        const ctx = await setupVesting({
          startTime,
          duration,
          depositAmount: 1_000_000,
        });

        // Warp past end so tokens are fully vested
        await warpTo(ctx.context, startTime + duration + 1);

        // Attacker tries to redirect release to their own token account
        // ctx.authorityTokenAccount is owned by authority, NOT beneficiary
        try {
          await ctx.program.methods
            .release()
            .accountsPartial({
              payer: ctx.authority.publicKey,
              beneficiary: ctx.beneficiary.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              beneficiaryTokenAccount: ctx.authorityTokenAccount, // attacker's account!
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.authority])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          // Constraint violation: owner != beneficiary
          expect(err.error.errorCode.code).to.equal("InvalidBeneficiaryOwner");
        }
      });
    });
  });
});
