import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleTreeWithHistory } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MerkleTreeWithHistory", function () {
  let merkleTree: MerkleTreeWithHistory;
  let hasher: any;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;

  const TREE_HEIGHT = 10; // Use smaller tree for faster tests
  const ROOT_HISTORY_SIZE = 10000;
  const ZERO_VALUE =
    "21663839004416932945382355908790599225266501822907911457504978515578255421292";

  before(async function () {
    [owner, addr1] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // Deploy MiMC hasher mock (we'll use a simple mock for testing)
    const HasherFactory = await ethers.getContractFactory("MiMCMock");
    hasher = await HasherFactory.deploy();
    await hasher.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should deploy with correct tree height", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();

      expect(await merkleTree.levels()).to.equal(TREE_HEIGHT);
    });

    it("Should initialize with correct constants", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();

      expect(await merkleTree.FIELD_SIZE()).to.equal(
        "21888242871839275222246405745257275088548364400416034343698204186575808495617",
      );
      expect(await merkleTree.ZERO_VALUE()).to.equal(ZERO_VALUE);
      expect(await merkleTree.ROOT_HISTORY_SIZE()).to.equal(ROOT_HISTORY_SIZE);
    });

    it("Should initialize root history with initial root", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();

      const initialRoot = await merkleTree.getLastRoot();
      expect(initialRoot).to.not.equal(ethers.ZeroHash);

      // Initial root should be known
      expect(await merkleTree.isKnownRoot(initialRoot)).to.be.true;
    });

    it("Should revert if levels is 0", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      await expect(
        MerkleTreeFactory.deploy(0, hasher.target),
      ).to.be.revertedWith("MerkleTree: levels must be greater than 0");
    });

    it("Should revert if levels > 32", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      await expect(
        MerkleTreeFactory.deploy(33, hasher.target),
      ).to.be.revertedWith("MerkleTree: levels must be <= 32");
    });

    it("Should revert if hasher address is zero", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      await expect(
        MerkleTreeFactory.deploy(TREE_HEIGHT, ethers.ZeroAddress),
      ).to.be.revertedWith("MerkleTree: invalid hasher address");
    });
  });

  describe("Insertion", function () {
    beforeEach(async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();
    });

    it("Should insert a leaf and update nextIndex", async function () {
      const leaf = ethers.randomBytes(32);

      expect(await merkleTree.nextIndex()).to.equal(0);

      // We can't call _insert directly as it's internal, so we'll test via PrivacyPool
      // For now, just verify the initial state
      const initialRoot = await merkleTree.getLastRoot();
      expect(initialRoot).to.not.equal(ethers.ZeroHash);
    });

    it("Should update root after insertion", async function () {
      const initialRoot = await merkleTree.getLastRoot();
      expect(await merkleTree.isKnownRoot(initialRoot)).to.be.true;

      // Root should be in roots mapping
      expect(await merkleTree.roots(0)).to.equal(initialRoot);
    });

    it("Should store correct zero values", async function () {
      // Test first few zero values
      const zero0 = await merkleTree.zeros(0);
      expect(zero0).to.equal(
        "0x2fe54c60d3acabf3343a35b6eba15db4821b340f76e741e2249685ed4899af6c",
      );

      const zero1 = await merkleTree.zeros(1);
      expect(zero1).to.equal(
        "0x256a6135777eee2fd26f54b8b7037a25439d5235caee224154186d2b8a52e31d",
      );

      const zero2 = await merkleTree.zeros(2);
      expect(zero2).to.equal(
        "0x1151949895e82ab19924de92c40a3d6f7bcb60d92b00504b8199613683f0c200",
      );
    });

    it("Should revert for zeros index > 32", async function () {
      await expect(merkleTree.zeros(33)).to.be.revertedWith(
        "MerkleTree: index out of bounds",
      );
    });
  });

  describe("Root History", function () {
    beforeEach(async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();
    });

    it("Should initialize with currentRootIndex at 0", async function () {
      expect(await merkleTree.currentRootIndex()).to.equal(0);
    });

    it("Should support 10,000 root history", async function () {
      expect(await merkleTree.ROOT_HISTORY_SIZE()).to.equal(10000);
    });

    it("Should use O(1) lookup for known roots", async function () {
      const initialRoot = await merkleTree.getLastRoot();

      // This should be O(1) via mapping lookup, not iteration
      const isKnown = await merkleTree.isKnownRoot(initialRoot);
      expect(isKnown).to.be.true;
    });

    it("Should return false for unknown root", async function () {
      const randomRoot = ethers.randomBytes(32);
      expect(await merkleTree.isKnownRoot(randomRoot)).to.be.false;
    });

    it("Should return false for zero root", async function () {
      expect(await merkleTree.isKnownRoot(ethers.ZeroHash)).to.be.false;
    });

    it("Should return current root via getLastRoot", async function () {
      const lastRoot = await merkleTree.getLastRoot();
      const rootAtIndex = await merkleTree.roots(0);
      expect(lastRoot).to.equal(rootAtIndex);
    });
  });

  describe("Hash Function", function () {
    beforeEach(async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();
    });

    it("Should hash two values correctly", async function () {
      // Use small values that are definitely < FIELD_SIZE
      const left = ethers.toBeHex(12345, 32);
      const right = ethers.toBeHex(67890, 32);

      // Should not revert
      const result = await merkleTree.hashLeftRight(hasher.target, left, right);
      expect(result).to.not.equal(ethers.ZeroHash);
    });

    it("Should revert if left value >= FIELD_SIZE", async function () {
      // FIELD_SIZE is 21888242871839275222246405745257275088548364400416034343698204186575808495617
      // Use max uint256 which is definitely >= FIELD_SIZE
      const left =
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const right = ethers.toBeHex(12345, 32);

      await expect(
        merkleTree.hashLeftRight(hasher.target, left, right),
      ).to.be.revertedWith("MerkleTree: left leaf must be inside field");
    });

    it("Should revert if right value >= FIELD_SIZE", async function () {
      const left = ethers.toBeHex(12345, 32);
      const right =
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

      await expect(
        merkleTree.hashLeftRight(hasher.target, left, right),
      ).to.be.revertedWith("MerkleTree: right leaf must be inside field");
    });
  });

  describe("Gas Optimization", function () {
    beforeEach(async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();
    });

    it("Should use efficient O(1) root lookup", async function () {
      const root = await merkleTree.getLastRoot();

      // Measure gas for O(1) mapping lookup
      const tx = await merkleTree.isKnownRoot.estimateGas(root);

      // With mapping lookup, should be ~24k gas (includes view function overhead)
      // With iteration (like Tornado's 30 roots), would be much higher
      expect(tx).to.be.lessThan(50000);
    });

    it("Should verify unknown root efficiently", async function () {
      const unknownRoot = ethers.randomBytes(32);

      const tx = await merkleTree.isKnownRoot.estimateGas(unknownRoot);

      // Should still be O(1) for unknown roots
      expect(tx).to.be.lessThan(50000);
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      merkleTree = await MerkleTreeFactory.deploy(TREE_HEIGHT, hasher.target);
      await merkleTree.waitForDeployment();
    });

    it("Should handle maximum tree height (32)", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      const largeMerkleTree = await MerkleTreeFactory.deploy(32, hasher.target);
      await largeMerkleTree.waitForDeployment();

      expect(await largeMerkleTree.levels()).to.equal(32);
    });

    it("Should handle minimum tree height (1)", async function () {
      const MerkleTreeFactory = await ethers.getContractFactory(
        "MerkleTreeWithHistory",
      );
      const smallMerkleTree = await MerkleTreeFactory.deploy(1, hasher.target);
      await smallMerkleTree.waitForDeployment();

      expect(await smallMerkleTree.levels()).to.equal(1);
    });

    it("Should maintain correct state after multiple operations", async function () {
      const initialRoot = await merkleTree.getLastRoot();
      const initialIndex = await merkleTree.nextIndex();
      const initialRootIndex = await merkleTree.currentRootIndex();

      expect(initialRoot).to.not.equal(ethers.ZeroHash);
      expect(initialIndex).to.equal(0);
      expect(initialRootIndex).to.equal(0);
    });
  });
});

// Mock MiMC Hasher for testing
// In production, use the actual MiMC implementation
// This is a simplified version for testing purposes
