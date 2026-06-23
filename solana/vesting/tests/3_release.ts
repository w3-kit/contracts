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

describe("release", () => {
  TOKEN_PROGRAMS.forEach(({ name, id: tokenProgramId }) => {
    describe(`[${name}]`, () => {
      /**
       * Helper: initialize + deposit with configurable schedule.
       */
      async function setupVesting(opts: {
        startOffset?: number;
        duration?: number;
        cliffDuration?: number;
        depositAmount?: number;
      }): Promise<TestContext> {
        const ctx = await createTestContext(
          tokenProgramId,
          opts.depositAmount ?? 1_000_000
        );
        const startTime = now() + (opts.startOffset ?? -1);
        const duration = opts.duration ?? 10;
        const cliffDuration = opts.cliffDuration ?? 0;

        await program.methods
          .initialize(
            new anchor.BN(startTime),
            new anchor.BN(duration),
            new anchor.BN(cliffDuration),
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

        await program.methods
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

      it("releases partial tokens after some vesting time", async () => {
        const ctx = await setupVesting({
          startOffset: -5,
          duration: 10,
          cliffDuration: 0,
          depositAmount: 1_000_000,
        });

        await program.methods
          .release()
          .accountsPartial({
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.beneficiary])
          .rpc();

        const balance = await getTokenBalance(
          ctx.beneficiaryTokenAccount,
          tokenProgramId
        );
        // ~50% vested (±20% tolerance due to block time)
        expect(balance).to.be.greaterThan(300_000);
        expect(balance).to.be.lessThan(800_000);

        // Verify state updated
        const schedule = await program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.releasedAmount.toNumber()).to.equal(balance);
      });

      it("releases all tokens after vesting ends", async () => {
        const ctx = await setupVesting({
          startOffset: -20,
          duration: 10,
          cliffDuration: 0,
          depositAmount: 1_000_000,
        });

        await program.methods
          .release()
          .accountsPartial({
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.beneficiary])
          .rpc();

        const balance = await getTokenBalance(
          ctx.beneficiaryTokenAccount,
          tokenProgramId
        );
        expect(balance).to.equal(1_000_000);
      });

      it("respects cliff — nothing releasable before cliff ends", async () => {
        const ctx = await setupVesting({
          startOffset: -2,
          duration: 10,
          cliffDuration: 5,
          depositAmount: 1_000_000,
        });

        try {
          await program.methods
            .release()
            .accountsPartial({
              beneficiary: ctx.beneficiary.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.beneficiary])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("NothingToRelease");
        }
      });

      it("releases tokens after cliff passes", async () => {
        const ctx = await setupVesting({
          startOffset: -8,
          duration: 10,
          cliffDuration: 5,
          depositAmount: 1_000_000,
        });

        await program.methods
          .release()
          .accountsPartial({
            beneficiary: ctx.beneficiary.publicKey,
            vestingSchedule: ctx.vestingSchedule,
            mint: ctx.mint,
            beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
            vault: ctx.vault,
            tokenProgram: tokenProgramId,
          })
          .signers([ctx.beneficiary])
          .rpc();

        const balance = await getTokenBalance(
          ctx.beneficiaryTokenAccount,
          tokenProgramId
        );
        expect(balance).to.be.greaterThan(600_000);
        expect(balance).to.be.lessThanOrEqual(1_000_000);
      });

      it("rejects release before vesting starts", async () => {
        const ctx = await setupVesting({
          startOffset: 60,
          duration: 3600,
          cliffDuration: 0,
          depositAmount: 1_000_000,
        });

        try {
          await program.methods
            .release()
            .accountsPartial({
              beneficiary: ctx.beneficiary.publicKey,
              vestingSchedule: ctx.vestingSchedule,
              mint: ctx.mint,
              beneficiaryTokenAccount: ctx.beneficiaryTokenAccount,
              vault: ctx.vault,
              tokenProgram: tokenProgramId,
            })
            .signers([ctx.beneficiary])
            .rpc();
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("NothingToRelease");
        }
      });
    });
  });
});
