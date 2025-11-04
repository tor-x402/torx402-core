/**
 * torx402 Integration Test Helpers
 *
 * Utility functions for integration testing
 * - Contract deployment helpers
 * - Test environment setup
 * - Common test utilities
 */

import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

// ============================================
// Types
// ============================================

export interface TestContracts {
  hasher: Contract;
  verifier: Contract;
  pool: Contract;
  poolAddress: string;
  hasherAddress: string;
  verifierAddress: string;
}

export interface TestAccounts {
  owner: SignerWithAddress;
  depositor: SignerWithAddress;
  recipient: SignerWithAddress;
  relayer: SignerWithAddress;
  users: SignerWithAddress[];
}

export interface TestConfig {
  denomination: bigint;
  treeHeight: number;
  network: string;
}

// ============================================
// Contract Deployment Helpers
// ============================================

/**
 * Deploy all contracts needed for testing
 *
 * @param denomination - Pool denomination in wei
 * @param treeHeight - Merkle tree height (default: 10 for faster tests)
 * @param useMockVerifier - Use mock verifier instead of real one
 * @returns Deployed contract instances
 */
export async function deployTestContracts(
  denomination: bigint = ethers.parseEther('0.001'),
  treeHeight: number = 10,
  useMockVerifier: boolean = true
): Promise<TestContracts> {
  console.log('  Deploying test contracts...');

  // Deploy MiMC Hasher (mock)
  const HasherFactory = await ethers.getContractFactory('MiMCMock');
  const hasher = await HasherFactory.deploy();
  await hasher.waitForDeployment();
  const hasherAddress = await hasher.getAddress();

  console.log('    ✓ Hasher deployed:', hasherAddress.slice(0, 10) + '...');

  // Deploy Verifier (mock or real)
  let verifier: Contract;
  let verifierAddress: string;

  if (useMockVerifier) {
    const MockVerifierFactory = await ethers.getContractFactory('MockVerifier');
    verifier = await MockVerifierFactory.deploy();
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log('    ✓ Mock Verifier deployed:', verifierAddress.slice(0, 10) + '...');
  } else {
    const VerifierFactory = await ethers.getContractFactory('Verifier');
    verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log('    ✓ Real Verifier deployed:', verifierAddress.slice(0, 10) + '...');
  }

  // Deploy Privacy Pool
  const PoolFactory = await ethers.getContractFactory('PrivacyPool');
  const pool = await PoolFactory.deploy(verifierAddress, hasherAddress, denomination, treeHeight);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();

  console.log('    ✓ Privacy Pool deployed:', poolAddress.slice(0, 10) + '...');
  console.log('      Denomination:', ethers.formatEther(denomination), 'ETH');
  console.log('      Tree Height:', treeHeight);

  return {
    hasher,
    verifier,
    pool,
    poolAddress,
    hasherAddress,
    verifierAddress,
  };
}

/**
 * Get test account signers
 *
 * @returns Test accounts
 */
export async function getTestAccounts(): Promise<TestAccounts> {
  const signers = await ethers.getSigners();

  return {
    owner: signers[0],
    depositor: signers[1],
    recipient: signers[2],
    relayer: signers[3],
    users: signers.slice(4),
  };
}

// ============================================
// Test Environment Setup
// ============================================

/**
 * Setup complete test environment
 *
 * @param config - Test configuration
 * @returns Contracts and accounts
 */
export async function setupTestEnvironment(config?: Partial<TestConfig>): Promise<{
  contracts: TestContracts;
  accounts: TestAccounts;
  config: TestConfig;
}> {
  const defaultConfig: TestConfig = {
    denomination: ethers.parseEther('0.001'),
    treeHeight: 10,
    network: 'localhost',
  };

  const finalConfig = { ...defaultConfig, ...config };

  const contracts = await deployTestContracts(
    finalConfig.denomination,
    finalConfig.treeHeight,
    true // Use mock verifier by default
  );

  const accounts = await getTestAccounts();

  return {
    contracts,
    accounts,
    config: finalConfig,
  };
}

// ============================================
// Balance Tracking
// ============================================

/**
 * Get ETH balance of an address
 *
 * @param address - Address to check
 * @returns Balance in wei
 */
export async function getBalance(address: string): Promise<bigint> {
  return await ethers.provider.getBalance(address);
}

/**
 * Track balance changes during transaction
 *
 * @param address - Address to track
 * @param txPromise - Transaction promise
 * @returns Balance change (negative if spent, positive if received)
 */
export async function trackBalanceChange(
  address: string,
  txPromise: Promise<any>
): Promise<{ balanceChange: bigint; gasCost: bigint; receipt: any }> {
  const initialBalance = await getBalance(address);
  const receipt = await txPromise;
  const finalBalance = await getBalance(address);

  const gasCost = receipt.gasUsed * receipt.gasPrice;
  const balanceChange = finalBalance - initialBalance;

  return {
    balanceChange,
    gasCost,
    receipt,
  };
}

// ============================================
// Pool State Helpers
// ============================================

