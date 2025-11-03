/**
 * torx402 Withdrawal Example
 *
 * This script demonstrates how to withdraw funds from a privacy pool
 *
 * Usage:
 *   ts-node examples/withdraw.ts <deposit_note> <recipient_address> [pool_address]
 *
 * Example:
 *   ts-node examples/withdraw.ts \
 *     "tornado-eth-0.001-baseSepolia-ABC123..." \
 *     0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
 *
 * Note: If pool_address is not provided, it will be extracted from deployment files
 */

import { ethers } from 'ethers';
import {
  parseDepositNote,
  withdrawDirect,
  getPoolInfo,
  isNoteSpent,
  getWithdrawalEstimate,
  isWithdrawalProfitable,
} from '../src';
import * as path from 'path';
import * as fs from 'fs';

// ============================================
// Configuration
// ============================================

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: ts-node examples/withdraw.ts <note> <recipient> [pool_address]');
  console.error('');
  console.error('Example:');
  console.error('  ts-node examples/withdraw.ts \\');
  console.error('    "tornado-eth-0.001-baseSepolia-ABC123..." \\');
  console.error('    0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
  console.error('');
  console.error('Or load note from file:');
  console.error('  ts-node examples/withdraw.ts \\');
  console.error('    notes/deposit_baseSepolia_1234567890.txt \\');
  console.error('    0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
  console.error('');
  process.exit(1);
}

let NOTE_STRING = args[0];
const RECIPIENT_ADDRESS = args[1];
let POOL_ADDRESS = args[2];

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../contracts/.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// ============================================
// Helper Functions
// ============================================

/**
 * Load note from file if path is provided
 */
async function loadNote(noteOrPath: string): Promise<string> {
  // Check if it's a file path
  if (noteOrPath.endsWith('.txt') || noteOrPath.includes('/')) {
    if (fs.existsSync(noteOrPath)) {
      console.log('Loading note from file:', noteOrPath);
      const note = fs.readFileSync(noteOrPath, 'utf-8').trim();
      console.log('✓ Note loaded');
      console.log('');
      return note;
    }
  }

  // It's a note string
  return noteOrPath;
}

/**
 * Load pool address from deployment files if not provided
 */
function loadPoolAddress(network: string): string | undefined {
  const deploymentPath = path.join(__dirname, `../../contracts/deployments/${network}.json`);

  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
    return deployment.privacyPool;
  }

  return undefined;
}

// ============================================
// Main Withdrawal Flow
// ============================================

