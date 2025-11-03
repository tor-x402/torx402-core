/**
 * torx402 Client Library
 *
 * TypeScript client for privacy-preserving micropayments on Ethereum
 *
 * @packageDocumentation
 *
 * @example Basic Usage
 * ```typescript
 * import { generateDeposit, makeDeposit, depositToNote } from '@torx402/client';
 *
 * // 1. Generate a deposit
 * const deposit = await generateDeposit('0.001', 'baseSepolia');
 *
 * // 2. Submit deposit to pool
 * const { receipt, deposit: confirmedDeposit } = await makeDeposit(
 *   poolAddress,
 *   deposit,
 *   signer
 * );
 *
 * // 3. Save your note securely!
 * const note = await depositToNote(confirmedDeposit);
 * console.log('Save this note:', note);
 * ```
 *
 * @example Withdrawal
 * ```typescript
 * import { parseDepositNote, withdrawDirect } from '@torx402/client';
 *
 * // 1. Load your deposit note
 * const deposit = await parseDepositNote(noteString);
 *
 * // 2. Withdraw funds
 * const receipt = await withdrawDirect(
 *   poolAddress,
 *   deposit,
 *   recipientAddress,
 *   signer,
 *   provider
 * );
 * ```
 */

// ============================================
// Type Exports
// ============================================

export type {
  // Cryptographic types
  FieldElement,
  Random248Bit,
  Commitment,
  NullifierHash,

  // Deposit types
  DepositSecrets,
  Deposit,
  DepositNote,

  // Merkle tree types
  MerkleProof,
  MerkleTreeState,

  // Proof types
  Groth16Proof,
  PublicSignals,
  WithdrawalProof,
  CircuitWitness,

  // Contract types
  PoolInfo,
  DepositOptions,
  WithdrawalOptions,

  // Configuration types
  ClientConfig,
  NetworkConfig,

  // x402 protocol types
  PaymentRequirement,
  PaymentPayload,

  // Utility types
  TransactionReceipt,
  EventLog,
} from './types';

export { ErrorCode, TorxError } from './types';

// ============================================
// Crypto Exports
// ============================================

export {
  // Constants
  FIELD_SIZE,
  MAX_248_BIT,
  ZERO_VALUE,
  MERKLE_ZERO_VALUES,

  // Random generation
  randomBN248,
  randomFieldElement,

  // Validation
  isValidFieldElement,
  isValid248Bit,
  toFieldElement,

  // Hashing
  pedersenHash,
  pedersenHashMultiple,
  computeNullifierHash,
  computeCommitment,
  mimcHash,
  mimcHashMultiple,

  // Conversions
  toHex,
  fromHex,
  toBigInt,
  toDecimalString,
  toHexString,
  bufferToBigInt,
  bigIntToBuffer,
  serializeFieldElement,
  parseFieldElement,

  // Utilities
  numToBits,
  bitsToNum,
  getZeroValue,
} from './crypto';

// ============================================
// Deposit Exports
// ============================================

export {
  // Core deposit functions
  generateDeposit,
  createDepositFromSecrets,
  depositToNote,
  parseDepositNote,
  makeDeposit,
  isNoteSpent,
  getPoolInfo,
  validateDeposit,

  // Batch operations
  generateDeposits,
  depositsToNotes,

  // Note management
  saveNoteToFile,
  loadNoteFromFile,
  saveNoteToLocalStorage,
  loadNoteFromLocalStorage,

  // Helpers
  formatDenomination,
  parseDenomination,
  getDepositSummary,
  createDepositBackup,
} from './deposit';

// ============================================
// Proof Exports
// ============================================

export {
  // Proof generation
  generateMerkleProof,
  generateWitness,
  generateProof,
  generateWithdrawalProof,

  // Verification
  verifyMerkleProof,
  verifyProofLocally,
  verifyProofOnChain,

  // Formatting
  formatProofForTransaction,
  parseProofFromTransaction,

  // Utilities
  estimateProofTime,
  getProofSize,
  checkCircuitArtifacts,
} from './proof';

// ============================================
// Withdrawal Exports
// ============================================

export {
  // Main withdrawal functions
  withdrawDirect,
  withdrawViaRelayer,
  submitWithdrawal,

  // Fee calculation
  calculateRelayerFee,
  getMinimumRelayerFee,
  calculateNetAmount,

  // Status checking
  checkWithdrawalStatus,
  waitForWithdrawal,

  // Validation
  validateWithdrawalParams,

  // Information
  getWithdrawalEstimate,
  isWithdrawalProfitable,
  estimateWithdrawalGas,

  // Batch operations
  prepareMultipleWithdrawals,
} from './withdraw';

// ============================================
// Convenience Re-exports
// ============================================

// Default export with all modules
export { default as crypto } from './crypto';
export { default as deposit } from './deposit';
export { default as proof } from './proof';
export { default as withdraw } from './withdraw';

// ============================================
// Version
// ============================================

export const VERSION = '0.1.0';

// ============================================
// Quick Start Helpers
// ============================================

/**
 * Complete deposit flow helper
 * Generates deposit and submits it in one call
 *
 * @param poolAddress - Privacy pool contract address
 * @param signer - Ethereum signer
 * @param denomination - Denomination string (e.g., '0.001')
 * @param network - Network name
 * @returns Deposit note string and transaction receipt
 */
export async function quickDeposit(
  poolAddress: string,
  signer: any,
  denomination: string,
  network: string
): Promise<{ note: string; receipt: any; deposit: any }> {
  const { generateDeposit, makeDeposit, depositToNote } = await import('./deposit');

  // Generate deposit
  const deposit = await generateDeposit(denomination, network);

  // Submit to pool
  const { receipt, deposit: confirmedDeposit } = await makeDeposit(poolAddress, deposit, signer);

  // Create note
  const note = await depositToNote(confirmedDeposit);

  return { note, receipt, deposit: confirmedDeposit };
}

/**
 * Complete withdrawal flow helper
 * Parses note and withdraws in one call
 *
 * @param poolAddress - Privacy pool contract address
 * @param noteString - Deposit note string
 * @param recipient - Recipient address
 * @param signer - Ethereum signer
 * @param provider - Ethereum provider
 * @returns Transaction receipt
 */
export async function quickWithdraw(
  poolAddress: string,
  noteString: string,
  recipient: string,
  signer: any,
  provider: any
): Promise<any> {
  const { parseDepositNote } = await import('./deposit');
  const { withdrawDirect } = await import('./withdraw');

  // Parse note
  const deposit = await parseDepositNote(noteString);

  // Withdraw
  const receipt = await withdrawDirect(poolAddress, deposit, recipient, signer, provider);

  return receipt;
}
