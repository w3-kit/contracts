import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Staking, TokenERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Staking", function () {
  let staking: Staking;
  let stakingToken: TokenERC20;
  let rewardToken: TokenERC20;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const REWARD_AMOUNT = ethers.parseEther("10000");
  const REWARD_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
  const STAKE_AMOUNT = ethers.parseEther("1000");

  async function deployTokens() {
    const Token = await ethers.getContractFactory("TokenERC20");
    const sToken = await Token.deploy(
      owner.address,
      "StakeToken",
      "STK",
      ethers.parseEther("10000000"),
    );
    const rToken = await Token.deploy(
      owner.address,
      "RewardToken",
      "RWD",
      ethers.parseEther("10000000"),
    );
    return { sToken, rToken };
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const { sToken, rToken } = await deployTokens();
    stakingToken = sToken;
    rewardToken = rToken;

    const Staking = await ethers.getContractFactory("Staking");
    staking = await Staking.deploy(
      owner.address,
      await stakingToken.getAddress(),
      await rewardToken.getAddress(),
    );

    // Distribute staking tokens to users
    await stakingToken.mint(alice.address, ethers.parseEther("100000"));
    await stakingToken.mint(bob.address, ethers.parseEther("100000"));

    // Approve staking contract
    await stakingToken
      .connect(alice)
      .approve(await staking.getAddress(), ethers.MaxUint256);
    await stakingToken
      .connect(bob)
      .approve(await staking.getAddress(), ethers.MaxUint256);
  });

  async function fundAndConfigureReward() {
    // Mint rewards to owner, transfer to staking contract, then configure
    await rewardToken.mint(owner.address, REWARD_AMOUNT);
    await rewardToken.transfer(await staking.getAddress(), REWARD_AMOUNT);
    await staking.configureReward(REWARD_AMOUNT, REWARD_DURATION);
  }

  // ---------------------------------------------------------------
  //  Deployment
  // ---------------------------------------------------------------

  describe("Deployment", function () {
    it("should set the correct staking token", async function () {
      expect(await staking.stakingToken()).to.equal(
        await stakingToken.getAddress(),
      );
    });

    it("should set the correct reward token", async function () {
      expect(await staking.rewardToken()).to.equal(
        await rewardToken.getAddress(),
      );
    });

    it("should set the correct owner", async function () {
      expect(await staking.owner()).to.equal(owner.address);
    });

    it("should start with zero total staked", async function () {
      expect(await staking.totalStaked()).to.equal(0);
    });

    it("should revert if staking token is zero address", async function () {
      const Staking = await ethers.getContractFactory("Staking");
      await expect(
        Staking.deploy(
          owner.address,
          ethers.ZeroAddress,
          await rewardToken.getAddress(),
        ),
      ).to.be.revertedWithCustomError(Staking, "ZeroAddress");
    });

    it("should revert if reward token is zero address", async function () {
      const Staking = await ethers.getContractFactory("Staking");
      await expect(
        Staking.deploy(
          owner.address,
          await stakingToken.getAddress(),
          ethers.ZeroAddress,
        ),
      ).to.be.revertedWithCustomError(Staking, "ZeroAddress");
    });
  });

  // ---------------------------------------------------------------
  //  Staking
  // ---------------------------------------------------------------

  describe("Stake", function () {
    it("should allow a user to stake tokens", async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
      expect(await staking.balanceOf(alice.address)).to.equal(STAKE_AMOUNT);
      expect(await staking.totalStaked()).to.equal(STAKE_AMOUNT);
    });

    it("should transfer tokens from user to contract", async function () {
      const balanceBefore = await stakingToken.balanceOf(alice.address);
      await staking.connect(alice).stake(STAKE_AMOUNT);
      const balanceAfter = await stakingToken.balanceOf(alice.address);
      expect(balanceBefore - balanceAfter).to.equal(STAKE_AMOUNT);
    });

    it("should emit Staked event", async function () {
      await expect(staking.connect(alice).stake(STAKE_AMOUNT))
        .to.emit(staking, "Staked")
        .withArgs(alice.address, STAKE_AMOUNT);
    });

    it("should revert if staking zero", async function () {
      await expect(
        staking.connect(alice).stake(0),
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    it("should allow multiple users to stake", async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await staking.connect(bob).stake(STAKE_AMOUNT * 2n);
      expect(await staking.totalStaked()).to.equal(STAKE_AMOUNT * 3n);
      expect(await staking.balanceOf(alice.address)).to.equal(STAKE_AMOUNT);
      expect(await staking.balanceOf(bob.address)).to.equal(STAKE_AMOUNT * 2n);
    });

    it("should allow a user to stake multiple times", async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await staking.connect(alice).stake(STAKE_AMOUNT);
      expect(await staking.balanceOf(alice.address)).to.equal(
        STAKE_AMOUNT * 2n,
      );
    });
  });

  // ---------------------------------------------------------------
  //  Withdrawal
  // ---------------------------------------------------------------

  describe("Withdraw", function () {
    beforeEach(async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
    });

    it("should allow a user to withdraw", async function () {
      await staking.connect(alice).withdraw(STAKE_AMOUNT);
      expect(await staking.balanceOf(alice.address)).to.equal(0);
      expect(await staking.totalStaked()).to.equal(0);
    });

    it("should transfer tokens back to user", async function () {
      const balanceBefore = await stakingToken.balanceOf(alice.address);
      await staking.connect(alice).withdraw(STAKE_AMOUNT);
      const balanceAfter = await stakingToken.balanceOf(alice.address);
      expect(balanceAfter - balanceBefore).to.equal(STAKE_AMOUNT);
    });

    it("should emit Withdrawn event", async function () {
      await expect(staking.connect(alice).withdraw(STAKE_AMOUNT))
        .to.emit(staking, "Withdrawn")
        .withArgs(alice.address, STAKE_AMOUNT);
    });

    it("should revert if withdrawing zero", async function () {
      await expect(
        staking.connect(alice).withdraw(0),
      ).to.be.revertedWithCustomError(staking, "ZeroAmount");
    });

    it("should revert if user has nothing staked", async function () {
      await expect(
        staking.connect(bob).withdraw(STAKE_AMOUNT),
      ).to.be.revertedWithCustomError(staking, "InsufficientStake");
    });

    it("should revert if withdrawing more than staked", async function () {
      await expect(
        staking.connect(alice).withdraw(STAKE_AMOUNT * 2n),
      ).to.be.revertedWithCustomError(staking, "InsufficientStake");
    });

    it("should allow partial withdrawal", async function () {
      const half = STAKE_AMOUNT / 2n;
      await staking.connect(alice).withdraw(half);
      expect(await staking.balanceOf(alice.address)).to.equal(half);
    });
  });

  // ---------------------------------------------------------------
  //  Reward Configuration
  // ---------------------------------------------------------------

  describe("Configure Reward", function () {
    it("should allow owner to configure rewards", async function () {
      await rewardToken.mint(owner.address, REWARD_AMOUNT);
      await rewardToken.transfer(await staking.getAddress(), REWARD_AMOUNT);
      await staking.configureReward(REWARD_AMOUNT, REWARD_DURATION);
      expect(await staking.rewardRate()).to.equal(
        REWARD_AMOUNT / BigInt(REWARD_DURATION),
      );
    });

    it("should emit RewardConfigured event", async function () {
      await rewardToken.mint(owner.address, REWARD_AMOUNT);
      await rewardToken.transfer(await staking.getAddress(), REWARD_AMOUNT);
      await expect(staking.configureReward(REWARD_AMOUNT, REWARD_DURATION))
        .to.emit(staking, "RewardConfigured")
        .withArgs(REWARD_AMOUNT, REWARD_DURATION);
    });

    it("should revert if non-owner configures", async function () {
      await expect(
        staking.connect(alice).configureReward(REWARD_AMOUNT, REWARD_DURATION),
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });

    it("should revert if duration is zero", async function () {
      await expect(
        staking.configureReward(REWARD_AMOUNT, 0),
      ).to.be.revertedWithCustomError(staking, "ZeroDuration");
    });

    it("should revert if contract has insufficient reward balance", async function () {
      await expect(
        staking.configureReward(REWARD_AMOUNT, REWARD_DURATION),
      ).to.be.revertedWithCustomError(staking, "InsufficientRewardBalance");
    });

    it("should revert if previous reward period has not finished", async function () {
      await fundAndConfigureReward();
      await rewardToken.mint(owner.address, REWARD_AMOUNT);
      await rewardToken.transfer(await staking.getAddress(), REWARD_AMOUNT);
      await expect(
        staking.configureReward(REWARD_AMOUNT, REWARD_DURATION),
      ).to.be.revertedWithCustomError(staking, "RewardPeriodNotFinished");
    });

    it("should allow re-configuring after period ends", async function () {
      await fundAndConfigureReward();
      await time.increase(REWARD_DURATION);

      await rewardToken.mint(owner.address, REWARD_AMOUNT);
      await rewardToken.transfer(await staking.getAddress(), REWARD_AMOUNT);
      await expect(
        staking.configureReward(REWARD_AMOUNT, REWARD_DURATION),
      ).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------
  //  Reward Accrual
  // ---------------------------------------------------------------

  describe("Reward Accrual", function () {
    beforeEach(async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await fundAndConfigureReward();
    });

    it("should accrue rewards over time for a single staker", async function () {
      await time.increase(REWARD_DURATION / 2);
      const earned = await staking.earned(alice.address);
      const expectedApprox = REWARD_AMOUNT / 2n;
      // Allow 0.1% tolerance for block timing
      expect(earned).to.be.closeTo(expectedApprox, expectedApprox / 1000n);
    });

    it("should distribute full rewards after the period ends", async function () {
      await time.increase(REWARD_DURATION);
      const earned = await staking.earned(alice.address);
      // rewardRate truncation may lose a few wei
      const maxReward =
        (REWARD_AMOUNT / BigInt(REWARD_DURATION)) * BigInt(REWARD_DURATION);
      expect(earned).to.be.closeTo(maxReward, maxReward / 1000n);
    });

    it("should split rewards proportionally between stakers", async function () {
      // Bob stakes the same amount as Alice
      await staking.connect(bob).stake(STAKE_AMOUNT);
      await time.increase(REWARD_DURATION);

      const earnedAlice = await staking.earned(alice.address);
      const earnedBob = await staking.earned(bob.address);

      // Alice was staking before Bob joined in the same block, so they
      // should have roughly equal rewards (Bob joined almost instantly)
      expect(earnedAlice).to.be.closeTo(earnedBob, earnedAlice / 100n);
    });

    it("should stop accruing after the reward period ends", async function () {
      await time.increase(REWARD_DURATION);
      const earnedAtEnd = await staking.earned(alice.address);
      await time.increase(REWARD_DURATION); // double the time
      const earnedLater = await staking.earned(alice.address);
      expect(earnedAtEnd).to.equal(earnedLater);
    });

    it("should return zero earned for a user with no stake", async function () {
      expect(await staking.earned(bob.address)).to.equal(0);
    });
  });

  // ---------------------------------------------------------------
  //  Claim Reward
  // ---------------------------------------------------------------

  describe("Claim Reward", function () {
    beforeEach(async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await fundAndConfigureReward();
    });

    it("should transfer reward tokens to user", async function () {
      await time.increase(REWARD_DURATION);
      const earned = await staking.earned(alice.address);
      await staking.connect(alice).claimReward();
      const balance = await rewardToken.balanceOf(alice.address);
      expect(balance).to.be.closeTo(earned, earned / 1000n);
    });

    it("should emit RewardClaimed event", async function () {
      await time.increase(REWARD_DURATION);
      const earned = await staking.earned(alice.address);
      await expect(staking.connect(alice).claimReward())
        .to.emit(staking, "RewardClaimed")
        .withArgs(alice.address, earned);
    });

    it("should reset pending rewards to zero after claim", async function () {
      await time.increase(REWARD_DURATION);
      await staking.connect(alice).claimReward();
      // Small amount may accrue in the claim block itself
      expect(await staking.earned(alice.address)).to.be.lessThan(
        ethers.parseEther("1"),
      );
    });

    it("should not transfer anything if no rewards earned", async function () {
      // Bob never staked
      const balanceBefore = await rewardToken.balanceOf(bob.address);
      await staking.connect(bob).claimReward();
      const balanceAfter = await rewardToken.balanceOf(bob.address);
      expect(balanceAfter).to.equal(balanceBefore);
    });
  });

  // ---------------------------------------------------------------
  //  Exit
  // ---------------------------------------------------------------

  describe("Exit", function () {
    beforeEach(async function () {
      await staking.connect(alice).stake(STAKE_AMOUNT);
      await fundAndConfigureReward();
    });

    it("should withdraw full stake and claim rewards", async function () {
      await time.increase(REWARD_DURATION);
      const earned = await staking.earned(alice.address);
      await staking.connect(alice).exit();

      expect(await staking.balanceOf(alice.address)).to.equal(0);
      expect(await staking.totalStaked()).to.equal(0);
      const rewardBalance = await rewardToken.balanceOf(alice.address);
      expect(rewardBalance).to.be.closeTo(earned, earned / 1000n);
    });

    it("should revert if user has nothing staked", async function () {
      await expect(
        staking.connect(bob).exit(),
      ).to.be.revertedWithCustomError(staking, "NothingStaked");
    });
  });

  // ---------------------------------------------------------------
  //  Views
  // ---------------------------------------------------------------

  describe("Views", function () {
    it("should return zero rewardPerToken when nothing is staked", async function () {
      await fundAndConfigureReward();
      expect(await staking.rewardPerToken()).to.equal(0);
    });

    it("lastTimeRewardApplicable should return periodFinish after period ends", async function () {
      await fundAndConfigureReward();
      const periodFinish = await staking.periodFinish();
      await time.increase(REWARD_DURATION * 2);
      expect(await staking.lastTimeRewardApplicable()).to.equal(periodFinish);
    });
  });

  // ---------------------------------------------------------------
  //  Ownership
  // ---------------------------------------------------------------

  describe("Ownership", function () {
    it("should allow owner to transfer ownership", async function () {
      await staking.transferOwnership(alice.address);
      expect(await staking.owner()).to.equal(alice.address);
    });

    it("should revert if non-owner transfers ownership", async function () {
      await expect(
        staking.connect(alice).transferOwnership(bob.address),
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });
});
