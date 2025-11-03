/**
 * torx402 Client Library - Deposit Generation
 *
 * Functions for generating and managing privacy-preserving deposits
 * - Generate random nullifier and secret
 * - Compute commitments using Pedersen hash
 * - Create and parse deposit notes
 * - Submit deposit transactions to privacy pools
 */

import { Contract, parseEther, formatEther, Provider, Signer } from "ethers";
import {
  randomBN248,
  computeCommitment,
  computeNullifierHash,
  isValid248Bit,
} from "./crypto";
import { Deposit, DepositOptions, TorxError, ErrorCode } from "./types";

// ============================================
// Constants
// ============================================

const DEPOSIT_NOTE_VERSION = 1;
const DEPOSIT_NOTE_PREFIX = "tornado-eth";

// ============================================
// Deposit Generation
// ============================================

/**
 * Generate a new deposit with random secrets
 *
 * Creates a fresh deposit with:
 * - Random 248-bit nullifier
 * - Random 248-bit secret
 * - Computed commitment = Pedersen(nullifier || secret)
 * - Computed nullifierHash = Pedersen(nullifier)
 *
 * @param denomination - Optional denomination for reference (in ETH string, e.g., '0.001')
 * @param network - Optional network name for reference
 * @returns Deposit object with secrets and commitment
 *
 * @example
 * ```typescript
 * const deposit = await generateDeposit('0.001', 'baseSepolia');
 * console.log('Commitment:', deposit.commitment);
 * console.log('Note:', await depositToNote(deposit));
 * ```
 */
export async function generateDeposit(
  denomination?: string,
  network?: string,
): Promise<Deposit> {
  // Generate random secrets
  const nullifier = randomBN248();
  const secret = randomBN248();

  // Validate secrets
  if (!isValid248Bit(nullifier)) {
    throw new TorxError(
      ErrorCode.INVALID_NULLIFIER,
      "Generated nullifier is invalid",
      { nullifier: nullifier.toString() },
    );
  }

  if (!isValid248Bit(secret)) {
    throw new TorxError(
      ErrorCode.INVALID_SECRET,
      "Generated secret is invalid",
      { secret: secret.toString() },
    );
  }

  // Compute commitment and nullifierHash
  const commitment = await computeCommitment(nullifier, secret);
  const nullifierHash = await computeNullifierHash(nullifier);

  return {
    nullifier,
    secret,
    commitment,
    nullifierHash,
    network,
    denomination,
  };
}

/**
 * Create a deposit from existing secrets
 * Use this when you already have the nullifier and secret
 *
 * @param nullifier - 248-bit nullifier
 * @param secret - 248-bit secret
 * @param denomination - Optional denomination
 * @param network - Optional network name
 * @returns Deposit object
 */
export async function createDepositFromSecrets(
  nullifier: bigint | string,
  secret: bigint | string,
  denomination?: string,
  network?: string,
): Promise<Deposit> {
  const nullifierBN = BigInt(nullifier);
  const secretBN = BigInt(secret);

  // Validate
  if (!isValid248Bit(nullifierBN)) {
    throw new TorxError(
      ErrorCode.INVALID_NULLIFIER,
      "Nullifier must be a valid 248-bit number",
      { nullifier: nullifierBN.toString() },
    );
  }

  if (!isValid248Bit(secretBN)) {
    throw new TorxError(
      ErrorCode.INVALID_SECRET,
      "Secret must be a valid 248-bit number",
      { secret: secretBN.toString() },
    );
  }

  const commitment = await computeCommitment(nullifierBN, secretBN);
  const nullifierHash = await computeNullifierHash(nullifierBN);

  return {
    nullifier: nullifierBN,
    secret: secretBN,
    commitment,
    nullifierHash,
    network,
    denomination,
  };
}

// ============================================
// Deposit Note Serialization
// ============================================

/**
 * Encode deposit secrets to base64 string
 * Encodes: nullifier (31 bytes) + secret (31 bytes) + leafIndex (4 bytes)
 *
 * @param nullifier - 248-bit nullifier
 * @param secret - 248-bit secret
 * @param leafIndex - Leaf index in tree (0 if not yet deposited)
 * @returns Base64 encoded string
 */
function encodeSecrets(
  nullifier: bigint,
  secret: bigint,
  leafIndex = 0,
): string {
  // Convert to hex strings (31 bytes each for 248 bits)
  const nullifierHex = nullifier.toString(16).padStart(62, "0");
  const secretHex = secret.toString(16).padStart(62, "0");
  const leafIndexHex = leafIndex.toString(16).padStart(8, "0");

  // Concatenate and encode
  const combined = nullifierHex + secretHex + leafIndexHex;
  const buffer = Buffer.from(combined, "hex");
  return buffer.toString("base64");
}

