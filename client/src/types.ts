/**
 * torx402 Client Library - Type Definitions
 *
 * Core TypeScript types for the torx402 privacy-preserving micropayment client
 */

import { BigNumberish, Provider, Signer } from 'ethers';

// ============================================
// Cryptographic Primitives
// ============================================

/**
 * Field element (BN128 curve field)
 * Must be < 21888242871839275222246405745257275088548364400416034343698204186575808495617
 */
export type FieldElement = bigint | string;

/**
 * 248-bit random value (for nullifier and secret)
 */
export type Random248Bit = bigint | string;

/**
 * Commitment hash (Pedersen hash output)
 */
export type Commitment = string;

/**
 * Nullifier hash (Pedersen hash output)
 */
export type NullifierHash = string;

// ============================================
// Deposit Types
// ============================================

/**
 * Deposit secrets (generated randomly)
 */
export interface DepositSecrets {
  /** Random nullifier (248 bits) */
  nullifier: bigint;

  /** Random secret (248 bits) */
  secret: bigint;
}

/**
 * Full deposit information
 */
export interface Deposit {
  /** Random nullifier (248 bits) */
  nullifier: bigint;

  /** Random secret (248 bits) */
  secret: bigint;

  /** Commitment = Pedersen(nullifier || secret) */
  commitment: string;

  /** Nullifier hash = Pedersen(nullifier) */
  nullifierHash: string;

  /** Leaf index in Merkle tree (set after deposit transaction) */
  leafIndex?: number;

  /** Transaction hash of deposit (set after transaction) */
  txHash?: string;

  /** Network name (e.g., 'baseSepolia') */
  network?: string;

  /** Pool denomination in wei */
  denomination?: string;
}

/**
 * Serialized deposit note format
 * Format: tornado-eth-{denomination}-{network}-{encoded_data}
 */
export interface DepositNote {
  /** Protocol identifier */
  protocol: 'tornado';

  /** Asset type */
  asset: 'eth';

  /** Denomination in ETH (e.g., '0.001') */
  denomination: string;

  /** Network name */
  network: string;

  /** Encoded secrets (nullifier, secret, leafIndex) */
  secrets: string;
}

// ============================================
// Merkle Tree Types
// ============================================

/**
 * Merkle proof path
 */
export interface MerkleProof {
  /** Merkle root */
  root: string;

  /** Path elements (sibling hashes) */
  pathElements: string[];

  /** Path indices (0=left, 1=right) */
  pathIndices: number[];

  /** Leaf being proven */
  leaf: string;

  /** Leaf index in tree */
  leafIndex: number;
}

/**
 * Merkle tree state
 */
export interface MerkleTreeState {
  /** Current root */
  root: string;

  /** Next available leaf index */
  nextIndex: number;

  /** Tree height */
  levels: number;

  /** Total capacity */
  capacity: number;
}

// ============================================
// Proof Types
// ============================================

/**
 * zk-SNARK proof (Groth16)
 */
export interface Groth16Proof {
  /** Proof component A */
  pi_a: [string, string];

  /** Proof component B */
  pi_b: [[string, string], [string, string]];

  /** Proof component C */
  pi_c: [string, string];

  /** Protocol identifier */
  protocol: 'groth16';

  /** Curve identifier */
  curve: 'bn128';
}

/**
 * Public signals (inputs) for the proof
 */
export interface PublicSignals {
  /** Merkle root */
  root: string;

  /** Nullifier hash (prevents double-spend) */
  nullifierHash: string;

  /** Recipient address */
  recipient: string;

  /** Relayer address (0x0 if no relayer) */
  relayer: string;

  /** Fee for relayer in wei */
  fee: string;

  /** Refund amount in wei (currently unused) */
  refund: string;
}

/**
 * Complete withdrawal proof
 */
export interface WithdrawalProof {
  /** zk-SNARK proof */
  proof: Groth16Proof;

  /** Public signals */
  publicSignals: PublicSignals;
}

/**
 * Circuit witness (private inputs for proof generation)
 */
export interface CircuitWitness {
  /** Public: Merkle root */
  root: string;

  /** Public: Nullifier hash */
  nullifierHash: string;

  /** Public: Recipient address */
  recipient: string;

  /** Public: Relayer address */
  relayer: string;

  /** Public: Fee amount */
  fee: string;

  /** Public: Refund amount */
  refund: string;

  /** Private: Nullifier */
  nullifier: string;

  /** Private: Secret */
  secret: string;

  /** Private: Merkle proof path elements */
  pathElements: string[];

  /** Private: Merkle proof path indices */
  pathIndices: number[];
}

// ============================================
// Contract Types
// ============================================

/**
 * Privacy pool contract information
 */
export interface PoolInfo {
  /** Pool address */
  address: string;

  /** Denomination in wei */
  denomination: bigint;

  /** Merkle tree height */
  treeHeight: number;

  /** Next leaf index */
  nextIndex: number;

