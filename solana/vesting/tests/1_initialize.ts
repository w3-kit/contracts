import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  program,
  TOKEN_PROGRAMS,
  createTestContext,
  now,
} from "./helpers";

describe("initialize", () => {
  TOKEN_PROGRAMS.forEach(({ name, id: tokenProgramId }) => {
    describe(`[${name}]`, () => {
      it("creates a vesting schedule with valid params", async () => {
        const ctx = await createTestContext(tokenProgramId);
        const startTime = now() + 60;
        const duration = 3600;
        const cliffDuration = 600;

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

        // Verify state
        const schedule = await program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.authority.toBase58()).to.equal(
          ctx.authority.publicKey.toBase58()
        );
        expect(schedule.beneficiary.toBase58()).to.equal(
          ctx.beneficiary.publicKey.toBase58()
        );
        expect(schedule.mint.toBase58()).to.equal(ctx.mint.toBase58());
        expect(schedule.startTime.toNumber()).to.equal(startTime);
        expect(schedule.duration.toNumber()).to.equal(duration);
        expect(schedule.cliffDuration.toNumber()).to.equal(cliffDuration);
        expect(schedule.totalDeposited.toNumber()).to.equal(0);
        expect(schedule.releasedAmount.toNumber()).to.equal(0);
        expect(schedule.revocable).to.equal(true);
        expect(schedule.revoked).to.equal(false);
      });

      it("allows start_time in the past (retroactive vesting)", async () => {
        const ctx = await createTestContext(tokenProgramId);
        const startTime = now() - 1800;

        await program.methods
          .initialize(
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

        const schedule = await program.account.vestingSchedule.fetch(
          ctx.vestingSchedule
        );
        expect(schedule.startTime.toNumber()).to.equal(startTime);
        expect(schedule.revocable).to.equal(false);
      });

      it("rejects start_time = 0", async () => {
        const ctx = await createTestContext(tokenProgramId);

        try {
          await program.methods
            .initialize(
              new anchor.BN(0),
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
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("InvalidStartTime");
        }
      });

      it("rejects duration = 0", async () => {
        const ctx = await createTestContext(tokenProgramId);

        try {
          await program.methods
            .initialize(
              new anchor.BN(now() + 60),
              new anchor.BN(0),
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
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("InvalidDuration");
        }
      });

      it("rejects cliff_duration > duration", async () => {
        const ctx = await createTestContext(tokenProgramId);

        try {
          await program.methods
            .initialize(
              new anchor.BN(now() + 60),
              new anchor.BN(3600),
              new anchor.BN(7200),
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
          expect.fail("should have thrown");
        } catch (err: any) {
          expect(err.error.errorCode.code).to.equal("InvalidCliffDuration");
        }
      });
    });
  });
});
