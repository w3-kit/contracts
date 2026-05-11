import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenERC20 } from "../typechain-types";
import { SUBSCRIPTION } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SUBSCRIPTION", function () {
  let subscription: SUBSCRIPTION;
  let token: TokenERC20;

  let Owner: HardhatEthersSigner;
  let Authority: HardhatEthersSigner;
  let Merchant1: HardhatEthersSigner;
  let Merchant2: HardhatEthersSigner;
  let Subscriber1: HardhatEthersSigner;
  let Subscriber2: HardhatEthersSigner;

  const NAME = "MyToken";
  const SYMBOL = "MTK";
  const MAX_SUPPLY = ethers.parseEther("1000000");

  const PLAN_NAME = "Basic Plan";
  const PLAN_DURATION = 30; // 30 days
  const PLAN_PRICE = ethers.parseEther("10");

  beforeEach(async function () {
    [Owner, Authority, Merchant1, Merchant2, Subscriber1, Subscriber2] =
      await ethers.getSigners();

    const Token = await ethers.getContractFactory("TokenERC20");
    token = (await Token.deploy(
      Owner.address,
      NAME,
      SYMBOL,
      MAX_SUPPLY,
    )) as TokenERC20;

    const Subscription = await ethers.getContractFactory("SUBSCRIPTION");
    subscription = (await Subscription.deploy(
      Authority.address,
      Owner.address,
      token.target,
    )) as SUBSCRIPTION;

    // Mint tokens to subscribers so they can pay for subscriptions
    await token.mint(Subscriber1.address, ethers.parseEther("1000"));
    await token.mint(Subscriber2.address, ethers.parseEther("1000"));

    // Subscribers approve the subscription contract to spend their tokens
    await token
      .connect(Subscriber1)
      .approve(subscription.target, ethers.parseEther("1000"));
    await token
      .connect(Subscriber2)
      .approve(subscription.target, ethers.parseEther("1000"));
  });

  // Register Merchant Tests

  describe("registerMerchant", function () {
    it("should revert if non owner tries to register a merchant", async function () {
      await expect(
        subscription.connect(Merchant1).registerMerchant(Merchant1.address),
      ).to.be.revertedWithCustomError(subscription, "NotOwner");
    });

    it("should revert if merchant address is zero", async function () {
      await expect(
        subscription.connect(Owner).registerMerchant(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(subscription, "ZeroAddress");
    });

    it("should revert if merchant is already registered", async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await expect(
        subscription.connect(Owner).registerMerchant(Merchant1.address),
      )
        .to.be.revertedWithCustomError(subscription, "AlreadyMerchant")
        .withArgs(Merchant1.address);
    });

    it("should register merchant successfully", async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      expect(await subscription.isMerchant(Merchant1.address)).to.equal(true);
    });

    it("should emit MerchantRegistered event", async function () {
      await expect(
        subscription.connect(Owner).registerMerchant(Merchant1.address),
      )
        .to.emit(subscription, "MerchantRegistered")
        .withArgs(Merchant1.address);
    });
  });

  // Transfer Ownership Tests
 
  describe("transferOwnership", function () {
    it("should revert if caller is not owner or authority", async function () {
      await expect(
        subscription.connect(Merchant1).transferOwnership(Merchant2.address),
      )
        .to.be.revertedWithCustomError(subscription, "NotAuthorized")
        .withArgs(Merchant1.address);
    });
 
    it("should revert if new owner address is zero", async function () {
      await expect(
        subscription.connect(Owner).transferOwnership(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(subscription, "ZeroAddress");
    });
 
    it("should revert if new owner is the current owner", async function () {
      await expect(
        subscription.connect(Owner).transferOwnership(Owner.address),
      ).to.be.revertedWithCustomError(subscription, "InvalidAddress");
    });
 
    it("should revert if new owner is the authority", async function () {
      await expect(
        subscription.connect(Owner).transferOwnership(Authority.address),
      ).to.be.revertedWithCustomError(subscription, "InvalidAddress");
    });
 
    it("should revert if new owner is already pending", async function () {
      await subscription.connect(Owner).transferOwnership(Merchant1.address);
      await expect(
        subscription.connect(Owner).transferOwnership(Merchant1.address),
      ).to.be.revertedWithCustomError(subscription, "AlreadyPending");
    });
 
    it("should allow owner to initiate transfer", async function () {
      await subscription.connect(Owner).transferOwnership(Merchant1.address);
      expect(await subscription.pendingOwner()).to.equal(Merchant1.address);
    });
 
    it("should allow authority to initiate transfer", async function () {
      await subscription.connect(Authority).transferOwnership(Merchant1.address);
      expect(await subscription.pendingOwner()).to.equal(Merchant1.address);
    });
 
    it("should emit OwnershipTransferStarted event", async function () {
      await expect(
        subscription.connect(Owner).transferOwnership(Merchant1.address),
      )
        .to.emit(subscription, "OwnershipTransferStarted")
        .withArgs(Owner.address, Merchant1.address);
    });
  });
 
  // Accept Ownership Tests
 
  describe("acceptOwnership", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).transferOwnership(Merchant1.address);
    });
 
    it("should revert if caller is not the pending owner", async function () {
      await expect(subscription.connect(Merchant2).acceptOwnership())
        .to.be.revertedWithCustomError(subscription, "NotAuthorized")
        .withArgs(Merchant2.address);
    });
 
    it("should revert if current owner tries to accept", async function () {
      await expect(subscription.connect(Owner).acceptOwnership())
        .to.be.revertedWithCustomError(subscription, "NotAuthorized")
        .withArgs(Owner.address);
    });
 
    it("should transfer ownership to pending owner", async function () {
      await subscription.connect(Merchant1).acceptOwnership();
      expect(await subscription.owner()).to.equal(Merchant1.address);
    });
 
    it("should clear pending owner after acceptance", async function () {
      await subscription.connect(Merchant1).acceptOwnership();
      expect(await subscription.pendingOwner()).to.equal(ethers.ZeroAddress);
    });
 
    it("should allow new owner to register merchants after transfer", async function () {
      await subscription.connect(Merchant1).acceptOwnership();
      await subscription.connect(Merchant1).registerMerchant(Merchant2.address);
      expect(await subscription.isMerchant(Merchant2.address)).to.equal(true);
    });
 
    it("should revoke old owner permissions after transfer", async function () {
      await subscription.connect(Merchant1).acceptOwnership();
      await expect(
        subscription.connect(Owner).registerMerchant(Merchant2.address),
      ).to.be.revertedWithCustomError(subscription, "NotOwner");
    });
 
    it("should emit OwnershipTransferred event", async function () {
      await expect(subscription.connect(Merchant1).acceptOwnership())
        .to.emit(subscription, "OwnershipTransferred")
        .withArgs(Owner.address, Merchant1.address);
    });
  });

  // Revoke merchant

  describe("revokeMerchant", function () {
    it("should revert if caller is not the owner", async function () {
      await expect(
        subscription.connect(Merchant1).revokeMerchant(Merchant2.address),
      ).to.be.revertedWithCustomError(subscription, "NotOwner");
    });

    it("should revert if merchant address is invalid", async function () {
      await expect(
        subscription.connect(Owner).revokeMerchant(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(subscription, "ZeroAddress");
    });

    it("should revert if the merchant is not registered", async function () {
      // Corrected Merchant1.address
      await expect(
        subscription.connect(Owner).revokeMerchant(Merchant1.address),
      ).to.be.revertedWithCustomError(subscription, "UnregisteredMerchant");
    });

    describe("when merchant is revoked", function () {
      beforeEach(async function () {
        await subscription.connect(Owner).registerMerchant(Merchant1.address);
        await subscription
          .connect(Merchant1)
          .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
        await subscription
          .connect(Merchant1)
          .definePlan("Premium", PLAN_DURATION, PLAN_PRICE);
        await subscription
          .connect(Merchant1)
          .definePlan("Pro", PLAN_DURATION, PLAN_PRICE);
        await subscription.connect(Subscriber1).subscribe(1);
        await subscription.connect(Subscriber2).subscribe(2);
        await subscription.connect(Subscriber1).subscribe(3);
        await subscription.connect(Owner).revokeMerchant(Merchant1.address);
      });

      it("should deactivate all the plans defined by the merchant", async function () {
        for (let i = 0; i < 3; i++) {
          const plan = await subscription.Subscriptions(1);
          expect(plan.deactivated).to.be.true;
        }
      });

      it("should delete registration of the merchant", async function () {
        expect(await subscription.isMerchant(Merchant1.address)).to.be.false;
      });

      describe("After revoke subscriber configurations", function () {
        it("should revert when subscriber pauses renewal of the deactivated subscription", async function () {
          await expect(
            subscription.connect(Subscriber1).pauseRenewal(1),
          ).to.be.revertedWithCustomError(subscription, "DeactivatedPlan");
        });

        it("should revert when subscriber resumes renewal of the deactivated subscription", async function () {
          await expect(
            subscription.connect(Subscriber1).resumeRenewal(1),
          ).to.be.revertedWithCustomError(subscription, "DeactivatedPlan");
        });
      });
    });
  });

  // Define Plan Tests

  describe("definePlan", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
    });

    it("should revert if unregistered merchant tries to define a plan", async function () {
      await expect(
        subscription
          .connect(Merchant2)
          .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE),
      ).to.be.revertedWithCustomError(subscription, "UnregisteredMerchant");
    });

    it("should revert if plan name is empty", async function () {
      await expect(
        subscription
          .connect(Merchant1)
          .definePlan("", PLAN_DURATION, PLAN_PRICE),
      ).to.be.revertedWithCustomError(subscription, "EmptyValue");
    });

    it("should revert if duration is 0", async function () {
      await expect(
        subscription.connect(Merchant1).definePlan(PLAN_NAME, 0, PLAN_PRICE),
      ).to.be.revertedWithCustomError(subscription, "EmptyValue");
    });

    it("should revert if price is 0", async function () {
      await expect(
        subscription.connect(Merchant1).definePlan(PLAN_NAME, PLAN_DURATION, 0),
      ).to.be.revertedWithCustomError(subscription, "EmptyValue");
    });

    it("should define a plan successfully", async function () {
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);

      const plan = await subscription.Subscriptions(1);
      expect(plan.merchant).to.equal(Merchant1.address);
      expect(plan.name).to.equal(PLAN_NAME);
      expect(plan.duration).to.equal(PLAN_DURATION);
      expect(plan.price).to.equal(PLAN_PRICE);
      expect(plan.deactivated).to.equal(false);
    });

    it("should emit PlansDefined event", async function () {
      await expect(
        subscription
          .connect(Merchant1)
          .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE),
      )
        .to.emit(subscription, "PlanDefined")
        .withArgs(Merchant1.address, PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
    });
  });

  // Auto Renewal Tests

  describe("autoRenewal", function () {
    beforeEach(async function () {
      // Register merchant, define plan, and subscribe
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
      await subscription.connect(Subscriber1).subscribe(1);
    });

    it("should revert if plan is deactivated", async function () {
      await subscription.connect(Merchant1).deactivatePlan(1);
      await expect(
        subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1),
      ).to.be.revertedWithCustomError(subscription, "DeactivatedPlan");
    });

    it("should revert if caller is not the merchant of the plan", async function () {
      await subscription.connect(Owner).registerMerchant(Merchant2.address);
      await expect(
        subscription.connect(Merchant2).autoRenewal(Subscriber1.address, 1),
      ).to.be.revertedWithCustomError(subscription, "InvalidMerchant");
    });

    it("should revert if subscriber does not have an active subscription", async function () {
      await expect(
        subscription.connect(Merchant1).autoRenewal(Subscriber2.address, 1),
      ).to.be.revertedWithCustomError(subscription, "InvalidID");
    });

    it("should revert if subscription is paused", async function () {
      await subscription.connect(Subscriber1).pauseRenewal(1);

      // Fast forward past billing date
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1),
      ).to.be.revertedWithCustomError(subscription, "Paused");
    });

    it("should revert if billing period is not complete", async function () {
      await expect(
        subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1),
      ).to.be.revertedWithCustomError(subscription, "PeriodIncomplete");
    });

    it("should auto renew successfully after billing period", async function () {
      // Fast forward past billing date
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1);

      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      expect(subscriber.amountPaid).to.equal(PLAN_PRICE);
    });

    it("should emit AutoRenewals event", async function () {
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1),
      )
        .to.emit(subscription, "AutoRenewed")
        .withArgs(Subscriber1.address, Merchant1.address, PLAN_NAME);
    });

    it("should increase toWithdraw balance after auto renewal", async function () {
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1);

      const plan = await subscription.Subscriptions(1);
      // Initial subscribe + auto renewal = 2x price
      expect(plan.toWithdraw).to.equal(PLAN_PRICE * 2n);
    });

    it("should correctly advance billing dates over 2 renewal cycles", async function () {
      // cycle 1
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1);

      const afterCycle1 = await subscription.Subscribers(
        Subscriber1.address,
        1,
      );
      const expectedNextBillingCycle1 =
        afterCycle1.lastBillingDate + BigInt(PLAN_DURATION * 24 * 60 * 60);
      expect(afterCycle1.nextBillingDate).to.equal(expectedNextBillingCycle1);

      // cycle 2
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1);

      const afterCycle2 = await subscription.Subscribers(
        Subscriber1.address,
        1,
      );
      const expectedNextBillingCycle2 =
        afterCycle2.lastBillingDate + BigInt(PLAN_DURATION * 24 * 60 * 60);
      expect(afterCycle2.nextBillingDate).to.equal(expectedNextBillingCycle2);

      // lastBillingDate should have advanced from cycle 1 to cycle 2
      expect(afterCycle2.lastBillingDate).to.be.gt(afterCycle1.lastBillingDate);
      expect(afterCycle2.nextBillingDate).to.be.gt(afterCycle1.nextBillingDate);
    });

    it("should correctly advance billing dates over 3 renewal cycles", async function () {
      const billingDates: bigint[] = [];
      const nextBillingDates: bigint[] = [];

      // record initial state
      const initial = await subscription.Subscribers(Subscriber1.address, 1);
      billingDates.push(initial.lastBillingDate);
      nextBillingDates.push(initial.nextBillingDate);

      // run 3 cycles
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);

        await subscription
          .connect(Merchant1)
          .autoRenewal(Subscriber1.address, 1);

        const state = await subscription.Subscribers(Subscriber1.address, 1);
        billingDates.push(state.lastBillingDate);
        nextBillingDates.push(state.nextBillingDate);

        // nextBillingDate should always be lastBillingDate + duration
        expect(state.nextBillingDate).to.equal(
          state.lastBillingDate + BigInt(PLAN_DURATION * 24 * 60 * 60),
        );
      }

      // each cycle should advance both dates forward
      for (let i = 1; i < billingDates.length; i++) {
        expect(billingDates[i]).to.be.gt(billingDates[i - 1]);
        expect(nextBillingDates[i]).to.be.gt(nextBillingDates[i - 1]);
      }
    });

    it("should accumulate toWithdraw correctly over 3 renewal cycles", async function () {
      for (let i = 0; i < 3; i++) {
        await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
        await subscription
          .connect(Merchant1)
          .autoRenewal(Subscriber1.address, 1);
      }

      const plan = await subscription.Subscriptions(1);
      // initial subscribe + 3 renewals = 4x price
      expect(plan.toWithdraw).to.equal(PLAN_PRICE * 4n);
    });
  });

  // Merchant Withdrawal Tests

  describe("merchantWithdrawal", function () {
    beforeEach(async function () {
      // Register merchant, define plan, and subscribe so toWithdraw has balance
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
      await subscription.connect(Subscriber1).subscribe(1);
    });

    it("should revert if caller is not the merchant of the plan", async function () {
      await subscription.connect(Owner).registerMerchant(Merchant2.address);
      await expect(
        subscription.connect(Merchant2).merchantWithdrawal(1),
      ).to.be.revertedWithCustomError(subscription, "InvalidMerchant");
    });

    it("should revert if there is nothing to withdraw", async function () {
      // Withdraw once to drain balance
      await subscription.connect(Merchant1).merchantWithdrawal(1);
      await expect(
        subscription.connect(Merchant1).merchantWithdrawal(1),
      ).to.be.revertedWithCustomError(subscription, "NothingToWithdraw");
    });

    it("should withdraw successfully and transfer tokens to merchant", async function () {
      const balanceBefore = await token.balanceOf(Merchant1.address);
      await subscription.connect(Merchant1).merchantWithdrawal(1);
      const balanceAfter = await token.balanceOf(Merchant1.address);
      expect(balanceAfter - balanceBefore).to.equal(PLAN_PRICE);
    });

    it("should reset toWithdraw to 0 after withdrawal", async function () {
      await subscription.connect(Merchant1).merchantWithdrawal(1);
      const plan = await subscription.Subscriptions(1);
      expect(plan.toWithdraw).to.equal(0);
    });

    it("should emit withdrwals event", async function () {
      await expect(subscription.connect(Merchant1).merchantWithdrawal(1))
        .to.emit(subscription, "Withdrawal")
        .withArgs(Merchant1.address, 1);
    });
  });

  // Deactivate Plan Tests

  describe("deactivatePlan", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
    });

    it("should revert if caller is not the merchant of the plan", async function () {
      await subscription.connect(Owner).registerMerchant(Merchant2.address);
      await expect(
        subscription.connect(Merchant2).deactivatePlan(1),
      ).to.be.revertedWithCustomError(subscription, "InvalidMerchant");
    });

    it("should revert if plan is already deactivated", async function () {
      await subscription.connect(Merchant1).deactivatePlan(1);
      await expect(
        subscription.connect(Merchant1).deactivatePlan(1),
      ).to.be.revertedWithCustomError(subscription, "AlreadyDeactivated");
    });

    it("should deactivate plan successfully", async function () {
      await subscription.connect(Merchant1).deactivatePlan(1);
      const plan = await subscription.Subscriptions(1);
      expect(plan.deactivated).to.equal(true);
    });

    it("should emit PlanDeactivated event", async function () {
      await expect(subscription.connect(Merchant1).deactivatePlan(1))
        .to.emit(subscription, "PlanDeactivated")
        .withArgs(Merchant1.address, 1);
    });

    it("should prevent new subscriptions after deactivation", async function () {
      await subscription.connect(Merchant1).deactivatePlan(1);
      await expect(
        subscription.connect(Subscriber1).subscribe(1),
      ).to.be.revertedWithCustomError(subscription, "DeactivatedPlan");
    });
  });

  // Subscribe Tests

  describe("subscribe", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
    });

    it("should revert if plan is deactivated", async function () {
      await subscription.connect(Merchant1).deactivatePlan(1);
      await expect(
        subscription.connect(Subscriber1).subscribe(1),
      ).to.be.revertedWithCustomError(subscription, "DeactivatedPlan");
    });

    it("should revert if plan does not exist", async function () {
      await expect(
        subscription.connect(Subscriber1).subscribe(99),
      ).to.be.revertedWithCustomError(subscription, "InvalidID");
    });

    it("should revert if subscriber already has an active subscription", async function () {
      await subscription.connect(Subscriber1).subscribe(1);
      await expect(
        subscription.connect(Subscriber1).subscribe(1),
      ).to.be.revertedWithCustomError(subscription, "ExistingPlan");
    });

    it("should revert if subscriber has insufficient token balance", async function () {
      // Approve and try to subscribe with an account that has no tokens
      await token
        .connect(Merchant1)
        .approve(subscription.target, ethers.parseEther("1000"));

      await expect(subscription.connect(Merchant1).subscribe(1)).to.be.reverted;
    });

    it("should subscribe successfully", async function () {
      await subscription.connect(Subscriber1).subscribe(1);
      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      expect(subscriber.merchant).to.equal(Merchant1.address);
      expect(subscriber.subscriptionName).to.equal(PLAN_NAME);
      expect(subscriber.amountPaid).to.equal(PLAN_PRICE);
      expect(subscriber.paused).to.equal(false);
    });

    it("should deduct tokens from subscriber on subscribe", async function () {
      const balanceBefore = await token.balanceOf(Subscriber1.address);
      await subscription.connect(Subscriber1).subscribe(1);
      const balanceAfter = await token.balanceOf(Subscriber1.address);
      expect(balanceBefore - balanceAfter).to.equal(PLAN_PRICE);
    });

    it("should increase toWithdraw balance on subscribe", async function () {
      await subscription.connect(Subscriber1).subscribe(1);
      const plan = await subscription.Subscriptions(1);
      expect(plan.toWithdraw).to.equal(PLAN_PRICE);
    });

    it("should set correct next billing date", async function () {
      await subscription.connect(Subscriber1).subscribe(1);
      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      const expectedNextBilling =
        subscriber.lastBillingDate + BigInt(PLAN_DURATION * 24 * 60 * 60);
      expect(subscriber.nextBillingDate).to.equal(expectedNextBilling);
    });

    it("should emit SubscriptionPurchased event", async function () {
      await expect(subscription.connect(Subscriber1).subscribe(1))
        .to.emit(subscription, "SubscriptionPurchased")
        .withArgs(Subscriber1.address, Merchant1.address, PLAN_NAME);
    });
  });

  // Pause Renewal Tests

  describe("pauseRenewal", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
      await subscription.connect(Subscriber1).subscribe(1);
    });

    it("should revert if subscriber does not have an active subscription", async function () {
      await expect(
        subscription.connect(Subscriber2).pauseRenewal(1),
      ).to.be.revertedWithCustomError(subscription, "InvalidID");
    });

    it("should revert if subscription is already paused", async function () {
      await subscription.connect(Subscriber1).pauseRenewal(1);
      await expect(
        subscription.connect(Subscriber1).pauseRenewal(1),
      ).to.be.revertedWithCustomError(subscription, "AlreadyPaused");
    });

    it("should pause renewal successfully", async function () {
      await subscription.connect(Subscriber1).pauseRenewal(1);
      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      expect(subscriber.paused).to.equal(true);
    });

    it("should emit PausedRenewal event", async function () {
      await expect(subscription.connect(Subscriber1).pauseRenewal(1))
        .to.emit(subscription, "PausedRenewal")
        .withArgs(Subscriber1.address, Merchant1.address, PLAN_NAME);
    });
  });

  // Resume Renewal Tests

  describe("resumeRenewal", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
      await subscription.connect(Subscriber1).subscribe(1);
      await subscription.connect(Subscriber1).pauseRenewal(1);
    });

    it("should revert if plan is deactivated", async function () {
      await subscription.connect(Merchant1).deactivatePlan(1);
      await expect(
        subscription.connect(Subscriber1).resumeRenewal(1),
      ).to.be.revertedWithCustomError(subscription, "DeactivatedPlan");
    });

    it("should revert if subscriber does not have an active subscription", async function () {
      await expect(
        subscription.connect(Subscriber2).resumeRenewal(1),
      ).to.be.revertedWithCustomError(subscription, "InvalidID");
    });

    it("should revert if subscription is not paused", async function () {
      // Resume first to unpause
      await subscription.connect(Subscriber1).resumeRenewal(1);
      await expect(
        subscription.connect(Subscriber1).resumeRenewal(1),
      ).to.be.revertedWithCustomError(subscription, "NotPaused");
    });

    it("should resume renewal successfully", async function () {
      await subscription.connect(Subscriber1).resumeRenewal(1);
      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      expect(subscriber.paused).to.equal(false);
    });

    it("should charge subscriber if billing date has passed on resume", async function () {
      // Fast forward past billing date
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await token.balanceOf(Subscriber1.address);
      await subscription.connect(Subscriber1).resumeRenewal(1);
      const balanceAfter = await token.balanceOf(Subscriber1.address);

      expect(balanceBefore - balanceAfter).to.equal(PLAN_PRICE);
    });

    it("should not charge subscriber if billing date has not passed on resume", async function () {
      const balanceBefore = await token.balanceOf(Subscriber1.address);
      await subscription.connect(Subscriber1).resumeRenewal(1);
      const balanceAfter = await token.balanceOf(Subscriber1.address);

      expect(balanceBefore - balanceAfter).to.equal(0);
    });

    it("should emit ResumedRenewal event", async function () {
      await expect(subscription.connect(Subscriber1).resumeRenewal(1))
        .to.emit(subscription, "ResumedRenewal")
        .withArgs(Subscriber1.address, Merchant1.address, PLAN_NAME);
    });
  });

  // Cancel Subscription Tests

  describe("cancelSubscription", function () {
    beforeEach(async function () {
      await subscription.connect(Owner).registerMerchant(Merchant1.address);
      await subscription
        .connect(Merchant1)
        .definePlan(PLAN_NAME, PLAN_DURATION, PLAN_PRICE);
      await subscription.connect(Subscriber1).subscribe(1);
    });

    it("should revert if subscriber does not have an active subscription", async function () {
      await expect(
        subscription.connect(Subscriber2).cancelSubscription(1),
      ).to.be.revertedWithCustomError(subscription, "InvalidID");
    });

    it("should cancel subscription successfully", async function () {
      await subscription.connect(Subscriber1).cancelSubscription(1);
      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      expect(subscriber.amountPaid).to.equal(0);
      expect(subscriber.merchant).to.equal(ethers.ZeroAddress);
      expect(subscriber.paused).to.equal(false);
    });

    it("should prevent auto renewal after cancellation", async function () {
      await subscription.connect(Subscriber1).cancelSubscription(1);

      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        subscription.connect(Merchant1).autoRenewal(Subscriber1.address, 1),
      ).to.be.revertedWithCustomError(subscription, "InvalidID");
    });

    it("should allow subscriber to resubscribe after cancellation", async function () {
      await subscription.connect(Subscriber1).cancelSubscription(1);
      await subscription.connect(Subscriber1).subscribe(1);
      const subscriber = await subscription.Subscribers(Subscriber1.address, 1);
      expect(subscriber.amountPaid).to.equal(PLAN_PRICE);
    });

    it("should emit Cancelled event", async function () {
      await expect(subscription.connect(Subscriber1).cancelSubscription(1))
        .to.emit(subscription, "Cancelled")
        .withArgs(Subscriber1.address, Merchant1.address, PLAN_NAME);
    });
  });
});
