/**
 * torx402 Deposit Example
 *
 * This script demonstrates how to make a deposit to a privacy pool
 *
 * Usage:
 *   ts-node examples/deposit.ts <pool_address> <denomination> <network>
 *
 * Example:
 *   ts-node examples/deposit.ts 0x1234... 0.001 baseSepolia
 */

import { ethers } from 'ethers';
import {
  generateDeposit,
  makeDeposit,
  depositToNote,
  getPoolInfo,
  createDepositBackup,
  saveNoteToFile,
} from '../src';
import * as path from 'path';
import * as fs from 'fs';

// ============================================
// Configuration
// ============================================

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: ts-node examples/deposit.ts <pool_address> <denomination> <network>');
  console.error('');
  console.error('Example:');
  console.error('  ts-node examples/deposit.ts 0x1234... 0.001 baseSepolia');
  console.error('');
  process.exit(1);
}

const POOL_ADDRESS = args[0];
const DENOMINATION = args[1]; // e.g., "0.001"
const NETWORK = args[2]; // e.g., "baseSepolia"

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../contracts/.env') });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// ============================================
// Main Deposit Flow
// ============================================

async function main() {
  console.log('========================================');
  console.log('torx402 - Deposit Example');
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

  // Setup provider and signer
  console.log('Configuration:');
  console.log('  Pool Address:', POOL_ADDRESS);
  console.log('  Denomination:', DENOMINATION, 'ETH');
  console.log('  Network:', NETWORK);
  console.log('  RPC URL:', RPC_URL);
  console.log('');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('Wallet Address:', wallet.address);

  // Check wallet balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Wallet Balance:', ethers.formatEther(balance), 'ETH');
  console.log('');

  if (balance === BigInt(0)) {
    console.error('❌ Error: Wallet has no balance!');
    console.error('');
    console.error('Please fund your wallet with', NETWORK, 'ETH');
    console.error('For Base Sepolia:');
    console.error('  1. Get Sepolia ETH: https://sepoliafaucet.com');
    console.error('  2. Bridge to Base: https://bridge.base.org');
    console.error('');
    process.exit(1);
  }

  // Step 1: Get pool information
  console.log('Step 1/5: Fetching pool information...');
  try {
    const poolInfo = await getPoolInfo(POOL_ADDRESS, provider);
    console.log('  Pool Denomination:', ethers.formatEther(poolInfo.denomination), 'ETH');
    console.log('  Tree Height:', poolInfo.treeHeight);
    console.log('  Current Deposits:', poolInfo.nextIndex);
    console.log('  Pool Balance:', ethers.formatEther(poolInfo.balance), 'ETH');
    console.log('  Current Root:', poolInfo.currentRoot);
    console.log('');
  } catch (error: any) {
    console.error('❌ Error fetching pool info:', error.message);
    console.error('');
    console.error('Make sure the pool address is correct and deployed');
    process.exit(1);
  }

  // Step 2: Generate deposit
  console.log('Step 2/5: Generating deposit secrets...');
  const deposit = await generateDeposit(DENOMINATION, NETWORK);
  console.log('✓ Deposit generated');
  console.log('  Commitment:', deposit.commitment);
  console.log('  Nullifier Hash:', deposit.nullifierHash);
  console.log('');

  // Step 3: Submit deposit transaction
  console.log('Step 3/5: Submitting deposit to privacy pool...');
  console.log('This will cost:', DENOMINATION, 'ETH + gas fees');
  console.log('');

  try {
    const { receipt, deposit: confirmedDeposit } = await makeDeposit(
      POOL_ADDRESS,
      deposit,
      wallet,
      {
        gasLimit: 300000, // Override if needed
      }
    );

    console.log('✓ Deposit transaction confirmed!');
    console.log('  Transaction Hash:', receipt.hash);
    console.log('  Block Number:', receipt.blockNumber);
    console.log('  Leaf Index:', confirmedDeposit.leafIndex);
    console.log('  Gas Used:', receipt.gasUsed?.toString());
    console.log('');

    // Step 4: Create deposit note
    console.log('Step 4/5: Creating deposit note...');
    const note = await depositToNote(confirmedDeposit);
    console.log('✓ Note created');
    console.log('');

    // Step 5: Save deposit note
    console.log('Step 5/5: Saving deposit note...');

    // Create notes directory if it doesn't exist
    const notesDir = path.join(__dirname, '../notes');
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }

    // Save note to file
    const timestamp = Date.now();
    const noteFilename = `deposit_${NETWORK}_${timestamp}.txt`;
    const notePath = path.join(notesDir, noteFilename);
    await saveNoteToFile(note, notePath);
    console.log('✓ Note saved to:', notePath);
    console.log('');

    // Create backup with metadata
    const backup = await createDepositBackup(confirmedDeposit);
    const backupFilename = `deposit_${NETWORK}_${timestamp}.json`;
    const backupPath = path.join(notesDir, backupFilename);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log('✓ Backup saved to:', backupPath);
    console.log('');

    // Display note
    console.log('========================================');
    console.log('✓ Deposit Complete!');
    console.log('========================================');
    console.log('');
    console.log('Your deposit note:');
    console.log('');
    console.log('  ', note);
    console.log('');
    console.log('⚠️  IMPORTANT: Save this note securely!');
    console.log('   You need it to withdraw your funds later.');
    console.log('   If you lose it, your funds are lost forever!');
    console.log('');
    console.log('Deposit Details:');
    console.log('  Amount:', DENOMINATION, 'ETH');
    console.log('  Network:', NETWORK);
    console.log('  Pool:', POOL_ADDRESS);
    console.log('  Leaf Index:', confirmedDeposit.leafIndex);
    console.log('  Transaction:', receipt.hash);
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Wait for more deposits to increase anonymity set');
    console.log('  2. Use the note to withdraw to a different address');
    console.log('  3. Run: ts-node examples/withdraw.ts <note>');
    console.log('');

    // Show anonymity set size
    const poolInfoAfter = await getPoolInfo(POOL_ADDRESS, provider);
    console.log('Current Anonymity Set:', poolInfoAfter.nextIndex, 'deposits');
    console.log('');

    if (poolInfoAfter.nextIndex < 10) {
      console.log('⚠️  Warning: Small anonymity set!');
      console.log('   Wait for more deposits before withdrawing for better privacy');
      console.log('');
    } else if (poolInfoAfter.nextIndex < 100) {
      console.log('✓ Moderate anonymity set');
      console.log('  Privacy level: Moderate');
      console.log('');
    } else {
      console.log('✓ Large anonymity set');
      console.log('  Privacy level: Excellent!');
      console.log('  You can withdraw immediately with good privacy');
      console.log('');
    }

  } catch (error: any) {
    console.error('========================================');
    console.error('❌ Deposit Failed!');
    console.error('========================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');

    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('Insufficient funds!');
      console.error('You need at least', DENOMINATION, 'ETH + gas fees');
      console.error('Current balance:', ethers.formatEther(balance), 'ETH');
      console.error('');
    }

    if (error.message.includes('commitment already exists')) {
      console.error('This commitment already exists in the pool!');
      console.error('This is extremely rare. Try generating a new deposit.');
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