/**
 * Get current pool state
 *
 * @param pool - Pool contract
 * @returns Pool state information
 */
export async function getPoolState(pool: Contract): Promise<{
  denomination: bigint;
  treeHeight: number;
  nextIndex: number;
  currentRoot: string;
  balance: bigint;
}> {
  const info = await pool.getPoolInfo();

  return {
    denomination: info[0],
    treeHeight: Number(info[1]),
    nextIndex: Number(info[2]),
    currentRoot: info[3],
    balance: info[4],
  };
}

/**
 * Wait for pool to have a certain number of deposits
 *
 * @param pool - Pool contract
 * @param targetCount - Target deposit count
 * @param timeoutMs - Timeout in milliseconds
 */
export async function waitForDeposits(
  pool: Contract,
  targetCount: number,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const state = await getPoolState(pool);
    if (state.nextIndex >= targetCount) {
      return;
    }
    await sleep(500);
  }

  throw new Error(`Timeout waiting for ${targetCount} deposits`);
}

// ============================================
// Time Helpers
// ============================================

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Measure execution time of a function
 *
 * @param fn - Function to measure
 * @returns Execution time in ms and function result
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
  const start = Date.now();
  const result = await fn();
  const timeMs = Date.now() - start;
  return { result, timeMs };
}

// ============================================
// Event Helpers
// ============================================

/**
 * Get all events of a specific type from transaction receipt
 *
 * @param receipt - Transaction receipt
 * @param pool - Pool contract
 * @param eventName - Event name to filter
 * @returns Array of parsed events
 */
export function getEventsFromReceipt(receipt: any, pool: Contract, eventName: string): any[] {
  const events = [];

  for (const log of receipt.logs) {
    try {
      const parsedLog = pool.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      if (parsedLog && parsedLog.name === eventName) {
        events.push(parsedLog);
      }
    } catch {
      // Not the event we're looking for
    }
  }

  return events;
}

/**
 * Wait for a specific event to be emitted
 *
 * @param pool - Pool contract
 * @param eventName - Event name
 * @param timeoutMs - Timeout in milliseconds
 * @returns Event arguments
 */
export async function waitForEvent(
  pool: Contract,
  eventName: string,
  timeoutMs: number = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pool.removeAllListeners(eventName);
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    pool.once(eventName, (...args) => {
      clearTimeout(timeout);
      resolve(args);
    });
  });
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Assert transaction was successful
 *
 * @param receipt - Transaction receipt
 */
export function assertTxSuccess(receipt: any): void {
  if (receipt.status !== 1) {
    throw new Error(`Transaction failed: ${receipt.hash}`);
  }
}

/**
 * Assert balance changed by expected amount (with gas tolerance)
 *
 * @param actualChange - Actual balance change
 * @param expectedChange - Expected balance change
 * @param gasCost - Gas cost to account for
 * @param tolerance - Tolerance in wei
 */
export function assertBalanceChange(
  actualChange: bigint,
  expectedChange: bigint,
  gasCost: bigint,
  tolerance: bigint = ethers.parseEther('0.0001')
): void {
  const expectedWithGas = expectedChange - gasCost;
  const diff = actualChange > expectedWithGas ? actualChange - expectedWithGas : expectedWithGas - actualChange;

  if (diff > tolerance) {
    throw new Error(
      `Balance change mismatch. Expected: ${expectedWithGas}, Actual: ${actualChange}, Diff: ${diff}`
    );
  }
}

// ============================================
// Random Data Helpers
// ============================================

/**
 * Generate random ETH amount within a range
 *
 * @param min - Minimum in ETH
 * @param max - Maximum in ETH
 * @returns Random amount in wei
 */
export function randomEthAmount(min: string, max: string): bigint {
  const minWei = ethers.parseEther(min);
  const maxWei = ethers.parseEther(max);
  const range = maxWei - minWei;
  const random = BigInt(Math.floor(Math.random() * Number(range)));
  return minWei + random;
}

/**
 * Generate random address
 *
 * @returns Random Ethereum address
 */
export function randomAddress(): string {
  return ethers.Wallet.createRandom().address;
}

// ============================================
// Logging Helpers
// ============================================

/**
 * Log test section header
 *
 * @param title - Section title
 */
export function logSection(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60) + '\n');
}

/**
 * Log test step
 *
 * @param step - Step description
 */
export function logStep(step: string): void {
  console.log(`  ${step}`);
}

/**
 * Log test result
 *
 * @param result - Result description
 */
export function logResult(result: string): void {
  console.log(`    ✓ ${result}`);
}

// ============================================
// Export All
// ============================================

export default {
  deployTestContracts,
  getTestAccounts,
  setupTestEnvironment,
  getBalance,
  trackBalanceChange,
  getPoolState,
  waitForDeposits,
  sleep,
  measureTime,
  getEventsFromReceipt,
  waitForEvent,
  assertTxSuccess,
  assertBalanceChange,
  randomEthAmount,
  randomAddress,
  logSection,
  logStep,
  logResult,
};
