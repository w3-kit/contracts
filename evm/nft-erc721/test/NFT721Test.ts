import { expect } from "chai";
import { ethers } from "hardhat";
import { NFT721 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("NFT721", function () {
  let nft: NFT721;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const NAME = "Artemis";
  const SYMBOL = "ATM";
  const DEFAULT_FEE = 500; // 5%

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const NFTFactory = await ethers.getContractFactory("NFT721");
    nft = await NFTFactory.deploy(NAME, SYMBOL, owner.address, DEFAULT_FEE);
  });

  describe("Deployment", function () {
    it("should set the correct name", async function () {
      expect(await nft.name()).to.equal(NAME);
    });

    it("should set the correct symbol", async function () {
      expect(await nft.symbol()).to.equal(SYMBOL);
    });

    it("should set the correct owner", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("should start with a total supply of 0", async function () {
      expect(await nft.totalSupply()).to.equal(0);
    });

    it("should revert if initial owner is zero address", async function () {
      const NFTFactory = await ethers.getContractFactory("NFT721");
      await expect(
        NFTFactory.deploy(NAME, SYMBOL, ethers.ZeroAddress, DEFAULT_FEE),
      ).to.be.revertedWithCustomError(nft, "OwnableInvalidOwner");
    });

    it("should revert if default fee exceeds 100%", async function () {
      const NFTFactory = await ethers.getContractFactory("NFT721");
      const invalidFee = 10001;
      await expect(NFTFactory.deploy(NAME, SYMBOL, owner.address, invalidFee))
        .to.be.revertedWithCustomError(nft, "InvalidFee")
        .withArgs(invalidFee);
    });
  });

  describe("Mint", function () {
    const TOKEN_URI = "ipfs://QmYourHash/1";

    it("should allow owner to mint successfully", async function () {
      await expect(
        nft
          .connect(owner)
          .safeMint(alice.address, TOKEN_URI, owner.address, DEFAULT_FEE),
      )
        .to.emit(nft, "Transfer")
        .withArgs(ethers.ZeroAddress, alice.address, 0);

      expect(await nft.ownerOf(0)).to.equal(alice.address);
      expect(await nft.tokenURI(0)).to.equal(TOKEN_URI);
    });

    it("should increase total supply and update enumeration", async function () {
      await nft.safeMint(alice.address, TOKEN_URI, owner.address, DEFAULT_FEE);
      expect(await nft.totalSupply()).to.equal(1);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 0)).to.equal(0);
    });

    it("should revert if minting to zero address", async function () {
      await expect(
        nft.safeMint(ethers.ZeroAddress, TOKEN_URI, owner.address, DEFAULT_FEE),
      ).to.be.revertedWithCustomError(nft, "ERC721InvalidReceiver");
    });

    it("should revert if URI is empty", async function () {
      await expect(
        nft.safeMint(alice.address, "", owner.address, DEFAULT_FEE),
      ).to.be.revertedWithCustomError(nft, "NoURI");
    });

    it("should revert if non-owner tries to mint", async function () {
      await expect(
        nft
          .connect(alice)
          .safeMint(alice.address, TOKEN_URI, alice.address, DEFAULT_FEE),
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    });

    it("should allow minting with 0 royalty fee", async function () {
      await expect(nft.safeMint(alice.address, TOKEN_URI, alice.address, 0)).to
        .not.be.reverted;
    });

    it("should revert if custom royalty fee exceeds 100%", async function () {
      const invalidFee = 10001;
      await expect(
        nft.safeMint(alice.address, TOKEN_URI, alice.address, invalidFee),
      )
        .to.be.revertedWithCustomError(nft, "InvalidFee")
        .withArgs(invalidFee);
    });

    it("should revert if royalty receiver is zero address with non-zero fee", async function () {
      await expect(
        nft.safeMint(alice.address, TOKEN_URI, ethers.ZeroAddress, DEFAULT_FEE),
      )
        .to.be.revertedWithCustomError(nft, "InvalidFee")
        .withArgs(DEFAULT_FEE);
    });

    it("should allow minting with zero address receiver and zero fee", async function () {
      await expect(
        nft.safeMint(alice.address, TOKEN_URI, ethers.ZeroAddress, 0),
      ).to.not.be.reverted;
    });
  });

  describe("setDefaultRoyalty", function () {
    const NEW_FEE = 1000; // 10%
    const SALE_PRICE = ethers.parseUnits("1", "ether");

    it("should allow owner to update default royalty", async function () {
      await nft.setDefaultRoyalty(bob.address, NEW_FEE);

      // We use a dummy tokenId 99 because default royalty applies to all tokens
      // unless a specific override is set.
      const [receiver, royaltyAmount] = await nft.royaltyInfo(99, SALE_PRICE);

      expect(receiver).to.equal(bob.address);
      expect(royaltyAmount).to.equal(ethers.parseUnits("0.1", "ether"));
    });

    it("should revert if royalty receiver is zero address", async function () {
      await expect(
        nft.setDefaultRoyalty(ethers.ZeroAddress, NEW_FEE),
      ).to.be.revertedWithCustomError(nft, "NullAddress");
    });

    it("should revert if new fee exceeds 100%", async function () {
      const invalidFee = 10001;
      await expect(nft.setDefaultRoyalty(bob.address, invalidFee))
        .to.be.revertedWithCustomError(nft, "InvalidFee")
        .withArgs(invalidFee);
    });

    it("should revert if non-owner tries to set default royalty", async function () {
      await expect(nft.connect(alice).setDefaultRoyalty(alice.address, NEW_FEE))
        .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("should emit event DefaultRoyaltyUpdate", async function () {
      await expect(nft.setDefaultRoyalty(bob.address, "500"))
        .to.emit(nft, "DefaultRoyaltyUpdate")
        .withArgs(bob.address, "500");
    });
  });

  describe("_update (Transfers & Enumeration)", function () {
    const TOKEN_URI = "ipfs://QmYourHash/1";

    beforeEach(async function () {
      // Mint a token to Alice so we can test transfers
      await nft.safeMint(alice.address, TOKEN_URI, owner.address, DEFAULT_FEE);
    });

    it("should update ownership on transfer", async function () {
      // This calls transferFrom -> _update
      await nft.connect(alice).transferFrom(alice.address, bob.address, 0);

      expect(await nft.ownerOf(0)).to.equal(bob.address);
      expect(await nft.balanceOf(alice.address)).to.equal(0);
      expect(await nft.balanceOf(bob.address)).to.equal(1);
    });

    it("should update enumeration for the recipient", async function () {
      await nft.connect(alice).transferFrom(alice.address, bob.address, 0);

      // Check that Bob now has the token at index 0
      expect(await nft.tokenOfOwnerByIndex(bob.address, 0)).to.equal(0);
    });

    it("should update enumeration for the sender", async function () {
      // Mint a second token to Alice
      await nft.safeMint(
        alice.address,
        "ipfs://hash2",
        owner.address,
        DEFAULT_FEE,
      );

      // Transfer the first token (ID 0)
      await nft.connect(alice).transferFrom(alice.address, bob.address, 0);

      // Alice should still have 1 token, and it should now be index 0 (originally index 1)
      expect(await nft.balanceOf(alice.address)).to.equal(1);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 0)).to.equal(1);
    });

    it("should revert if an unauthorized user tries to transfer", async function () {
      // Bob tries to transfer Alice's token
      await expect(nft.connect(bob).transferFrom(alice.address, bob.address, 0))
        .to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval")
        .withArgs(bob.address, 0);
    });

    it("should clear approvals after a transfer", async function () {
      // Alice approves Bob to manage token 0
      await nft.connect(alice).approve(bob.address, 0);

      // Transfer happens
      await nft.connect(alice).transferFrom(alice.address, bob.address, 0);

      // Approval should be cleared (reset to ZeroAddress)
      expect(await nft.getApproved(0)).to.equal(ethers.ZeroAddress);
    });
  });

  describe("_increaseBalance (Internal Accounting)", function () {
    const TOKEN_URI_1 = "ipfs://QmHash1";
    const TOKEN_URI_2 = "ipfs://QmHash2";

    it("should correctly increase balance on multiple mints", async function () {
      // Balance starts at 0
      expect(await nft.balanceOf(alice.address)).to.equal(0);

      // First Mint
      await nft.safeMint(
        alice.address,
        TOKEN_URI_1,
        owner.address,
        DEFAULT_FEE,
      );
      expect(await nft.balanceOf(alice.address)).to.equal(1);

      // Second Mint
      await nft.safeMint(
        alice.address,
        TOKEN_URI_2,
        owner.address,
        DEFAULT_FEE,
      );
      expect(await nft.balanceOf(alice.address)).to.equal(2);
    });

    it("should accurately track tokens by index after balance increase", async function () {
      await nft.safeMint(
        alice.address,
        TOKEN_URI_1,
        owner.address,
        DEFAULT_FEE,
      ); // ID 0
      await nft.safeMint(
        alice.address,
        TOKEN_URI_2,
        owner.address,
        DEFAULT_FEE,
      ); // ID 1

      // Verify enumeration logic (enabled by _increaseBalance)
      expect(await nft.tokenOfOwnerByIndex(alice.address, 0)).to.equal(0);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 1)).to.equal(1);
    });

    it("should maintain balance consistency during transfers", async function () {
      await nft.safeMint(
        alice.address,
        TOKEN_URI_1,
        owner.address,
        DEFAULT_FEE,
      );

      // Transfer to Bob
      await nft.connect(alice).transferFrom(alice.address, bob.address, 0);

      // Alice balance should decrease, Bob balance should increase
      expect(await nft.balanceOf(alice.address)).to.equal(0);
      expect(await nft.balanceOf(bob.address)).to.equal(1);
    });

    it("should support totalSupply tracking", async function () {
      await nft.safeMint(
        alice.address,
        TOKEN_URI_1,
        owner.address,
        DEFAULT_FEE,
      );
      await nft.safeMint(bob.address, TOKEN_URI_2, owner.address, DEFAULT_FEE);

      // Internal balance increases must reflect in total supply
      expect(await nft.totalSupply()).to.equal(2);
    });
  });

  describe("tokenURI", function () {
    const TOKEN_URI_0 = "ipfs://QmAliceToken/0";
    const TOKEN_URI_1 = "ipfs://QmBobToken/1";

    beforeEach(async function () {
      await nft.safeMint(
        alice.address,
        TOKEN_URI_0,
        owner.address,
        DEFAULT_FEE,
      );
    });

    it("should return the correct URI for a minted token", async function () {
      expect(await nft.tokenURI(0)).to.equal(TOKEN_URI_0);
    });

    it("should return correct URIs for multiple different tokens", async function () {
      await nft.safeMint(bob.address, TOKEN_URI_1, owner.address, DEFAULT_FEE);

      expect(await nft.tokenURI(0)).to.equal(TOKEN_URI_0);
      expect(await nft.tokenURI(1)).to.equal(TOKEN_URI_1);
    });

    it("should revert when querying URI for a nonexistent token", async function () {
      const invalidTokenId = 99;
      await expect(nft.tokenURI(invalidTokenId))
        .to.be.revertedWithCustomError(nft, "ERC721NonexistentToken")
        .withArgs(invalidTokenId);
    });

    it("should allow URIs with different protocols (ipfs, https, arweave)", async function () {
      const httpsURI = "https://metadata.server.com/nft/2";
      await nft.safeMint(alice.address, httpsURI, owner.address, DEFAULT_FEE);

      expect(await nft.tokenURI(1)).to.equal(httpsURI);
    });
  });

  describe("supportsInterface", function () {
    it("should support ERC721 interface", async function () {
      // Interface ID for ERC721 is 0x80ac58cd
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("should support ERC721Enumerable interface", async function () {
      // Interface ID for ERC721Enumerable is 0x780e9d63
      expect(await nft.supportsInterface("0x780e9d63")).to.be.true;
    });

    it("should support ERC721Metadata interface", async function () {
      // Interface ID for ERC721Metadata is 0x5b5e139f
      expect(await nft.supportsInterface("0x5b5e139f")).to.be.true;
    });

    it("should support ERC2981 (Royalties) interface", async function () {
      // Interface ID for ERC2981 is 0x2a55205a
      expect(await nft.supportsInterface("0x2a55205a")).to.be.true;
    });

    it("should support ERC165 interface", async function () {
      // Interface ID for ERC165 is 0x01ffc9a7
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.true;
    });

    it("should return false for an unsupported interface", async function () {
      // Randomly generated dummy interface ID
      expect(await nft.supportsInterface("0xffffffff")).to.be.false;
    });
  });
});
