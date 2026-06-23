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

describe("revoke", () => {
  TOKEN_PROGRAMS.forEach(({ name, id: tokenProgramId }) => {
    describe(`[${name}]`, () => {
      /**
       * Helper: initialize (revocable) + deposit.
       */
      async function setupRevocable(opts: {
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

      it("revokes and splits tokens correctly (partial vesting)", async () => {
        const ctx = await setupRevocable({
          startOffset: -5,
          duration: 10,
          cliffDuration: 0,
          depositAmount: 1_000_000,
        });

        const authorityBefore = await getTokenBalance(
          ctx.authorityTokenAccount,
          tokenProgramId
        );

        await program.methods
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
          ctx.beneficiaryTokenAccount,
          tokenProgramId
        );
        const authorityAfter = await getTokenBalance(
          ctx.authorityTokenAccount,
          tokenProgramId
        );
        const authorityReceived = authorityAfter - authorityBefore;

        // Total should equal deposit
        expect(beneficiaryBalance + authorityReceived).to.equal(1_000_000);
        expect(beneficiaryBalance).to.be.greaterThan(300_000);
        expect(beneficiaryBalance).to.be.lessThan(800_000);

        // Verify state
        const schedule = await program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.revoked).to.equal(true);
      });

      it("revokes before vesting starts — all tokens to authority", async () => {
        const ctx = await setupRevocable({
          startOffset: 60,
          duration: 3600,
          cliffDuration: 0,
          depositAmount: 1_000_000,
        });

        const authorityBefore = await getTokenBalance(
          ctx.authorityTokenAccount,
          tokenProgramId
        );

        await program.methods
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
          ctx.authorityTokenAccount,
          tokenProgramId
        );
        const beneficiaryBalance = await getTokenBalance(
          ctx.beneficiaryTokenAccount,
          tokenProgramId
        );

        expect(authorityAfter - authorityBefore).to.equal(1_000_000);
        expect(beneficiaryBalance).to.equal(0);
      });

      it("revokes after vesting ends — all tokens to beneficiary", async () => {
        const ctx = await setupRevocable({
          startOffset: -20,
          duration: 10,
          cliffDuration: 0,
          depositAmount: 1_000_000,
        });

        const authorityBefore = await getTokenBalance(
          ctx.authorityTokenAccount,
          tokenProgramId
        );

        await program.methods
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
          ctx.authorityTokenAccount,
          tokenProgramId
        );
        const beneficiaryBalance = await getTokenBalance(
          ctx.beneficiaryTokenAccount,
          tokenProgramId
        );

        expect(beneficiaryBalance).to.equal(1_000_000);
        expect(authorityAfter - authorityBefore).to.equal(0);
      });

      it("rejects revoke on non-revocable schedule", async () => {
        const ctx = await createTestContext(tokenProgramId, 1_000_000);

        await program.methods
          .initialize(
            new anchor.BN(now() + 60),
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

        await program.methods
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
          await program.methods
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
        const ctx = await setupRevocable({
          startOffset: 60,
          duration: 3600,
          depositAmount: 1_000_000,
        });

        // First revoke succeeds
        await program.methods
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
          await program.methods
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