/**
 * Decode deposit secrets from base64 string
 *
 * @param encoded - Base64 encoded secrets
 * @returns Decoded nullifier, secret, and leafIndex
 */
function decodeSecrets(encoded: string): {
  nullifier: bigint;
  secret: bigint;
  leafIndex: number;
} {
  try {
    const buffer = Buffer.from(encoded, "base64");

    // Extract components
    const nullifierHex = buffer.slice(0, 31).toString("hex");
    const secretHex = buffer.slice(31, 62).toString("hex");
    const leafIndexHex = buffer.slice(62, 66).toString("hex");

    return {
      nullifier: BigInt("0x" + nullifierHex),
      secret: BigInt("0x" + secretHex),
      leafIndex: parseInt(leafIndexHex, 16),
    };
  } catch (error) {
    throw new TorxError(
      ErrorCode.NOTE_PARSE_FAILED,
      "Failed to decode deposit secrets",
      { error },
    );
  }
}

/**
 * Convert deposit to note string
 * Format: tornado-eth-{denomination}-{network}-{encoded_secrets}
 *
 * @param deposit - Deposit object
 * @returns Deposit note string
 *
 * @example
 * ```
 * const note = await depositToNote(deposit);
 * // => "tornado-eth-0.001-baseSepolia-YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="
 * ```
 */
export async function depositToNote(deposit: Deposit): Promise<string> {
  const denomination = deposit.denomination || "0.001";
  const network = deposit.network || "unknown";
  const leafIndex = deposit.leafIndex || 0;

  const encodedSecrets = encodeSecrets(
    deposit.nullifier,
    deposit.secret,
    leafIndex,
  );

  return `${DEPOSIT_NOTE_PREFIX}-${denomination}-${network}-${encodedSecrets}`;
}

/**
 * Parse deposit note string into Deposit object
 *
 * @param note - Deposit note string
 * @returns Deposit object with secrets
 * @throws TorxError if note format is invalid
 *
 * @example
 * ```
 * const deposit = await parseDepositNote(noteString);
 * console.log('Nullifier:', deposit.nullifier);
 * ```
 */
export async function parseDepositNote(note: string): Promise<Deposit> {
  try {
    // Split note components
    const parts = note.split("-");

    if (parts.length < 4) {
      throw new Error("Invalid note format: insufficient parts");
    }

    const [protocol, asset, denomination, network, ...secretsParts] = parts;

    // Validate protocol
    if (protocol !== "tornado") {
      throw new Error(`Invalid protocol: ${protocol}. Expected 'tornado'`);
    }

    if (asset !== "eth") {
      throw new Error(`Invalid asset: ${asset}. Expected 'eth'`);
    }

    // Decode secrets (rejoin in case base64 contains dashes)
    const encodedSecrets = secretsParts.join("-");
    const { nullifier, secret, leafIndex } = decodeSecrets(encodedSecrets);

    // Recompute commitment and nullifierHash
    const commitment = await computeCommitment(nullifier, secret);
    const nullifierHash = await computeNullifierHash(nullifier);

    return {
      nullifier,
      secret,
      commitment,
      nullifierHash,
      denomination,
      network,
      leafIndex: leafIndex > 0 ? leafIndex : undefined,
    };
  } catch (error) {
    throw new TorxError(
      ErrorCode.INVALID_NOTE_FORMAT,
      "Failed to parse deposit note",
      { note, error },
    );
  }
}

// ============================================
// Blockchain Interaction
// ============================================

/**
 * Submit a deposit transaction to the privacy pool
 *
 * @param poolAddress - Privacy pool contract address
 * @param deposit - Deposit object with commitment
 * @param signer - Ethereum signer
 * @param options - Transaction options
 * @returns Transaction receipt and updated deposit (with leafIndex and txHash)
 *
 * @example
 * ```typescript
 * const deposit = await generateDeposit('0.001', 'baseSepolia');
 * const { receipt, deposit: updatedDeposit } = await makeDeposit(
 *   poolAddress,
 *   deposit,
 *   signer,
 *   { gasLimit: 300000 }
 * );
 * console.log('Deposited at index:', updatedDeposit.leafIndex);
 * ```
 */