  /** Current root */
  currentRoot: string;

  /** Pool balance in wei */
  balance: bigint;

  /** Verifier contract address */
  verifier: string;

  /** Hasher contract address */
  hasher: string;
}

/**
 * Deposit transaction options
 */
export interface DepositOptions {
  /** Gas limit override */
  gasLimit?: BigNumberish;

  /** Gas price override */
  gasPrice?: BigNumberish;

  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: BigNumberish;

  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: BigNumberish;

  /** Nonce override */
  nonce?: number;
}

/**
 * Withdrawal transaction options
 */
export interface WithdrawalOptions extends DepositOptions {
  /** Relayer address (0x0 for direct withdrawal) */
  relayer?: string;

  /** Relayer fee in wei */
  fee?: BigNumberish;

  /** Refund amount (currently unused) */
  refund?: BigNumberish;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Client configuration
 */
export interface ClientConfig {
  /** Ethereum provider */
  provider: Provider;

  /** Signer (optional, required for deposits/withdrawals) */
  signer?: Signer;

  /** Privacy pool contract address */
  poolAddress: string;

  /** Network name */
  network: string;

  /** Circuit artifacts path */
  circuitPath?: string;

  /** Proving key path */
  provingKeyPath?: string;

  /** RPC timeout in ms */
  rpcTimeout?: number;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  /** Network name */
  name: string;

  /** Chain ID */
  chainId: number;

  /** RPC URL */
  rpcUrl: string;

  /** Privacy pool contract address */
  poolAddress: string;

  /** Block explorer URL */
  explorerUrl?: string;

  /** Native currency symbol */
  currency: string;
}

// ============================================
// x402 Protocol Types
// ============================================

/**
 * x402 Payment requirements
 */
export interface PaymentRequirement {
  /** Payment scheme */
  scheme: string;

  /** Network identifier */
  network: string;

  /** Asset identifier */
  asset: string;

  /** Amount in wei */
  amount: string;

  /** Pool address */
  pool: string;

  /** Payment timeout in seconds */
  timeout: number;
}

/**
 * x402 Payment header payload
 */
export interface PaymentPayload {
  /** x402 protocol version */
  x402Version: number;

  /** Payment scheme (tornado-eth) */
  scheme: string;

  /** Network name */
  network: string;

  /** Withdrawal proof and signals */
  payload: {
    proof: Groth16Proof;
    publicSignals: PublicSignals;
  };
}

// ============================================
// Error Types
// ============================================

/**
 * Client error codes
 */
export enum ErrorCode {
  // Cryptographic errors
  INVALID_FIELD_ELEMENT = 'INVALID_FIELD_ELEMENT',
  INVALID_NULLIFIER = 'INVALID_NULLIFIER',
  INVALID_SECRET = 'INVALID_SECRET',
  INVALID_COMMITMENT = 'INVALID_COMMITMENT',

  // Proof errors
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  PROOF_VERIFICATION_FAILED = 'PROOF_VERIFICATION_FAILED',
  INVALID_MERKLE_PROOF = 'INVALID_MERKLE_PROOF',

  // Contract errors
  DEPOSIT_FAILED = 'DEPOSIT_FAILED',
  WITHDRAWAL_FAILED = 'WITHDRAWAL_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  NOTE_ALREADY_SPENT = 'NOTE_ALREADY_SPENT',
  INVALID_ROOT = 'INVALID_ROOT',

  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_PROVIDER = 'MISSING_PROVIDER',
  MISSING_SIGNER = 'MISSING_SIGNER',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',

  // Note errors
  INVALID_NOTE_FORMAT = 'INVALID_NOTE_FORMAT',
  NOTE_PARSE_FAILED = 'NOTE_PARSE_FAILED',

  // Circuit errors
  CIRCUIT_NOT_FOUND = 'CIRCUIT_NOT_FOUND',
  PROVING_KEY_NOT_FOUND = 'PROVING_KEY_NOT_FOUND',
  VERIFICATION_KEY_NOT_FOUND = 'VERIFICATION_KEY_NOT_FOUND',
}

/**
 * Client error class
 */
export class TorxError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'TorxError';
    Object.setPrototypeOf(this, TorxError.prototype);
  }
}

// ============================================
// Utility Types
// ============================================

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  /** Transaction hash */
  transactionHash: string;

  /** Block number */
  blockNumber: number;

  /** Block hash */
  blockHash: string;

  /** Gas used */
  gasUsedBN: bigint;

  /** Transaction status (1 = success, 0 = failed) */
  status: number;

  /** From address */
  from: string;

  /** To address */
  to: string;

  /** Contract address (for deployment) */
  contractAddress?: string;
}

/**
 * Event log
 */
export interface EventLog {
  /** Event name */
  event: string;

  /** Event arguments */
  args: Record<string, unknown>;

  /** Transaction hash */
  transactionHash: string;

  /** Block number */
  blockNumber: number;

  /** Log index */
  logIndex: number;
}
