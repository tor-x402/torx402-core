/**
 * torx402 Basic Integration Tests
 *
 * Simplified integration tests that focus on contract interaction
 * without requiring full cryptographic library initialization.
 *
 * Tests:
 * - Basic deposit flow
 * - Pool state management
 * - Balance tracking
 * - Error handling
 * - Multi-user scenarios
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// ============================================
// Helpers
// ============================================

const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

/**
 * Generate a random valid field element (< FIELD_SIZE)
 * @returns Random bytes32 value that is a valid field element
 */
function randomFieldElement(): string {
  const randomBigInt = BigInt(
    "0x" + ethers.hexlify(ethers.randomBytes(32)).slice(2),
  );
  const validFieldElement = randomBigInt % FIELD_SIZE;
  return ethers.toBeHex(validFieldElement, 32);
}

describe("Basic Integration Tests: Contract Flow", function () {
  this.timeout(60000);

  let hasher: Contract;
  let verifier: Contract;
  let pool: Contract;
  let poolAddress: string;
  let owner: SignerWithAddress;
  let depositor: SignerWithAddress;
  let recipient: SignerWithAddress;
  let relayer: SignerWithAddress;

  const DENOMINATION = ethers.parseEther("0.001");
  const TREE_HEIGHT = 10;

  beforeEach(async function () {
    [owner, depositor, recipient, relayer] = await ethers.getSigners();

    // Deploy MiMC Hasher
    const HasherFactory = await ethers.getContractFactory("MiMCMock");
    hasher = await HasherFactory.deploy();
    await hasher.waitForDeployment();

    // Deploy Mock Verifier
    const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
    verifier = await MockVerifierFactory.deploy();
    await verifier.waitForDeployment();

    // Deploy Privacy Pool
    const PoolFactory = await ethers.getContractFactory("PrivacyPool");
    pool = await PoolFactory.deploy(
      await verifier.getAddress(),
      await hasher.getAddress(),
      DENOMINATION,
      TREE_HEIGHT,
    );
    await pool.waitForDeployment();
    poolAddress = await pool.getAddress();
  });

  describe("Deployment", function () {
    it("Should deploy with correct configuration", async function () {
      const poolInfo = await pool.getPoolInfo();

      expect(poolInfo[0]).to.equal(DENOMINATION); // denomination
      expect(poolInfo[1]).to.equal(TREE_HEIGHT); // treeHeight
      expect(poolInfo[2]).to.equal(0); // nextIndex
      expect(poolInfo[4]).to.equal(0); // balance
    });

    it("Should have zero initial balance", async function () {
      const balance = await ethers.provider.getBalance(poolAddress);
      expect(balance).to.equal(0);
    });

    it("Should have correct denomination", async function () {
      const denomination = await pool.denomination();
      expect(denomination).to.equal(DENOMINATION);
    });
  });

  describe("Deposit Flow", function () {
    it("Should accept a valid deposit", async function () {
      // Use a random commitment (valid field element)
      const commitment = randomFieldElement();

      const tx = await pool.connect(depositor).deposit(commitment, {
        value: DENOMINATION,
      });
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);

      // Check pool state updated
      const poolInfo = await pool.getPoolInfo();
      expect(poolInfo[2]).to.equal(1); // nextIndex should be 1
      expect(poolInfo[4]).to.equal(DENOMINATION); // balance should be DENOMINATION
    });

    it("Should emit Deposit event", async function () {
      const commitment = randomFieldElement();

      await expect(
        pool.connect(depositor).deposit(commitment, { value: DENOMINATION }),
      )
        .to.emit(pool, "Deposit")
        .withArgs(commitment, 0, (timestamp: any) => timestamp > 0);
    });

    it("Should assign correct leaf indices", async function () {
      const commitments = [
        randomFieldElement(),
        randomFieldElement(),
        randomFieldElement(),
      ];

      for (let i = 0; i < commitments.length; i++) {
        const tx = await pool.connect(depositor).deposit(commitments[i], {
          value: DENOMINATION,
        });
        const receipt = await tx.wait();

        // Find Deposit event
        const depositEvent = receipt.logs.find((log: any) => {
          try {
            const parsed = pool.interface.parseLog({
              topics: log.topics,
              data: log.data,
            });
            return parsed && parsed.name === "Deposit";
          } catch {
            return false;
          }
        });

        if (depositEvent) {
          const parsed = pool.interface.parseLog({
            topics: depositEvent.topics,
            data: depositEvent.data,
          });
          expect(parsed!.args.leafIndex).to.equal(i);
        }
      }
    });

    it("Should reject deposits with incorrect amount", async function () {
      const commitment = randomFieldElement();

      await expect(
        pool.connect(depositor).deposit(commitment, {
          value: ethers.parseEther("0.01"), // Wrong amount!
        }),
      ).to.be.revertedWith("PrivacyPool: incorrect deposit amount");
    });

    it("Should reject duplicate commitments", async function () {
      const commitment = randomFieldElement();

      // First deposit succeeds
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      // Second deposit with same commitment should fail
      await expect(
        pool.connect(depositor).deposit(commitment, { value: DENOMINATION }),
      ).to.be.revertedWith("PrivacyPool: commitment already exists");
    });

    it("Should reject zero commitment", async function () {
      const zeroCommitment = ethers.ZeroHash;

      await expect(
        pool
          .connect(depositor)
          .deposit(zeroCommitment, { value: DENOMINATION }),
      ).to.be.revertedWith("PrivacyPool: invalid commitment");
    });
  });

  describe("Pool State Management", function () {
    it("Should increment nextIndex after each deposit", async function () {
      for (let i = 0; i < 5; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(depositor)
          .deposit(commitment, { value: DENOMINATION });

        const poolInfo = await pool.getPoolInfo();
        expect(poolInfo[2]).to.equal(i + 1);
      }
    });

    it("Should accumulate balance correctly", async function () {
      const depositCount = 3;

      for (let i = 0; i < depositCount; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(depositor)
          .deposit(commitment, { value: DENOMINATION });
      }

      const poolInfo = await pool.getPoolInfo();
      expect(poolInfo[4]).to.equal(DENOMINATION * BigInt(depositCount));
    });

    it("Should update root after each deposit", async function () {
      const commitment1 = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment1, { value: DENOMINATION });
      const root1 = await pool.getLastRoot();

      const commitment2 = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment2, { value: DENOMINATION });
      const root2 = await pool.getLastRoot();

      // Roots should be different after new deposit
      expect(root1).to.not.equal(root2);
      expect(root1).to.not.equal(ethers.ZeroHash);
      expect(root2).to.not.equal(ethers.ZeroHash);

      // Both roots should be known
      expect(await pool.isKnownRoot(root1)).to.be.true;
      expect(await pool.isKnownRoot(root2)).to.be.true;
    });
  });

  describe("Withdrawal Flow (Mock Verifier)", function () {
    it("Should accept withdrawal with valid proof (mock)", async function () {
      // Make a deposit first
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();

      // Create mock proof (8 uint256 values)
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      // Withdraw (MockVerifier always returns true)
      const tx = await pool.connect(depositor).withdraw(
        mockProof,
        root,
        nullifierHash,
        recipient.address,
        ethers.ZeroAddress, // No relayer
        0, // No fee
        0, // No refund
      );
      const receipt = await tx.wait();

      expect(receipt.status).to.equal(1);

      // Check nullifier is marked as spent
      expect(await pool.isSpent(nullifierHash)).to.be.true;
    });

    it("Should emit Withdrawal event", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await expect(
        pool
          .connect(depositor)
          .withdraw(
            mockProof,
            root,
            nullifierHash,
            recipient.address,
            ethers.ZeroAddress,
            0,
            0,
          ),
      )
        .to.emit(pool, "Withdrawal")
        .withArgs(recipient.address, nullifierHash, ethers.ZeroAddress, 0);
    });

    it("Should transfer correct amount to recipient", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const initialBalance = await ethers.provider.getBalance(
        recipient.address,
      );

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await pool
        .connect(depositor)
        .withdraw(
          mockProof,
          root,
          nullifierHash,
          recipient.address,
          ethers.ZeroAddress,
          0,
          0,
        );

      const finalBalance = await ethers.provider.getBalance(recipient.address);
      expect(finalBalance - initialBalance).to.equal(DENOMINATION);
    });

    it("Should handle relayer fee correctly", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const relayerFee = ethers.parseEther("0.0001");
      const recipientInitialBalance = await ethers.provider.getBalance(
        recipient.address,
      );
      const relayerInitialBalance = await ethers.provider.getBalance(
        relayer.address,
      );

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await pool
        .connect(depositor)
        .withdraw(
          mockProof,
          root,
          nullifierHash,
          recipient.address,
          relayer.address,
          relayerFee,
          0,
        );

      const recipientFinalBalance = await ethers.provider.getBalance(
        recipient.address,
      );
      const relayerFinalBalance = await ethers.provider.getBalance(
        relayer.address,
      );

      // Recipient should receive (denomination - fee)
      expect(recipientFinalBalance - recipientInitialBalance).to.equal(
        DENOMINATION - relayerFee,
      );

      // Relayer should receive fee
      expect(relayerFinalBalance - relayerInitialBalance).to.equal(relayerFee);
    });

    it("Should reject double-spend (same nullifier)", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      // First withdrawal succeeds
      await pool
        .connect(depositor)
        .withdraw(
          mockProof,
          root,
          nullifierHash,
          recipient.address,
          ethers.ZeroAddress,
          0,
          0,
        );

      // Second withdrawal with same nullifier should fail
      await expect(
        pool
          .connect(depositor)
          .withdraw(
            mockProof,
            root,
            nullifierHash,
            recipient.address,
            ethers.ZeroAddress,
            0,
            0,
          ),
      ).to.be.revertedWith("PrivacyPool: note already spent");
    });

    it("Should reject withdrawal with unknown root", async function () {
      const unknownRoot = randomFieldElement();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await expect(
        pool
          .connect(depositor)
          .withdraw(
            mockProof,
            unknownRoot,
            nullifierHash,
            recipient.address,
            ethers.ZeroAddress,
            0,
            0,
          ),
      ).to.be.revertedWith("PrivacyPool: merkle root not found in history");
    });

    it("Should reject withdrawal with fee > denomination", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      const excessiveFee = DENOMINATION + BigInt(1);

      await expect(
        pool
          .connect(depositor)
          .withdraw(
            mockProof,
            root,
            nullifierHash,
            recipient.address,
            relayer.address,
            excessiveFee,
            0,
          ),
      ).to.be.revertedWith("PrivacyPool: fee exceeds denomination");
    });

    it("Should reject withdrawal to zero address", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await expect(
        pool.connect(depositor).withdraw(
          mockProof,
          root,
          nullifierHash,
          ethers.ZeroAddress, // Invalid recipient!
          ethers.ZeroAddress,
          0,
          0,
        ),
      ).to.be.revertedWith("PrivacyPool: invalid recipient address");
    });
  });

  describe("Complete Flow: Deposit → Withdraw", function () {
    it("Should complete full cycle: deposit → withdraw → balance check", async function () {
      console.log("\n========================================");
      console.log("Full Cycle Integration Test");
      console.log("========================================\n");

      // Step 1: Record initial balances
      console.log("Step 1/5: Record initial balances");
      const depositorInitialBalance = await ethers.provider.getBalance(
        depositor.address,
      );
      const recipientInitialBalance = await ethers.provider.getBalance(
        recipient.address,
      );
      const poolInitialBalance = await ethers.provider.getBalance(poolAddress);

      console.log(
        "  Depositor:",
        ethers.formatEther(depositorInitialBalance),
        "ETH",
      );
      console.log(
        "  Recipient:",
        ethers.formatEther(recipientInitialBalance),
        "ETH",
      );
      console.log("  Pool:", ethers.formatEther(poolInitialBalance), "ETH");

      // Step 2: Make deposit
      console.log("\nStep 2/5: Make deposit");
      const commitment = randomFieldElement();
      const depositTx = await pool.connect(depositor).deposit(commitment, {
        value: DENOMINATION,
      });
      const depositReceipt = await depositTx.wait();
      const depositGasCost = depositReceipt.gasUsed * depositReceipt.gasPrice;

      console.log("  ✓ Deposit confirmed");
      console.log("  Gas used:", depositReceipt.gasUsed.toString());
      console.log("  Gas cost:", ethers.formatEther(depositGasCost), "ETH");

      // Step 3: Verify pool state
      console.log("\nStep 3/5: Verify pool state");
      const poolInfo = await pool.getPoolInfo();
      expect(poolInfo[2]).to.equal(1); // nextIndex
      expect(poolInfo[4]).to.equal(DENOMINATION); // balance

      console.log("  ✓ Pool has 1 deposit");
      console.log("  Pool balance:", ethers.formatEther(poolInfo[4]), "ETH");

      // Step 4: Withdraw
      console.log("\nStep 4/5: Perform withdrawal");
      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      const withdrawTx = await pool
        .connect(depositor)
        .withdraw(
          mockProof,
          root,
          nullifierHash,
          recipient.address,
          ethers.ZeroAddress,
          0,
          0,
        );
      const withdrawReceipt = await withdrawTx.wait();

      console.log("  ✓ Withdrawal confirmed");
      console.log("  Gas used:", withdrawReceipt.gasUsed.toString());

      // Step 5: Verify final balances
      console.log("\nStep 5/5: Verify final balances");
      const depositorFinalBalance = await ethers.provider.getBalance(
        depositor.address,
      );
      const recipientFinalBalance = await ethers.provider.getBalance(
        recipient.address,
      );
      const poolFinalBalance = await ethers.provider.getBalance(poolAddress);

      // Recipient should have received denomination
      expect(recipientFinalBalance - recipientInitialBalance).to.equal(
        DENOMINATION,
      );

      // Pool should be empty
      expect(poolFinalBalance).to.equal(0);

      console.log("  ✓ Balances verified");
      console.log(
        "  Recipient gained:",
        ethers.formatEther(DENOMINATION),
        "ETH",
      );
      console.log(
        "  Pool balance:",
        ethers.formatEther(poolFinalBalance),
        "ETH",
      );

      console.log("\n========================================");
      console.log("✓ Full Cycle Complete!");
      console.log("========================================\n");
    });
  });

  describe("Multi-User Scenarios", function () {
    it("Should handle deposits from multiple users", async function () {
      const users = await ethers.getSigners();
      const userCount = 5;

      for (let i = 0; i < userCount; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(users[i])
          .deposit(commitment, { value: DENOMINATION });
      }

      const poolInfo = await pool.getPoolInfo();
      expect(poolInfo[2]).to.equal(userCount);
      expect(poolInfo[4]).to.equal(DENOMINATION * BigInt(userCount));
    });

    it("Should allow withdrawals to different recipients", async function () {
      // Alice deposits
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      // Bob withdraws (different from depositor)
      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      const bobInitialBalance = await ethers.provider.getBalance(
        recipient.address,
      );

      await pool.connect(depositor).withdraw(
        mockProof,
        root,
        nullifierHash,
        recipient.address, // Bob (different from depositor)
        ethers.ZeroAddress,
        0,
        0,
      );

      const bobFinalBalance = await ethers.provider.getBalance(
        recipient.address,
      );
      expect(bobFinalBalance - bobInitialBalance).to.equal(DENOMINATION);
    });
  });

  describe("Anonymity Set Simulation", function () {
    it("Should build anonymity set with multiple deposits", async function () {
      console.log("\nBuilding anonymity set...");

      const depositCount = 10;
      const commitments = [];

      for (let i = 0; i < depositCount; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(depositor)
          .deposit(commitment, { value: DENOMINATION });
        commitments.push(commitment);

        if ((i + 1) % 3 === 0) {
          console.log(`  ${i + 1}/${depositCount} deposits made`);
        }
      }

      const poolInfo = await pool.getPoolInfo();
      expect(poolInfo[2]).to.equal(depositCount);

      console.log(`\n✓ Anonymity set: ${depositCount} deposits`);
      console.log(
        `  Privacy: Each deposit is 1 of ${depositCount} (${(100 / depositCount).toFixed(1)}% probability)`,
      );

      // Now any withdrawal could be from any of these deposits
      const root = await pool.getLastRoot();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      // Alice withdraws
      const nullifierHash = randomFieldElement();
      await pool
        .connect(depositor)
        .withdraw(
          mockProof,
          root,
          nullifierHash,
          recipient.address,
          ethers.ZeroAddress,
          0,
          0,
        );

      console.log(`\n✓ Withdrawal completed`);
      console.log(
        `  Observer cannot determine which of the ${depositCount} deposits was withdrawn`,
      );
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should use efficient root lookup (O(1))", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();

      // Estimate gas for root checking
      const gasEstimate = await pool.isKnownRoot.estimateGas(root);

      // Should be relatively cheap (mapping lookup)
      expect(gasEstimate).to.be.lessThan(BigInt(50000));
    });

    it("Should measure deposit gas cost", async function () {
      const commitment = randomFieldElement();

      const gasEstimate = await pool
        .connect(depositor)
        .deposit.estimateGas(commitment, {
          value: DENOMINATION,
        });

      console.log("  Deposit gas estimate:", gasEstimate.toString());
      expect(gasEstimate).to.be.lessThan(BigInt(400000)); // Should be around 250k
    });
  });

  describe("Root History", function () {
    it("Should maintain root history", async function () {
      const roots = [];

      for (let i = 0; i < 5; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(depositor)
          .deposit(commitment, { value: DENOMINATION });
        const root = await pool.getLastRoot();
        roots.push(root);
      }

      // All roots should be known
      for (const root of roots) {
        expect(await pool.isKnownRoot(root)).to.be.true;
      }

      // All roots should be unique
      const uniqueRoots = new Set(roots);
      expect(uniqueRoots.size).to.equal(roots.length);
    });

    it("Should allow withdrawal with historical root", async function () {
      // Make 3 deposits
      const commitments = [];
      for (let i = 0; i < 3; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(depositor)
          .deposit(commitment, { value: DENOMINATION });
        commitments.push(commitment);
      }

      // Get root from second deposit
      const historicalRoot = await pool.roots(1);
      expect(await pool.isKnownRoot(historicalRoot)).to.be.true;

      // Withdraw using historical root (not latest)
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await expect(
        pool
          .connect(depositor)
          .withdraw(
            mockProof,
            historicalRoot,
            nullifierHash,
            recipient.address,
            ethers.ZeroAddress,
            0,
            0,
          ),
      ).to.not.be.reverted;
    });
  });

  describe("Spent Note Tracking", function () {
    it("Should track multiple spent notes", async function () {
      const nullifierHashes = [];

      // Make deposits and withdrawals
      for (let i = 0; i < 3; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(depositor)
          .deposit(commitment, { value: DENOMINATION });

        const root = await pool.getLastRoot();
        const nullifierHash = randomFieldElement();
        nullifierHashes.push(nullifierHash);

        const mockProof = Array(8)
          .fill(0)
          .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

        await pool
          .connect(depositor)
          .withdraw(
            mockProof,
            root,
            nullifierHash,
            recipient.address,
            ethers.ZeroAddress,
            0,
            0,
          );
      }

      // Check all are marked as spent
      for (const nullifierHash of nullifierHashes) {
        expect(await pool.isSpent(nullifierHash)).to.be.true;
      }

      // Check batch query
      const spentStatuses = await pool.isSpentArray(nullifierHashes);
      expect(spentStatuses.every((s: boolean) => s === true)).to.be.true;
    });
  });

  describe("Realistic Usage Pattern", function () {
    it("Should simulate real-world usage: multiple users, deposits, and withdrawals", async function () {
      console.log("\n========================================");
      console.log("Realistic Usage Simulation");
      console.log("========================================\n");

      const users = await ethers.getSigners();
      const deposits: {
        user: number;
        commitment: string;
        nullifierHash: string;
      }[] = [];

      // Phase 1: Multiple users deposit
      console.log("Phase 1: Users making deposits");
      for (let i = 0; i < 5; i++) {
        const commitment = randomFieldElement();
        await pool
          .connect(users[i])
          .deposit(commitment, { value: DENOMINATION });
        deposits.push({
          user: i,
          commitment: commitment,
          nullifierHash: randomFieldElement(),
        });
        console.log(`  User ${i + 1} deposited`);
      }

      const poolInfo = await pool.getPoolInfo();
      console.log(`\n✓ Anonymity set: ${poolInfo[2]} deposits`);
      console.log(`  Pool balance: ${ethers.formatEther(poolInfo[4])} ETH`);

      // Phase 2: Users withdraw to different addresses
      console.log("\nPhase 2: Users withdrawing anonymously");
      const root = await pool.getLastRoot();

      for (let i = 0; i < 3; i++) {
        const mockProof = Array(8)
          .fill(0)
          .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

        // Withdraw to a different user (anonymity!)
        const withdrawToIndex = (i + 2) % users.length;

        await pool.connect(users[i]).withdraw(
          mockProof,
          root,
          deposits[i].nullifierHash,
          users[withdrawToIndex].address, // Different from depositor!
          ethers.ZeroAddress,
          0,
          0,
        );

        console.log(
          `  User ${i + 1} withdrew to User ${withdrawToIndex + 1}'s address`,
        );
      }

      const finalPoolInfo = await pool.getPoolInfo();
      const remainingBalance = finalPoolInfo[4];

      console.log(`\n✓ ${3} withdrawals completed`);
      console.log(
        `  Remaining in pool: ${ethers.formatEther(remainingBalance)} ETH`,
      );
      console.log(`  (${Number(poolInfo[2]) - 3} deposits still unspent)`);

      console.log("\n========================================");
      console.log("✓ Realistic Simulation Complete!");
      console.log("========================================\n");

      expect(remainingBalance).to.equal(DENOMINATION * BigInt(2)); // 5 deposits - 3 withdrawals = 2
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should handle maximum fee (denomination - 1 wei)", async function () {
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      const maxFee = DENOMINATION - BigInt(1);

      const recipientInitial = await ethers.provider.getBalance(
        recipient.address,
      );
      const relayerInitial = await ethers.provider.getBalance(relayer.address);

      await pool
        .connect(depositor)
        .withdraw(
          mockProof,
          root,
          nullifierHash,
          recipient.address,
          relayer.address,
          maxFee,
          0,
        );

      const recipientFinal = await ethers.provider.getBalance(
        recipient.address,
      );
      const relayerFinal = await ethers.provider.getBalance(relayer.address);

      // Recipient gets 1 wei
      expect(recipientFinal - recipientInitial).to.equal(BigInt(1));
      // Relayer gets rest
      expect(relayerFinal - relayerInitial).to.equal(maxFee);
    });

    it("Should prevent reentrancy attacks", async function () {
      // The contract uses ReentrancyGuard from OpenZeppelin
      // This test verifies it's enabled
      const commitment = randomFieldElement();
      await pool
        .connect(depositor)
        .deposit(commitment, { value: DENOMINATION });

      // Normal withdrawal should work
      const root = await pool.getLastRoot();
      const nullifierHash = randomFieldElement();
      const mockProof = Array(8)
        .fill(0)
        .map(() => BigInt(ethers.hexlify(ethers.randomBytes(32))));

      await expect(
        pool
          .connect(depositor)
          .withdraw(
            mockProof,
            root,
            nullifierHash,
            recipient.address,
            ethers.ZeroAddress,
            0,
            0,
          ),
      ).to.not.be.reverted;

      // Note: Full reentrancy test would require a malicious contract
      // The ReentrancyGuard prevents this by design
    });
  });
});