export async function makeDeposit(
  poolAddress: string,
  deposit: Deposit,
  signer: Signer,
  options: DepositOptions = {},
): Promise<{ receipt: any; deposit: Deposit }> {
  try {
    // Privacy pool ABI (minimal for deposit)
    const poolAbi = [
      "function deposit(bytes32 _commitment) external payable",
      "function denomination() external view returns (uint256)",
      "function nextIndex() external view returns (uint32)",
      "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
    ];

    const pool = new Contract(poolAddress, poolAbi, signer);

    // Get denomination from contract
    const denominationWei = await pool.denomination();

    // Prepare transaction
    const txOptions: any = {
      value: denominationWei,
      ...options,
    };

    // Submit deposit transaction
    const tx = await pool.deposit(deposit.commitment, txOptions);

    // Wait for confirmation
    const receipt = await tx.wait();

    // Extract leafIndex from Deposit event
    let leafIndex: number | undefined;
    for (const log of receipt.logs) {
      try {
        const parsedLog = pool.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (parsedLog && parsedLog.name === "Deposit") {
          leafIndex = Number(parsedLog.args.leafIndex);
          break;
        }
      } catch {
        // Not a Deposit event, continue
      }
    }

    // Update deposit with transaction info
    const updatedDeposit: Deposit = {
      ...deposit,
      leafIndex,
      txHash: receipt.hash,
      denomination: formatEther(denominationWei),
    };

    return { receipt, deposit: updatedDeposit };
  } catch (error: any) {
    throw new TorxError(
      ErrorCode.DEPOSIT_FAILED,
      "Failed to submit deposit transaction",
      { poolAddress, error: error.message },
    );
  }
}

/**
 * Check if a deposit note has been spent
 *
 * @param poolAddress - Privacy pool contract address
 * @param deposit - Deposit object
 * @param provider - Ethereum provider
 * @returns True if note has been spent
 */
export async function isNoteSpent(
  poolAddress: string,
  deposit: Deposit,
  provider: Provider,
): Promise<boolean> {
  const poolAbi = [
    "function isSpent(bytes32 _nullifierHash) external view returns (bool)",
  ];

  const pool = new Contract(poolAddress, poolAbi, provider);
  return await pool.isSpent(deposit.nullifierHash);
}

/**
 * Get pool information
 *
 * @param poolAddress - Privacy pool contract address
 * @param provider - Ethereum provider
 * @returns Pool information
 */
export async function getPoolInfo(
  poolAddress: string,
  provider: Provider,
): Promise<{
  denomination: bigint;
  treeHeight: number;
  nextIndex: number;
  currentRoot: string;
  balance: bigint;
}> {
  const poolAbi = [
    "function getPoolInfo() external view returns (uint256 poolDenomination, uint32 treeHeight, uint32 nextLeafIndex, bytes32 currentRoot, uint256 poolBalance)",
  ];

  const pool = new Contract(poolAddress, poolAbi, provider);
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
 * Validate a deposit object
 *
 * @param deposit - Deposit to validate
 * @throws TorxError if deposit is invalid
 */
export function validateDeposit(deposit: Deposit): void {
  if (!isValid248Bit(deposit.nullifier)) {
    throw new TorxError(
      ErrorCode.INVALID_NULLIFIER,
      "Nullifier must be a valid 248-bit number",
      { nullifier: deposit.nullifier.toString() },
    );
  }

  if (!isValid248Bit(deposit.secret)) {
    throw new TorxError(
      ErrorCode.INVALID_SECRET,
      "Secret must be a valid 248-bit number",
      { secret: deposit.secret.toString() },
    );
  }

  if (!deposit.commitment || !deposit.commitment.startsWith("0x")) {
    throw new TorxError(
      ErrorCode.INVALID_COMMITMENT,
      "Invalid commitment format",
      { commitment: deposit.commitment },
    );
  }

  if (!deposit.nullifierHash || !deposit.nullifierHash.startsWith("0x")) {
    throw new TorxError(
      ErrorCode.INVALID_COMMITMENT,
      "Invalid nullifierHash format",
      { nullifierHash: deposit.nullifierHash },
    );
  }
}

// ============================================
// Batch Operations
// ============================================

/**
 * Generate multiple deposits at once
 *
 * @param count - Number of deposits to generate
 * @param denomination - Denomination for all deposits
 * @param network - Network name
 * @returns Array of deposits
 */
export async function generateDeposits(
  count: number,
  denomination?: string,
  network?: string,
): Promise<Deposit[]> {
  if (count <= 0 || count > 100) {
    throw new Error("Count must be between 1 and 100");
  }

  const deposits: Deposit[] = [];
  for (let i = 0; i < count; i++) {
    const deposit = await generateDeposit(denomination, network);
    deposits.push(deposit);
  }

  return deposits;
}

/**
 * Convert multiple deposits to notes
 *
 * @param deposits - Array of deposits
 * @returns Array of note strings
 */
export async function depositsToNotes(deposits: Deposit[]): Promise<string[]> {
  const notes: string[] = [];
  for (const deposit of deposits) {
    const note = await depositToNote(deposit);
    notes.push(note);
  }
  return notes;
}

// ============================================
// Note Management
// ============================================

/**
 * Save deposit note to file (Node.js only)
 *
 * @param note - Deposit note string
 * @param filepath - File path to save to
 */
export async function saveNoteToFile(
  note: string,
  filepath: string,
): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.writeFile(filepath, note, "utf-8");
  } catch (error) {
    throw new TorxError(
      ErrorCode.INVALID_NOTE_FORMAT,
      "Failed to save note to file",
      { filepath, error },
    );
  }
}

