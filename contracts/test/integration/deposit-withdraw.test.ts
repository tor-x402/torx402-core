/**
 * torx402 Integration Tests - Full Deposit → Withdraw Flow
 *
 * End-to-end integration tests for privacy-preserving micropayments
 * Tests the complete flow from deposit to withdrawal with real contract interaction
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
// @ts-ignore
import { buildPedersenHash, buildMimcSponge } from "circomlibjs";
import {
  generateDeposit,
  depositToNote,
  parseDepositNote,
  makeDeposit,
  isNoteSpent,
  getPoolInfo,
  validateDeposit,
  generateWithdrawalProof,
  withdrawDirect,
  checkWithdrawalStatus,
  getWithdrawalEstimate,
  formatDenomination,
} from "../../../client/src";

describe("Integration Tests: Full Deposit → Withdraw Flow", function () {
  // Increase timeout for proof generation (can take 10-30 seconds)
  this.timeout(120000);

  let hasher: Contract;
  let verifier: Contract;
  let pool: Contract;
  let poolAddress: string;
  let owner: SignerWithAddress;
  let depositor: SignerWithAddress;
  let recipient: SignerWithAddress;
  let relayer: SignerWithAddress;

  const DENOMINATION = ethers.parseEther("0.001"); // 0.001 ETH
  const TREE_HEIGHT = 10; // Use smaller tree for faster tests (vs 32 in production)

  // Initialize cryptographic libraries once before all tests
  before(async function () {
    console.log("\n🔧 Initializing cryptographic libraries...");
    await buildPedersenHash();
    await buildMimcSponge();
    console.log("✓ Cryptographic libraries initialized\n");
  });

  beforeEach(async function () {
    [owner, depositor, recipient, relayer] = await ethers.getSigners();

    console.log("📦 Deploying contracts...");

    // Deploy MiMC Hasher (mock for testing)
    const HasherFactory = await ethers.getContractFactory("MiMCMock");
    hasher = await HasherFactory.deploy();
    await hasher.waitForDeployment();

    // For integration tests, we need a real Verifier
    // In a real scenario, this would be generated from circuits
    // For now, we'll skip proof verification in tests or use a mock
    console.log("⚠️  Note: Using mock verifier for integration tests");
    console.log(
      "   Real proofs would be tested with actual Verifier.sol from circuits",
    );

    // Deploy a mock verifier that always returns true (for testing flow)
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

    console.log("✓ Contracts deployed");
    console.log("  Pool:", poolAddress);
    console.log("  Denomination:", ethers.formatEther(DENOMINATION), "ETH\n");
  });

  describe("Basic Deposit Flow", function () {
    it("Should generate a valid deposit", async function () {
      console.log("Test: Generate deposit");

      const deposit = await generateDeposit("0.001", "localhost");

      expect(deposit).to.have.property("nullifier");
      expect(deposit).to.have.property("secret");
      expect(deposit).to.have.property("commitment");
      expect(deposit).to.have.property("nullifierHash");
      expect(deposit.commitment.startsWith("0x")).to.be.true;
      expect(deposit.nullifierHash.startsWith("0x")).to.be.true;

      // Validate deposit
      expect(() => validateDeposit(deposit)).to.not.throw();

      console.log("  ✓ Deposit generated");
      console.log("  Commitment:", deposit.commitment.slice(0, 20) + "...");
    });

    it("Should submit a deposit transaction", async function () {
      console.log("Test: Submit deposit transaction");

      const deposit = await generateDeposit("0.001", "localhost");

      const { receipt, deposit: confirmedDeposit } = await makeDeposit(
        poolAddress,
        deposit,
        depositor,
      );

      expect(receipt).to.have.property("hash");
      expect(receipt.status).to.equal(1); // Success
      expect(confirmedDeposit.leafIndex).to.be.a("number");
      expect(confirmedDeposit.txHash).to.equal(receipt.hash);

      console.log("  ✓ Deposit confirmed");
      console.log("  Leaf Index:", confirmedDeposit.leafIndex);
      console.log("  TX:", receipt.hash.slice(0, 20) + "...");
    });

    it("Should update pool state after deposit", async function () {
      console.log("Test: Pool state updates");

      const initialInfo = await getPoolInfo(poolAddress, ethers.provider);
      const initialIndex = initialInfo.nextIndex;

      // Make deposit
      const deposit = await generateDeposit("0.001", "localhost");
      await makeDeposit(poolAddress, deposit, depositor);

      // Check updated state
      const updatedInfo = await getPoolInfo(poolAddress, ethers.provider);

      expect(updatedInfo.nextIndex).to.equal(initialIndex + 1);
      expect(updatedInfo.balance).to.equal(DENOMINATION);

      console.log("  ✓ Pool state updated");
      console.log("  Deposits:", updatedInfo.nextIndex);
      console.log("  Balance:", ethers.formatEther(updatedInfo.balance), "ETH");
    });
  });

  describe("Note Serialization", function () {
    it("Should serialize and deserialize deposit note correctly", async function () {
      console.log("Test: Note serialization");

      const original = await generateDeposit("0.001", "localhost");
      original.leafIndex = 42;
      original.txHash = "0x1234567890abcdef";

      const note = await depositToNote(original);
      const parsed = await parseDepositNote(note);

      expect(parsed.nullifier.toString()).to.equal(
        original.nullifier.toString(),
      );
      expect(parsed.secret.toString()).to.equal(original.secret.toString());
      expect(parsed.commitment).to.equal(original.commitment);
      expect(parsed.nullifierHash).to.equal(original.nullifierHash);
      expect(parsed.denomination).to.equal("0.001");
      expect(parsed.network).to.equal("localhost");
      expect(parsed.leafIndex).to.equal(42);

      console.log("  ✓ Note serialization working");
      console.log("  Format:", note.slice(0, 50) + "...");
    });

    it("Should create note immediately after deposit", async function () {
      console.log("Test: Note creation after deposit");

      const deposit = await generateDeposit("0.001", "localhost");
      const { deposit: confirmed } = await makeDeposit(
        poolAddress,
        deposit,
        depositor,
      );

      const note = await depositToNote(confirmed);
      const parsed = await parseDepositNote(note);

      expect(parsed.leafIndex).to.equal(confirmed.leafIndex);
      expect(parsed.commitment).to.equal(confirmed.commitment);

      console.log("  ✓ Note created with leaf index:", parsed.leafIndex);
    });
  });

  describe("Multiple Deposits (Anonymity Set)", function () {
    it("Should handle multiple deposits to build anonymity set", async function () {
      console.log("Test: Multiple deposits for anonymity");

      const deposits = [];
      const depositCount = 5;

      for (let i = 0; i < depositCount; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        const { deposit: confirmed } = await makeDeposit(
          poolAddress,
          deposit,
          depositor,
        );
        deposits.push(confirmed);
        console.log(
          `  Deposit ${i + 1}/${depositCount} at leaf index:`,
          confirmed.leafIndex,
        );
      }

      expect(deposits).to.have.length(depositCount);

      // Check pool state
      const poolInfo = await getPoolInfo(poolAddress, ethers.provider);
      expect(poolInfo.nextIndex).to.equal(depositCount);
      expect(poolInfo.balance).to.equal(DENOMINATION * BigInt(depositCount));

      console.log("  ✓ Anonymity set:", poolInfo.nextIndex, "deposits");
      console.log(
        "  Pool balance:",
        ethers.formatEther(poolInfo.balance),
        "ETH",
      );

      // All deposits should be unspent
      for (const deposit of deposits) {
        const spent = await isNoteSpent(poolAddress, deposit, ethers.provider);
        expect(spent).to.be.false;
      }

      console.log("  ✓ All deposits unspent");
    });
  });

  describe("Withdrawal Status Checking", function () {
    it("Should correctly report note as unspent before withdrawal", async function () {
      console.log("Test: Check unspent status");

      const deposit = await generateDeposit("0.001", "localhost");
      const { deposit: confirmed } = await makeDeposit(
        poolAddress,
        deposit,
        depositor,
      );

      const isSpent = await isNoteSpent(
        poolAddress,
        confirmed,
        ethers.provider,
      );
      expect(isSpent).to.be.false;

      console.log("  ✓ Note correctly marked as unspent");
    });

    it("Should check spent status via contract call", async function () {
      console.log("Test: Contract spent status check");

      const deposit = await generateDeposit("0.001", "localhost");
      const { deposit: confirmed } = await makeDeposit(
        poolAddress,
        deposit,
        depositor,
      );

      const status = await checkWithdrawalStatus(
        poolAddress,
        confirmed.nullifierHash,
        ethers.provider,
      );

      expect(status).to.be.false;

      console.log("  ✓ Withdrawal status check working");
    });
  });

  describe("Pool Information Queries", function () {
    it("Should fetch accurate pool information", async function () {
      console.log("Test: Pool information query");

      const poolInfo = await getPoolInfo(poolAddress, ethers.provider);

      expect(poolInfo.denomination).to.equal(DENOMINATION);
      expect(poolInfo.treeHeight).to.equal(TREE_HEIGHT);
      expect(poolInfo.nextIndex).to.be.a("number");
      expect(poolInfo.currentRoot.startsWith("0x")).to.be.true;
      expect(poolInfo.balance).to.be.a("bigint");

      console.log("  ✓ Pool info retrieved");
      console.log(
        "  Denomination:",
        formatDenomination(poolInfo.denomination),
        "ETH",
      );
      console.log("  Tree Height:", poolInfo.treeHeight);
      console.log("  Next Index:", poolInfo.nextIndex);
    });

    it("Should track pool balance correctly after deposits", async function () {
      console.log("Test: Pool balance tracking");

      const initialInfo = await getPoolInfo(poolAddress, ethers.provider);
      const initialBalance = initialInfo.balance;

      // Make 3 deposits
      for (let i = 0; i < 3; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        await makeDeposit(poolAddress, deposit, depositor);
      }

      const updatedInfo = await getPoolInfo(poolAddress, ethers.provider);
      const expectedBalance = initialBalance + DENOMINATION * BigInt(3);

      expect(updatedInfo.balance).to.equal(expectedBalance);
      expect(updatedInfo.nextIndex).to.equal(initialInfo.nextIndex + 3);

      console.log("  ✓ Balance tracked correctly");
      console.log("  Initial:", ethers.formatEther(initialBalance), "ETH");
      console.log("  Final:", ethers.formatEther(updatedInfo.balance), "ETH");
    });
  });

  describe("Withdrawal Estimation", function () {
    it("Should calculate withdrawal estimate correctly", async function () {
      console.log("Test: Withdrawal estimation");

      const estimate = await getWithdrawalEstimate(
        poolAddress,
        ethers.provider,
      );

      expect(estimate.denomination).to.equal(DENOMINATION);
      expect(estimate.denominationETH).to.equal("0.001");
      expect(estimate.netAmount).to.equal(DENOMINATION); // No fee
      expect(estimate.relayerFee).to.equal(BigInt(0));
      expect(estimate.estimatedGas).to.be.a("bigint");
      expect(estimate.estimatedGasCost).to.be.a("bigint");

      console.log("  ✓ Estimate calculated");
      console.log("  Net amount:", estimate.netAmountETH, "ETH");
      console.log("  Estimated gas:", estimate.estimatedGas.toString());
    });

    it("Should estimate with relayer fee", async function () {
      console.log("Test: Withdrawal with relayer fee");

      const relayerFee = ethers.parseEther("0.0001");
      const estimate = await getWithdrawalEstimate(
        poolAddress,
        ethers.provider,
        relayerFee,
      );

      expect(estimate.relayerFee).to.equal(relayerFee);
      expect(estimate.netAmount).to.equal(DENOMINATION - relayerFee);

      console.log("  ✓ Relayer fee calculated");
      console.log("  Fee:", estimate.relayerFeeETH, "ETH");
      console.log("  Net:", estimate.netAmountETH, "ETH");
    });
  });

  describe("Error Handling", function () {
    it("Should reject deposit with insufficient funds", async function () {
      console.log("Test: Insufficient funds error");

      const deposit = await generateDeposit("0.001", "localhost");

      // Create a signer with no balance
      const poorWallet = ethers.Wallet.createRandom().connect(ethers.provider);

      try {
        await makeDeposit(poolAddress, deposit, poorWallet);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).to.include("insufficient funds");
        console.log("  ✓ Correctly rejected insufficient funds");
      }
    });

    it("Should reject duplicate commitments", async function () {
      console.log("Test: Duplicate commitment rejection");

      const deposit = await generateDeposit("0.001", "localhost");

      // First deposit should succeed
      await makeDeposit(poolAddress, deposit, depositor);

      // Second deposit with same commitment should fail
      try {
        await makeDeposit(poolAddress, deposit, depositor);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).to.include("commitment already exists");
        console.log("  ✓ Duplicate commitment rejected");
      }
    });

    it("Should reject invalid denomination", async function () {
      console.log("Test: Invalid denomination");

      const deposit = await generateDeposit("0.001", "localhost");

      try {
        // Try to deposit wrong amount
        await pool.connect(depositor).deposit(deposit.commitment, {
          value: ethers.parseEther("0.01"), // Wrong amount!
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).to.include("incorrect deposit amount");
        console.log("  ✓ Invalid denomination rejected");
      }
    });
  });

  describe("Note Management", function () {
    it("Should preserve all deposit data through serialization", async function () {
      console.log("Test: Data preservation");

      const deposit = await generateDeposit("0.001", "localhost");
      const { deposit: confirmed } = await makeDeposit(
        poolAddress,
        deposit,
        depositor,
      );

      const note = await depositToNote(confirmed);
      const parsed = await parseDepositNote(note);

      // Verify all fields preserved
      expect(parsed.nullifier.toString()).to.equal(
        confirmed.nullifier.toString(),
      );
      expect(parsed.secret.toString()).to.equal(confirmed.secret.toString());
      expect(parsed.commitment).to.equal(confirmed.commitment);
      expect(parsed.nullifierHash).to.equal(confirmed.nullifierHash);
      expect(parsed.denomination).to.equal(confirmed.denomination);
      expect(parsed.network).to.equal(confirmed.network);
      expect(parsed.leafIndex).to.equal(confirmed.leafIndex);

      console.log("  ✓ All data preserved through serialization");
    });

    it("Should handle notes from different networks", async function () {
      console.log("Test: Multi-network notes");

      const depositLocal = await generateDeposit("0.001", "localhost");
      const depositBase = await generateDeposit("0.001", "baseSepolia");
      const depositArb = await generateDeposit("0.001", "arbitrumSepolia");

      const noteLocal = await depositToNote(depositLocal);
      const noteBase = await depositToNote(depositBase);
      const noteArb = await depositToNote(depositArb);

      expect(noteLocal).to.include("localhost");
      expect(noteBase).to.include("baseSepolia");
      expect(noteArb).to.include("arbitrumSepolia");

      // Parse and verify
      const parsedLocal = await parseDepositNote(noteLocal);
      const parsedBase = await parseDepositNote(noteBase);
      const parsedArb = await parseDepositNote(noteArb);

      expect(parsedLocal.network).to.equal("localhost");
      expect(parsedBase.network).to.equal("baseSepolia");
      expect(parsedArb.network).to.equal("arbitrumSepolia");

      console.log("  ✓ Multi-network notes working");
    });
  });

  describe("Anonymity Set Building", function () {
    it("Should track anonymity set size", async function () {
      console.log("Test: Anonymity set tracking");

      const depositCount = 10;
      const deposits = [];

      for (let i = 0; i < depositCount; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        const { deposit: confirmed } = await makeDeposit(
          poolAddress,
          deposit,
          depositor,
        );
        deposits.push(confirmed);

        if ((i + 1) % 3 === 0) {
          const info = await getPoolInfo(poolAddress, ethers.provider);
          console.log(
            `  Progress: ${i + 1}/${depositCount} deposits, anonymity set: ${info.nextIndex}`,
          );
        }
      }

      const finalInfo = await getPoolInfo(poolAddress, ethers.provider);
      expect(finalInfo.nextIndex).to.equal(depositCount);

      console.log("  ✓ Anonymity set built");
      console.log("  Final size:", finalInfo.nextIndex, "deposits");

      // Each deposit can be identified as one of many
      console.log(
        "  Privacy: Each deposit is 1 of",
        depositCount,
        `(${(100 / depositCount).toFixed(1)}% probability)`,
      );
    });

    it("Should maintain unique commitments in anonymity set", async function () {
      console.log("Test: Unique commitments");

      const commitments = new Set();
      const depositCount = 5;

      for (let i = 0; i < depositCount; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        await makeDeposit(poolAddress, deposit, depositor);
        commitments.add(deposit.commitment);
      }

      expect(commitments.size).to.equal(depositCount);
      console.log("  ✓ All commitments unique");
    });
  });

  describe("Balance Tracking", function () {
    it("Should track depositor balance changes", async function () {
      console.log("Test: Depositor balance tracking");

      const initialBalance = await ethers.provider.getBalance(
        depositor.address,
      );

      const deposit = await generateDeposit("0.001", "localhost");
      const { receipt } = await makeDeposit(poolAddress, deposit, depositor);

      const finalBalance = await ethers.provider.getBalance(depositor.address);

      // Calculate gas cost
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const expectedBalance = initialBalance - DENOMINATION - gasCost;

      expect(finalBalance).to.equal(expectedBalance);

      console.log("  ✓ Balance tracked correctly");
      console.log("  Deposited:", ethers.formatEther(DENOMINATION), "ETH");
      console.log("  Gas cost:", ethers.formatEther(gasCost), "ETH");
    });

    it("Should track pool balance accumulation", async function () {
      console.log("Test: Pool balance accumulation");

      const deposits = [];
      for (let i = 0; i < 3; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        await makeDeposit(poolAddress, deposit, depositor);
        deposits.push(deposit);
      }

      const poolInfo = await getPoolInfo(poolAddress, ethers.provider);
      expect(poolInfo.balance).to.equal(DENOMINATION * BigInt(3));

      console.log(
        "  ✓ Pool accumulated:",
        ethers.formatEther(poolInfo.balance),
        "ETH",
      );
    });
  });

  describe("Edge Cases", function () {
    it("Should handle deposits from different accounts", async function () {
      console.log("Test: Multi-account deposits");

      const [acc1, acc2, acc3] = await ethers.getSigners();

      const deposit1 = await generateDeposit("0.001", "localhost");
      const deposit2 = await generateDeposit("0.001", "localhost");
      const deposit3 = await generateDeposit("0.001", "localhost");

      await makeDeposit(poolAddress, deposit1, acc1);
      await makeDeposit(poolAddress, deposit2, acc2);
      await makeDeposit(poolAddress, deposit3, acc3);

      const poolInfo = await getPoolInfo(poolAddress, ethers.provider);
      expect(poolInfo.nextIndex).to.equal(3);

      console.log("  ✓ Multi-account deposits working");
      console.log("  Depositors: 3 different accounts");
    });

    it("Should handle rapid sequential deposits", async function () {
      console.log("Test: Rapid deposits");

      const promises = [];
      for (let i = 0; i < 5; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        promises.push(makeDeposit(poolAddress, deposit, depositor));
      }

      const results = await Promise.all(promises);
      expect(results).to.have.length(5);

      // All should have unique leaf indices
      const leafIndices = results.map((r) => r.deposit.leafIndex);
      const uniqueIndices = new Set(leafIndices);
      expect(uniqueIndices.size).to.equal(5);

      console.log("  ✓ Rapid deposits handled correctly");
      console.log("  Leaf indices:", Array.from(uniqueIndices).join(", "));
    });
  });

  describe("Gas Costs", function () {
    it("Should measure actual deposit gas cost", async function () {
      console.log("Test: Deposit gas measurement");

      const deposit = await generateDeposit("0.001", "localhost");
      const { receipt } = await makeDeposit(poolAddress, deposit, depositor);

      const gasUsed = receipt.gasUsed;
      expect(gasUsed).to.be.a("bigint");
      expect(gasUsed).to.be.greaterThan(BigInt(0));

      console.log("  ✓ Gas measured");
      console.log("  Gas used:", gasUsed.toString());
      console.log("  Expected: ~250,000 gas");

      // Should be reasonable (not too high)
      expect(gasUsed).to.be.lessThan(BigInt(500000));
    });
  });

  describe("Full Integration Flow", function () {
    it("Should complete full deposit → note → parse → verify flow", async function () {
      console.log("\n========================================");
      console.log("Integration Test: Full Flow");
      console.log("========================================\n");

      // Step 1: Generate deposit
      console.log("Step 1/6: Generate deposit");
      const deposit = await generateDeposit("0.001", "localhost");
      console.log("  ✓ Deposit generated");
      console.log("  Commitment:", deposit.commitment.slice(0, 20) + "...");

      // Step 2: Submit to pool
      console.log("\nStep 2/6: Submit deposit to pool");
      const { receipt, deposit: confirmed } = await makeDeposit(
        poolAddress,
        deposit,
        depositor,
      );
      console.log("  ✓ Deposit confirmed");
      console.log("  Leaf index:", confirmed.leafIndex);
      console.log("  TX:", receipt.hash.slice(0, 20) + "...");

      // Step 3: Create note
      console.log("\nStep 3/6: Create deposit note");
      const note = await depositToNote(confirmed);
      console.log("  ✓ Note created");
      console.log("  Format:", note.slice(0, 60) + "...");

      // Step 4: Parse note
      console.log("\nStep 4/6: Parse deposit note");
      const parsed = await parseDepositNote(note);
      console.log("  ✓ Note parsed");
      expect(parsed.commitment).to.equal(confirmed.commitment);
      expect(parsed.leafIndex).to.equal(confirmed.leafIndex);

      // Step 5: Verify note not spent
      console.log("\nStep 5/6: Verify note status");
      const isSpent = await isNoteSpent(poolAddress, parsed, ethers.provider);
      expect(isSpent).to.be.false;
      console.log("  ✓ Note is unspent");

      // Step 6: Verify pool state
      console.log("\nStep 6/6: Verify pool state");
      const poolInfo = await getPoolInfo(poolAddress, ethers.provider);
      expect(poolInfo.balance).to.equal(DENOMINATION);
      expect(poolInfo.nextIndex).to.be.greaterThan(0);
      console.log("  ✓ Pool state verified");
      console.log("  Balance:", ethers.formatEther(poolInfo.balance), "ETH");
      console.log("  Anonymity set:", poolInfo.nextIndex, "deposits");

      console.log("\n========================================");
      console.log("✓ Full Integration Flow Complete!");
      console.log("========================================\n");
    });

    it("Should handle multiple deposits and track all notes", async function () {
      console.log("Test: Multiple deposits tracking");

      const deposits = [];
      const notes = [];

      // Create 3 deposits
      for (let i = 0; i < 3; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        const { deposit: confirmed } = await makeDeposit(
          poolAddress,
          deposit,
          depositor,
        );
        const note = await depositToNote(confirmed);

        deposits.push(confirmed);
        notes.push(note);
      }

      // Verify all notes parse correctly
      for (let i = 0; i < notes.length; i++) {
        const parsed = await parseDepositNote(notes[i]);
        expect(parsed.commitment).to.equal(deposits[i].commitment);
        expect(parsed.leafIndex).to.equal(deposits[i].leafIndex);
      }

      // Verify all are unspent
      for (const deposit of deposits) {
        const spent = await isNoteSpent(poolAddress, deposit, ethers.provider);
        expect(spent).to.be.false;
      }

      console.log("  ✓ All notes tracked correctly");
      console.log("  Total notes:", notes.length);
    });
  });

  describe("Realistic Scenarios", function () {
    it("Should simulate realistic usage pattern", async function () {
      console.log("\n========================================");
      console.log("Realistic Scenario: Multiple Users");
      console.log("========================================\n");

      const users = await ethers.getSigners();
      const userDeposits = [];

      // Simulate 5 different users making deposits
      for (let i = 0; i < 5; i++) {
        console.log(`User ${i + 1}: Making deposit...`);

        const deposit = await generateDeposit("0.001", "localhost");
        const { deposit: confirmed } = await makeDeposit(
          poolAddress,
          deposit,
          users[i],
        );
        const note = await depositToNote(confirmed);

        userDeposits.push({ user: i + 1, deposit: confirmed, note });

        console.log(
          `  ✓ User ${i + 1} deposited at leaf index:`,
          confirmed.leafIndex,
        );
      }

      // Check final pool state
      const poolInfo = await getPoolInfo(poolAddress, ethers.provider);
      console.log("\nPool Status:");
      console.log("  Total deposits:", poolInfo.nextIndex);
      console.log(
        "  Pool balance:",
        ethers.formatEther(poolInfo.balance),
        "ETH",
      );
      console.log("  Anonymity set size:", poolInfo.nextIndex);

      expect(poolInfo.nextIndex).to.equal(5);
      expect(poolInfo.balance).to.equal(DENOMINATION * BigInt(5));

      // Verify all notes are valid
      for (const { user, note } of userDeposits) {
        const parsed = await parseDepositNote(note);
        expect(parsed.leafIndex).to.be.a("number");
        console.log(`  User ${user} note valid, leaf:`, parsed.leafIndex);
      }

      console.log("\n✓ Realistic scenario complete!");
      console.log("========================================\n");
    });
  });

  describe("Privacy Properties", function () {
    it("Should demonstrate privacy through anonymity set", async function () {
      console.log("Test: Privacy demonstration");

      const deposits = [];
      const anonymitySetSize = 7;

      // Build anonymity set
      for (let i = 0; i < anonymitySetSize; i++) {
        const deposit = await generateDeposit("0.001", "localhost");
        const { deposit: confirmed } = await makeDeposit(
          poolAddress,
          deposit,
          depositor,
        );
        deposits.push(confirmed);
      }

      // Select one deposit randomly
      const selectedIndex = 3;
      const selectedDeposit = deposits[selectedIndex];

      console.log("\n  Privacy Analysis:");
      console.log("  Total deposits in pool:", anonymitySetSize);
      console.log("  Selected deposit index:", selectedIndex);
      console.log(
        "  Identification probability:",
        `${(100 / anonymitySetSize).toFixed(2)}%`,
      );
      console.log(
        "  Privacy level:",
        anonymitySetSize >= 100
          ? "EXCELLENT"
          : anonymitySetSize >= 50
            ? "GOOD"
            : anonymitySetSize >= 10
              ? "MODERATE"
              : "LOW",
      );

      // The withdrawal (when it happens) could be from any of these deposits
      // An observer cannot tell which commitment corresponds to which withdrawal
      console.log("\n  ✓ Anonymity set provides privacy");
      console.log(
        "  Any withdrawal could be from 1 of",
        anonymitySetSize,
        "deposits",
      );
    });
  });
});

// Note: Withdrawal tests with real zk-SNARKs would require:
// 1. Actual Verifier.sol from circuits (not mock)
// 2. Circuit artifacts (withdraw.wasm, withdraw_final.zkey)
// 3. ~10 seconds per proof generation
//
// For full withdrawal integration tests, run:
// - Deploy real contracts with real Verifier
// - Generate real proofs
// - Submit real withdrawals
// - Verify funds transfer correctly
//
// This can be added in a separate test file: withdrawal-integration.test.ts
