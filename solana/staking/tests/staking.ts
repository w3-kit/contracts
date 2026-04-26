import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import { expect } from "chai";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Staking as Program<Staking>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const alice = Keypair.generate();
  const bob = Keypair.generate();

  // ---- helpers ----

  function getPoolPda(sMint: PublicKey, rMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), sMint.toBuffer(), rMint.toBuffer()],
      program.programId
    );
  }

  function getUserStakePda(
    pool: PublicKey,
    user: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("user_stake"), pool.toBuffer(), user.toBuffer()],
      program.programId
    );
  }

  async function createTestMints(): Promise<{
    stakingMint: PublicKey;
    rewardMint: PublicKey;
  }> {
    const stakingMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      6
    );
    const rewardMint = await createMint(
      connection,
      payer,
      payer.publicKey,
      null,
      6
    );
    return { stakingMint, rewardMint };
  }

  async function initializePool(
    stakingMint: PublicKey,
    rewardMint: PublicKey
  ): Promise<{ poolPda: PublicKey; stakingVault: PublicKey; rewardVault: PublicKey }> {
    const [poolPda] = getPoolPda(stakingMint, rewardMint);
    const stakingVault = getAssociatedTokenAddressSync(
      stakingMint,
      poolPda,
      true
    );
    const rewardVault = getAssociatedTokenAddressSync(
      rewardMint,
      poolPda,
      true
    );

    await program.methods
      .initialize()
      .accounts({
        authority: payer.publicKey,
        stakingMint,
        rewardMint,
        pool: poolPda,
        stakingVault,
        rewardVault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { poolPda, stakingVault, rewardVault };
  }

  async function setupUser(
    user: Keypair,
    stakingMint: PublicKey,
    rewardMint: PublicKey,
    stakingAmount: number
  ): Promise<{ stakingAta: PublicKey; rewardAta: PublicKey }> {
    const stakingAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        stakingMint,
        user.publicKey
      )
    ).address;
    const rewardAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        rewardMint,
        user.publicKey
      )
    ).address;

    if (stakingAmount > 0) {
      await mintTo(
        connection,
        payer,
        stakingMint,
        stakingAta,
        payer,
        stakingAmount
      );
    }
    return { stakingAta, rewardAta };
  }

  async function stakeTokens(
    user: Keypair,
    amount: BN,
    poolPda: PublicKey,
    stakingVault: PublicKey,
    userStakingAta: PublicKey
  ) {
    const [userStakePda] = getUserStakePda(poolPda, user.publicKey);
    await program.methods
      .stake(amount)
      .accounts({
        user: user.publicKey,
        pool: poolPda,
        userStake: userStakePda,
        userTokenAccount: userStakingAta,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
  }

  async function fundVaultAndConfigure(
    rewardMint: PublicKey,
    rewardVault: PublicKey,
    poolPda: PublicKey,
    rewardAmount: BN,
    duration: BN
  ) {
    await mintTo(
      connection,
      payer,
      rewardMint,
      rewardVault,
      payer,
      rewardAmount.toNumber()
    );
    await program.methods
      .configureReward(rewardAmount, duration)
      .accounts({
        authority: payer.publicKey,
        pool: poolPda,
        rewardVault,
      })
      .rpc();
  }

  async function getTokenBalance(account: PublicKey): Promise<bigint> {
    const info = await getAccount(connection, account);
    return info.amount;
  }

  async function fetchPool(poolPda: PublicKey) {
    return program.account.poolState.fetch(poolPda);
  }

  async function fetchUserStake(userStakePda: PublicKey) {
    return program.account.userStake.fetch(userStakePda);
  }

  // ---- setup ----

  before(async () => {
    const [aliceSig, bobSig] = await Promise.all([
      connection.requestAirdrop(alice.publicKey, 10 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(bob.publicKey, 10 * LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      connection.confirmTransaction(aliceSig),
      connection.confirmTransaction(bobSig),
    ]);
  });

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------
  describe("Initialization", () => {
    let stakingMint: PublicKey;
    let rewardMint: PublicKey;
    let poolPda: PublicKey;
    let stakingVault: PublicKey;
    let rewardVault: PublicKey;

    before(async () => {
      ({ stakingMint, rewardMint } = await createTestMints());
      ({ poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      ));
    });

    it("sets the correct authority", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.authority.toBase58()).to.equal(payer.publicKey.toBase58());
    });

    it("sets the correct staking mint", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.stakingMint.toBase58()).to.equal(stakingMint.toBase58());
    });

    it("sets the correct reward mint", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.rewardMint.toBase58()).to.equal(rewardMint.toBase58());
    });

    it("creates staking and reward vaults", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.stakingVault.toBase58()).to.equal(stakingVault.toBase58());
      expect(pool.rewardVault.toBase58()).to.equal(rewardVault.toBase58());
    });

    it("initializes with zero state", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.rewardRate.toNumber()).to.equal(0);
      expect(pool.totalStaked.toNumber()).to.equal(0);
      expect(pool.periodFinish.toNumber()).to.equal(0);
      expect(pool.rewardPerTokenStored.toNumber()).to.equal(0);
    });

    it("rejects same staking and reward mint", async () => {
      const mint = await createMint(connection, payer, payer.publicKey, null, 6);
      const [samePool] = getPoolPda(mint, mint);
      const vault = getAssociatedTokenAddressSync(mint, samePool, true);

      try {
        await program.methods
          .initialize()
          .accounts({
            authority: payer.publicKey,
            stakingMint: mint,
            rewardMint: mint,
            pool: samePool,
            stakingVault: vault,
            rewardVault: vault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  // ------------------------------------------------------------------
  // Stake
  // ------------------------------------------------------------------
  describe("Stake", () => {
    let stakingMint: PublicKey;
    let rewardMint: PublicKey;
    let poolPda: PublicKey;
    let stakingVault: PublicKey;
    let rewardVault: PublicKey;
    let aliceAta: PublicKey;
    let bobAta: PublicKey;

    before(async () => {
      ({ stakingMint, rewardMint } = await createTestMints());
      ({ poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      ));
      ({ stakingAta: aliceAta } = await setupUser(
        alice,
        stakingMint,
        rewardMint,
        10_000_000
      ));
      ({ stakingAta: bobAta } = await setupUser(
        bob,
        stakingMint,
        rewardMint,
        10_000_000
      ));
    });

    it("stakes tokens and updates user balance", async () => {
      const amount = new BN(100_000);
      await stakeTokens(alice, amount, poolPda, stakingVault, aliceAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const userStake = await fetchUserStake(userStakePda);
      expect(userStake.balance.toNumber()).to.equal(100_000);
    });

    it("transfers tokens from user to vault", async () => {
      const vaultBalance = await getTokenBalance(stakingVault);
      expect(Number(vaultBalance)).to.equal(100_000);
    });

    it("updates total staked on the pool", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.totalStaked.toNumber()).to.equal(100_000);
    });

    it("reverts on zero amount", async () => {
      try {
        await stakeTokens(
          alice,
          new BN(0),
          poolPda,
          stakingVault,
          aliceAta
        );
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("ZeroAmount");
      }
    });

    it("supports multiple users staking", async () => {
      await stakeTokens(bob, new BN(200_000), poolPda, stakingVault, bobAta);

      const pool = await fetchPool(poolPda);
      expect(pool.totalStaked.toNumber()).to.equal(300_000);

      const [bobStakePda] = getUserStakePda(poolPda, bob.publicKey);
      const bobStake = await fetchUserStake(bobStakePda);
      expect(bobStake.balance.toNumber()).to.equal(200_000);
    });

    it("accumulates multiple stakes from the same user", async () => {
      await stakeTokens(alice, new BN(50_000), poolPda, stakingVault, aliceAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const userStake = await fetchUserStake(userStakePda);
      expect(userStake.balance.toNumber()).to.equal(150_000);

      const pool = await fetchPool(poolPda);
      expect(pool.totalStaked.toNumber()).to.equal(350_000);
    });
  });

  // ------------------------------------------------------------------
  // Withdraw
  // ------------------------------------------------------------------
  describe("Withdraw", () => {
    let stakingMint: PublicKey;
    let rewardMint: PublicKey;
    let poolPda: PublicKey;
    let stakingVault: PublicKey;
    let aliceAta: PublicKey;
    let aliceRewardAta: PublicKey;

    before(async () => {
      ({ stakingMint, rewardMint } = await createTestMints());
      ({ poolPda, stakingVault } = await initializePool(stakingMint, rewardMint));
      ({ stakingAta: aliceAta, rewardAta: aliceRewardAta } = await setupUser(
        alice,
        stakingMint,
        rewardMint,
        10_000_000
      ));
      await stakeTokens(alice, new BN(500_000), poolPda, stakingVault, aliceAta);
    });

    it("withdraws tokens and updates balances", async () => {
      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);

      await program.methods
        .withdraw(new BN(200_000))
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          userStake: userStakePda,
          userTokenAccount: aliceAta,
          stakingVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const userStake = await fetchUserStake(userStakePda);
      expect(userStake.balance.toNumber()).to.equal(300_000);
    });

    it("transfers tokens from vault to user", async () => {
      const vaultBalance = await getTokenBalance(stakingVault);
      expect(Number(vaultBalance)).to.equal(300_000);
    });

    it("updates total staked on the pool", async () => {
      const pool = await fetchPool(poolPda);
      expect(pool.totalStaked.toNumber()).to.equal(300_000);
    });

    it("reverts on zero amount", async () => {
      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      try {
        await program.methods
          .withdraw(new BN(0))
          .accounts({
            user: alice.publicKey,
            pool: poolPda,
            userStake: userStakePda,
            userTokenAccount: aliceAta,
            stakingVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([alice])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("ZeroAmount");
      }
    });

    it("reverts when withdrawing more than staked", async () => {
      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      try {
        await program.methods
          .withdraw(new BN(999_999_999))
          .accounts({
            user: alice.publicKey,
            pool: poolPda,
            userStake: userStakePda,
            userTokenAccount: aliceAta,
            stakingVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([alice])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("InsufficientStake");
      }
    });

    it("supports partial withdrawals leaving remaining balance", async () => {
      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);

      await program.methods
        .withdraw(new BN(100_000))
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          userStake: userStakePda,
          userTokenAccount: aliceAta,
          stakingVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const userStake = await fetchUserStake(userStakePda);
      expect(userStake.balance.toNumber()).to.equal(200_000);

      const pool = await fetchPool(poolPda);
      expect(pool.totalStaked.toNumber()).to.equal(200_000);
    });
  });

  // ------------------------------------------------------------------
  // Configure Reward
  // ------------------------------------------------------------------
  describe("Configure Reward", () => {
    let stakingMint: PublicKey;
    let rewardMint: PublicKey;
    let poolPda: PublicKey;
    let rewardVault: PublicKey;

    before(async () => {
      ({ stakingMint, rewardMint } = await createTestMints());
      ({ poolPda, rewardVault } = await initializePool(stakingMint, rewardMint));
      await mintTo(connection, payer, rewardMint, rewardVault, payer, 10_000_000);
    });

    it("reverts for non-authority", async () => {
      try {
        await program.methods
          .configureReward(new BN(100_000), new BN(50))
          .accounts({
            authority: alice.publicKey,
            pool: poolPda,
            rewardVault,
          })
          .signers([alice])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("Unauthorized");
      }
    });

    it("reverts on zero duration", async () => {
      try {
        await program.methods
          .configureReward(new BN(100_000), new BN(0))
          .accounts({
            authority: payer.publicKey,
            pool: poolPda,
            rewardVault,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("ZeroDuration");
      }
    });

    it("reverts on insufficient vault balance", async () => {
      try {
        await program.methods
          .configureReward(new BN(999_999_999_999), new BN(100))
          .accounts({
            authority: payer.publicKey,
            pool: poolPda,
            rewardVault,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("InsufficientRewardBalance");
      }
    });

    it("configures reward period", async () => {
      await program.methods
        .configureReward(new BN(1_000_000), new BN(1000))
        .accounts({
          authority: payer.publicKey,
          pool: poolPda,
          rewardVault,
        })
        .rpc();

      const pool = await fetchPool(poolPda);
      expect(pool.rewardRate.toNumber()).to.equal(1_000); // 1_000_000 / 1000
    });

    it("reverts when period not finished", async () => {
      try {
        await program.methods
          .configureReward(new BN(100_000), new BN(50))
          .accounts({
            authority: payer.publicKey,
            pool: poolPda,
            rewardVault,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("RewardPeriodNotFinished");
      }
    });
  });

  // ------------------------------------------------------------------
  // Reward Accrual
  // ------------------------------------------------------------------
  describe("Reward Accrual", () => {
    it("accrues rewards over time for a single staker", async () => {
      const { stakingMint, rewardMint } = await createTestMints();
      const { poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      );
      const { stakingAta } = await setupUser(alice, stakingMint, rewardMint, 10_000_000);

      await stakeTokens(alice, new BN(100_000), poolPda, stakingVault, stakingAta);
      await fundVaultAndConfigure(rewardMint, rewardVault, poolPda, new BN(1_000_000), new BN(10));

      // Wait ~5 seconds (half the period)
      await sleep(5000);

      // Trigger reward update by staking a tiny amount
      await mintTo(connection, payer, stakingMint, stakingAta, payer, 1);
      await stakeTokens(alice, new BN(1), poolPda, stakingVault, stakingAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const userStake = await fetchUserStake(userStakePda);
      const earned = userStake.rewardsEarned.toNumber();

      // Should have earned roughly half the rewards (with tolerance)
      expect(earned).to.be.greaterThan(300_000);
      expect(earned).to.be.lessThan(700_000);
    });

    it("distributes full reward amount over the entire period", async () => {
      const { stakingMint, rewardMint } = await createTestMints();
      const { poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      );
      const { stakingAta } = await setupUser(alice, stakingMint, rewardMint, 10_000_000);

      await stakeTokens(alice, new BN(100_000), poolPda, stakingVault, stakingAta);
      await fundVaultAndConfigure(rewardMint, rewardVault, poolPda, new BN(1_000_000), new BN(5));

      // Wait for full period + buffer
      await sleep(7000);

      // Trigger update
      await mintTo(connection, payer, stakingMint, stakingAta, payer, 1);
      await stakeTokens(alice, new BN(1), poolPda, stakingVault, stakingAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const userStake = await fetchUserStake(userStakePda);
      const earned = userStake.rewardsEarned.toNumber();

      // Due to integer division: rate = 1_000_000 / 5 = 200_000/s
      // Over 5 seconds: 200_000 * 5 = 1_000_000
      // Allow tolerance for rounding
      expect(earned).to.be.greaterThan(900_000);
      expect(earned).to.be.lessThan(1_100_000);
    });

    it("splits rewards proportionally between stakers", async () => {
      const { stakingMint, rewardMint } = await createTestMints();
      const { poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      );
      const { stakingAta: aliceAta } = await setupUser(
        alice,
        stakingMint,
        rewardMint,
        10_000_000
      );
      const { stakingAta: bobAta } = await setupUser(
        bob,
        stakingMint,
        rewardMint,
        10_000_000
      );

      // Alice and Bob stake equal amounts
      await stakeTokens(alice, new BN(100_000), poolPda, stakingVault, aliceAta);
      await stakeTokens(bob, new BN(100_000), poolPda, stakingVault, bobAta);

      await fundVaultAndConfigure(rewardMint, rewardVault, poolPda, new BN(1_000_000), new BN(5));

      // Wait for full period
      await sleep(7000);

      // Trigger updates for both
      await mintTo(connection, payer, stakingMint, aliceAta, payer, 1);
      await stakeTokens(alice, new BN(1), poolPda, stakingVault, aliceAta);
      await mintTo(connection, payer, stakingMint, bobAta, payer, 1);
      await stakeTokens(bob, new BN(1), poolPda, stakingVault, bobAta);

      const [aliceStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const [bobStakePda] = getUserStakePda(poolPda, bob.publicKey);

      const aliceEarned = (await fetchUserStake(aliceStakePda)).rewardsEarned.toNumber();
      const bobEarned = (await fetchUserStake(bobStakePda)).rewardsEarned.toNumber();

      // Each should get ~50% of rewards
      expect(aliceEarned).to.be.greaterThan(400_000);
      expect(aliceEarned).to.be.lessThan(600_000);
      expect(bobEarned).to.be.greaterThan(400_000);
      expect(bobEarned).to.be.lessThan(600_000);

      // Together they should get ~100% of total
      const total = aliceEarned + bobEarned;
      expect(total).to.be.greaterThan(900_000);
      expect(total).to.be.lessThan(1_100_000);
    });

    it("stops accruing after period ends", async () => {
      const { stakingMint, rewardMint } = await createTestMints();
      const { poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      );
      const { stakingAta } = await setupUser(alice, stakingMint, rewardMint, 10_000_000);

      await stakeTokens(alice, new BN(100_000), poolPda, stakingVault, stakingAta);
      await fundVaultAndConfigure(rewardMint, rewardVault, poolPda, new BN(1_000_000), new BN(3));

      // Wait well past the period end
      await sleep(5000);

      // Trigger first update
      await mintTo(connection, payer, stakingMint, stakingAta, payer, 1);
      await stakeTokens(alice, new BN(1), poolPda, stakingVault, stakingAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const earned1 = (await fetchUserStake(userStakePda)).rewardsEarned.toNumber();

      // Wait more time
      await sleep(3000);

      // Trigger second update
      await mintTo(connection, payer, stakingMint, stakingAta, payer, 1);
      await stakeTokens(alice, new BN(1), poolPda, stakingVault, stakingAta);

      const earned2 = (await fetchUserStake(userStakePda)).rewardsEarned.toNumber();

      // Rewards should not have increased after period ended
      expect(earned2).to.equal(earned1);
    });

    it("handles zero total staked (no rewards leak)", async () => {
      const { stakingMint, rewardMint } = await createTestMints();
      const { poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      );

      // Configure rewards with no one staked
      await fundVaultAndConfigure(rewardMint, rewardVault, poolPda, new BN(1_000_000), new BN(3));

      // Wait for period to pass
      await sleep(5000);

      // Now stake — should not get retroactive rewards
      const { stakingAta } = await setupUser(alice, stakingMint, rewardMint, 10_000_000);
      await stakeTokens(alice, new BN(100_000), poolPda, stakingVault, stakingAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const userStake = await fetchUserStake(userStakePda);

      expect(userStake.rewardsEarned.toNumber()).to.equal(0);
    });
  });

  // ------------------------------------------------------------------
  // Claim Reward
  // ------------------------------------------------------------------
  describe("Claim Reward", () => {
    let stakingMint: PublicKey;
    let rewardMint: PublicKey;
    let poolPda: PublicKey;
    let stakingVault: PublicKey;
    let rewardVault: PublicKey;
    let aliceStakingAta: PublicKey;
    let aliceRewardAta: PublicKey;

    before(async () => {
      ({ stakingMint, rewardMint } = await createTestMints());
      ({ poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      ));
      ({ stakingAta: aliceStakingAta, rewardAta: aliceRewardAta } =
        await setupUser(alice, stakingMint, rewardMint, 10_000_000));
      await stakeTokens(
        alice,
        new BN(100_000),
        poolPda,
        stakingVault,
        aliceStakingAta
      );
      await fundVaultAndConfigure(
        rewardMint,
        rewardVault,
        poolPda,
        new BN(1_000_000),
        new BN(3)
      );

      // Wait for period to finish
      await sleep(5000);
    });

    it("transfers reward tokens to user", async () => {
      const rewardBefore = await getTokenBalance(aliceRewardAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      await program.methods
        .claimReward()
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          userStake: userStakePda,
          userRewardAccount: aliceRewardAta,
          rewardVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const rewardAfter = await getTokenBalance(aliceRewardAta);
      const claimed = Number(rewardAfter) - Number(rewardBefore);

      // Should have claimed ~full reward (sole staker for full period)
      expect(claimed).to.be.greaterThan(900_000);
      expect(claimed).to.be.lessThan(1_100_000);
    });

    it("resets rewards earned to zero after claiming", async () => {
      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      const userStake = await fetchUserStake(userStakePda);
      expect(userStake.rewardsEarned.toNumber()).to.equal(0);
    });

    it("is a no-op when no rewards earned", async () => {
      const rewardBefore = await getTokenBalance(aliceRewardAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      await program.methods
        .claimReward()
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          userStake: userStakePda,
          userRewardAccount: aliceRewardAta,
          rewardVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const rewardAfter = await getTokenBalance(aliceRewardAta);
      expect(Number(rewardAfter)).to.equal(Number(rewardBefore));
    });
  });

  // ------------------------------------------------------------------
  // Exit
  // ------------------------------------------------------------------
  describe("Exit", () => {
    let stakingMint: PublicKey;
    let rewardMint: PublicKey;
    let poolPda: PublicKey;
    let stakingVault: PublicKey;
    let rewardVault: PublicKey;
    let aliceStakingAta: PublicKey;
    let aliceRewardAta: PublicKey;

    before(async () => {
      ({ stakingMint, rewardMint } = await createTestMints());
      ({ poolPda, stakingVault, rewardVault } = await initializePool(
        stakingMint,
        rewardMint
      ));
      ({ stakingAta: aliceStakingAta, rewardAta: aliceRewardAta } =
        await setupUser(alice, stakingMint, rewardMint, 10_000_000));
      await stakeTokens(
        alice,
        new BN(100_000),
        poolPda,
        stakingVault,
        aliceStakingAta
      );
      await fundVaultAndConfigure(
        rewardMint,
        rewardVault,
        poolPda,
        new BN(1_000_000),
        new BN(3)
      );

      // Wait for period to finish
      await sleep(5000);
    });

    it("withdraws all staked tokens and claims rewards in one transaction", async () => {
      const stakingBefore = await getTokenBalance(aliceStakingAta);
      const rewardBefore = await getTokenBalance(aliceRewardAta);

      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      await program.methods
        .exit()
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          userStake: userStakePda,
          userStakingAccount: aliceStakingAta,
          userRewardAccount: aliceRewardAta,
          stakingVault,
          rewardVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const stakingAfter = await getTokenBalance(aliceStakingAta);
      const rewardAfter = await getTokenBalance(aliceRewardAta);

      // Should have received back staked tokens
      const stakingReceived = Number(stakingAfter) - Number(stakingBefore);
      expect(stakingReceived).to.equal(100_000);

      // Should have received rewards
      const rewardReceived = Number(rewardAfter) - Number(rewardBefore);
      expect(rewardReceived).to.be.greaterThan(900_000);

      // User stake should be zeroed
      const userStake = await fetchUserStake(userStakePda);
      expect(userStake.balance.toNumber()).to.equal(0);
      expect(userStake.rewardsEarned.toNumber()).to.equal(0);

      // Pool total staked should be zero
      const pool = await fetchPool(poolPda);
      expect(pool.totalStaked.toNumber()).to.equal(0);
    });

    it("reverts when nothing is staked", async () => {
      const [userStakePda] = getUserStakePda(poolPda, alice.publicKey);
      try {
        await program.methods
          .exit()
          .accounts({
            user: alice.publicKey,
            pool: poolPda,
            userStake: userStakePda,
            userStakingAccount: aliceStakingAta,
            userRewardAccount: aliceRewardAta,
            stakingVault,
            rewardVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([alice])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.contain("NothingStaked");
      }
    });
  });

  // ------------------------------------------------------------------
  // Re-configure after period ends
  // ------------------------------------------------------------------
  describe("Re-configure Reward", () => {
    it("allows re-configuring after the reward period ends", async () => {
      const { stakingMint, rewardMint } = await createTestMints();
      const { poolPda, rewardVault } = await initializePool(stakingMint, rewardMint);

      await mintTo(connection, payer, rewardMint, rewardVault, payer, 10_000_000);

      // Configure with a short period
      await program.methods
        .configureReward(new BN(500_000), new BN(2))
        .accounts({
          authority: payer.publicKey,
          pool: poolPda,
          rewardVault,
        })
        .rpc();

      // Wait for period to end
      await sleep(4000);

      // Should succeed
      await program.methods
        .configureReward(new BN(300_000), new BN(5))
        .accounts({
          authority: payer.publicKey,
          pool: poolPda,
          rewardVault,
        })
        .rpc();

      const pool = await fetchPool(poolPda);
      expect(pool.rewardRate.toNumber()).to.equal(60_000); // 300_000 / 5
    });
  });
});