/**
 * Load deposit note from file (Node.js only)
 *
 * @param filepath - File path to load from
 * @returns Deposit note string
 */
export async function loadNoteFromFile(filepath: string): Promise<string> {
  try {
    const fs = await import("fs/promises");
    return await fs.readFile(filepath, "utf-8");
  } catch (error) {
    throw new TorxError(
      ErrorCode.NOTE_PARSE_FAILED,
      "Failed to load note from file",
      { filepath, error },
    );
  }
}

/**
 * Save deposit note to localStorage (Browser only)
 *
 * @param note - Deposit note string
 * @param key - Storage key (default: 'torx402_deposit_note')
 */
export function saveNoteToLocalStorage(
  note: string,
  key = "torx402_deposit_note",
): void {
  if (typeof window === "undefined" || !(window as any).localStorage) {
    throw new Error(
      "localStorage is not available (not in browser environment)",
    );
  }

  (window as any).localStorage.setItem(key, note);
}

/**
 * Load deposit note from localStorage (Browser only)
 *
 * @param key - Storage key (default: 'torx402_deposit_note')
 * @returns Deposit note string or null if not found
 */
export function loadNoteFromLocalStorage(
  key = "torx402_deposit_note",
): string | null {
  if (typeof window === "undefined" || !(window as any).localStorage) {
    throw new Error(
      "localStorage is not available (not in browser environment)",
    );
  }

  return (window as any).localStorage.getItem(key);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format denomination from wei to ETH string
 *
 * @param wei - Amount in wei
 * @returns ETH string (e.g., '0.001')
 */
export function formatDenomination(wei: bigint | string): string {
  return formatEther(wei);
}

/**
 * Parse denomination from ETH string to wei
 *
 * @param eth - ETH string (e.g., '0.001')
 * @returns Amount in wei as BigInt
 */
export function parseDenomination(eth: string): bigint {
  return parseEther(eth);
}

/**
 * Get deposit info summary for display
 *
 * @param deposit - Deposit object
 * @returns Human-readable summary
 */
export function getDepositSummary(deposit: Deposit): {
  commitment: string;
  nullifierHash: string;
  denomination?: string;
  network?: string;
  leafIndex?: number;
  txHash?: string;
  spent: boolean;
} {
  return {
    commitment: deposit.commitment,
    nullifierHash: deposit.nullifierHash,
    denomination: deposit.denomination,
    network: deposit.network,
    leafIndex: deposit.leafIndex,
    txHash: deposit.txHash,
    spent: false, // Must be checked via isNoteSpent()
  };
}

/**
 * Create a backup of deposit with timestamp
 *
 * @param deposit - Deposit object
 * @returns Backup object with metadata
 */
export async function createDepositBackup(deposit: Deposit): Promise<{
  version: number;
  timestamp: number;
  note: string;
  metadata: {
    commitment: string;
    nullifierHash: string;
    denomination?: string;
    network?: string;
    leafIndex?: number;
    txHash?: string;
  };
}> {
  const note = await depositToNote(deposit);

  return {
    version: DEPOSIT_NOTE_VERSION,
    timestamp: Date.now(),
    note,
    metadata: {
      commitment: deposit.commitment,
      nullifierHash: deposit.nullifierHash,
      denomination: deposit.denomination,
      network: deposit.network,
      leafIndex: deposit.leafIndex,
      txHash: deposit.txHash,
    },
  };
}

// ============================================
// Export All
// ============================================

export default {
  // Core functions
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
};