async function main() {
  console.log('========================================');
  console.log('torx402 - Withdrawal Example');
  console.log('========================================');
  console.log('');

  // Validate configuration
  if (!PRIVATE_KEY) {
    console.error('❌ Error: PRIVATE_KEY not found in .env file');
    console.error('');
    console.error('Please create contracts/.env from .env.example');
    console.error('and add your private key (without 0x prefix)');
    console.error('');
    process.exit(1);
  }

  // Step 1: Load and parse deposit note
  console.log('Step 1/7: Loading deposit note...');
  NOTE_STRING = await loadNote(NOTE_STRING);

  let deposit;
  try {
    deposit = await parseDepositNote(NOTE_STRING);
    console.log('✓ Note parsed successfully');
    console.log('  Commitment:', deposit.commitment);
    console.log('  Nullifier Hash:', deposit.nullifierHash);
    console.log('  Denomination:', deposit.denomination, 'ETH');
    console.log('  Network:', deposit.network);
    console.log('  Leaf Index:', deposit.leafIndex || 'Not set');
    console.log('');
  } catch (error: any) {
    console.error('❌ Error: Failed to parse deposit note');
    console.error('');
    console.error(error.message);
    console.error('');
    console.error('Make sure the note string is valid');
    process.exit(1);
  }

  // Determine pool address
  if (!POOL_ADDRESS) {
    console.log('Pool address not provided, looking up from deployment files...');
    POOL_ADDRESS = loadPoolAddress(deposit.network || 'baseSepolia');

    if (!POOL_ADDRESS) {
      console.error('❌ Error: Could not determine pool address');
      console.error('');
      console.error('Please provide pool address as third argument:');
      console.error('  ts-node examples/withdraw.ts <note> <recipient> <pool_address>');
      console.error('');
      process.exit(1);
    }

    console.log('✓ Found pool address:', POOL_ADDRESS);
    console.log('');
  }

  // Step 2: Setup provider and signer
  console.log('Step 2/7: Connecting to network...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  console.log('✓ Connected to network');
  console.log('  Network:', network.name);
  console.log('  Chain ID:', network.chainId);
  console.log('  Signer Address:', wallet.address);
  console.log('');

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('  Wallet Balance:', ethers.formatEther(balance), 'ETH');
  console.log('');

  // Step 3: Verify pool and note
  console.log('Step 3/7: Verifying pool and note status...');

  try {
    // Get pool info
    const poolInfo = await getPoolInfo(POOL_ADDRESS, provider);
    console.log('  Pool Denomination:', ethers.formatEther(poolInfo.denomination), 'ETH');
    console.log('  Current Deposits:', poolInfo.nextIndex);
    console.log('  Pool Balance:', ethers.formatEther(poolInfo.balance), 'ETH');
    console.log('');

    // Check if note already spent
    const spent = await isNoteSpent(POOL_ADDRESS, deposit, provider);
    if (spent) {
      console.error('❌ Error: This note has already been spent!');
      console.error('');
      console.error('You cannot withdraw the same note twice.');
      console.error('Each deposit can only be withdrawn once.');
      console.error('');
      process.exit(1);
    }
    console.log('✓ Note is valid and unspent');
    console.log('');

    // Check anonymity set size
    if (poolInfo.nextIndex < 10) {
      console.warn('⚠️  Warning: Small anonymity set!');
      console.warn('');
      console.warn('  Current deposits:', poolInfo.nextIndex);
      console.warn('  Your deposit could be 1 of', poolInfo.nextIndex, 'deposits');
      console.warn('  Privacy level: LOW');
      console.warn('');
      console.warn('  Recommendation: Wait for more deposits before withdrawing');
      console.warn('');

      // Ask for confirmation (in a real app, you'd use readline)
      console.log('  Continuing anyway for demo purposes...');
      console.log('');
    } else if (poolInfo.nextIndex < 100) {
      console.log('✓ Moderate anonymity set');
      console.log('  Your deposit is 1 of', poolInfo.nextIndex, 'deposits');
      console.log('  Privacy level: MODERATE');
      console.log('');
    } else {
      console.log('✓ Large anonymity set');
      console.log('  Your deposit is 1 of', poolInfo.nextIndex, 'deposits');
      console.log('  Privacy level: EXCELLENT');
      console.log('');
    }

  } catch (error: any) {
    console.error('❌ Error verifying pool:', error.message);
    console.error('');
    process.exit(1);
  }

  // Step 4: Get withdrawal estimate
  console.log('Step 4/7: Calculating withdrawal estimate...');

  try {
    const estimate = await getWithdrawalEstimate(POOL_ADDRESS, provider);
    console.log('  Denomination:', estimate.denominationETH, 'ETH');
    console.log('  Relayer Fee:', estimate.relayerFeeETH, 'ETH');
    console.log('  You Receive:', estimate.netAmountETH, 'ETH');
    console.log('  Estimated Gas:', estimate.estimatedGas.toString());
    console.log('  Gas Cost:', estimate.estimatedGasCostETH, 'ETH');
    console.log('');

    // Check if profitable
    const isProfitable = await isWithdrawalProfitable(POOL_ADDRESS, provider);
    if (!isProfitable) {
      console.warn('⚠️  Warning: Gas cost exceeds withdrawal amount!');
      console.warn('  This withdrawal may not be profitable on this network.');
      console.warn('');
    } else {
      console.log('✓ Withdrawal is profitable');
      console.log('');
    }
  } catch (error: any) {
    console.warn('Could not calculate estimate:', error.message);
    console.warn('Continuing anyway...');
    console.log('');
  }

  // Step 5: Generate withdrawal proof
  console.log('Step 5/7: Generating zk-SNARK proof...');
  console.log('This will take approximately 10 seconds...');
  console.log('');
  console.log('⏳ Please wait...');
  console.log('');

  const startTime = Date.now();

  try {
    // This is handled inside withdrawDirect, but we show the progress here
    console.log('  [1/3] Generating Merkle proof...');
    console.log('  [2/3] Verifying Merkle proof...');
    console.log('  [3/3] Generating zk-SNARK proof...');
    console.log('');
  } catch (error: any) {
    console.error('❌ Error generating proof:', error.message);
    console.error('');
    process.exit(1);
  }

  // Step 6: Submit withdrawal
  console.log('Step 6/7: Submitting withdrawal transaction...');
  console.log('');

  try {
    const receipt = await withdrawDirect(
      POOL_ADDRESS,
      deposit,
      RECIPIENT_ADDRESS,
      wallet,
      provider,
      {
        gasLimit: 500000, // Override if needed
      }
    );

    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

    console.log('Step 7/7: Withdrawal confirmed!');
    console.log('');
    console.log('========================================');
    console.log('✓ Success! Funds Withdrawn');
    console.log('========================================');
    console.log('');
    console.log('Total time:', elapsedTime, 'seconds');
    console.log('Transaction:', receipt.hash);
    console.log('Block:', receipt.blockNumber);
    console.log('Gas Used:', receipt.gasUsed?.toString());
    console.log('');
    console.log('Recipient:', RECIPIENT_ADDRESS);
    console.log('Amount:', deposit.denomination, 'ETH');
    console.log('');
    console.log('View on BaseScan:');
    console.log(`  https://sepolia.basescan.org/tx/${receipt.hash}`);
    console.log('');
    console.log('⚠️  Note: This note cannot be used again');
    console.log('');

  } catch (error: any) {
    console.error('========================================');
    console.error('❌ Withdrawal Failed!');
    console.error('========================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');

    if (error.message.includes('note already spent')) {
      console.error('This note has already been spent!');
      console.error('Each deposit can only be withdrawn once.');
      console.error('');
    }

    if (error.message.includes('merkle root not found')) {
      console.error('Merkle root not found in pool history!');
      console.error('');
      console.error('This can happen if:');
      console.error('  1. Too much time has passed (root expired from history)');
      console.error('  2. The deposit was made to a different pool');
      console.error('  3. There were too many deposits (>10,000) since yours');
      console.error('');
    }

    if (error.message.includes('invalid withdrawal proof')) {
      console.error('Proof verification failed!');
      console.error('');
      console.error('This can happen if:');
      console.error('  1. Circuit artifacts mismatch (recompile circuits)');
      console.error('  2. Wrong recipient address');
      console.error('  3. Corrupted note data');
      console.error('');
    }

    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('Insufficient funds for gas!');
      console.error('You need ETH to pay for the withdrawal transaction gas.');
      console.error('Current balance:', ethers.formatEther(balance), 'ETH');
      console.error('');
    }

    process.exit(1);
  }
}

// ============================================
// Execute
// ============================================

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
