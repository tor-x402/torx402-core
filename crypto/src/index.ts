/**
 * @torx402/core - Main Export
 *
 * Shared cryptographic utilities and types for torx402 protocol
 * Used by both client and facilitator packages
 */

// ============================================
// Types
// ============================================

export type { FieldElement, Random248Bit, Commitment, NullifierHash } from './types';

// ============================================
// Constants
// ============================================

export {
  FIELD_SIZE,
  MAX_248_BIT,
  ZERO_VALUE,
  TREE_HEIGHT,
  ROOT_HISTORY_SIZE,
  MERKLE_ZERO_VALUES,
} from './constants';

// ============================================
// Random Generation
// ============================================

export { randomBN248, randomFieldElement, randomBytes32 } from './random';

// ============================================
// Field Operations
// ============================================

export { isValidFieldElement, toFieldElement, isValid248Bit, getZeroValue } from './field';

// ============================================
// Hash Functions
// ============================================

export {
  initializePedersenHasher,
  pedersenHash,
  pedersenHashMultiple,
  initializeMimcHasher,
  initializeCrypto,
  mimcHash,
  mimcHashMultiple,
} from './hash';

// ============================================
// Commitment Operations
// ============================================

export { computeNullifierHash, computeCommitment } from './commitment';

// ============================================
// Utility Functions
// ============================================

export {
  toHex,
  fromHex,
  bufferToBigInt,
  bigIntToBuffer,
  toBigInt,
  toDecimalString,
  toHexString,
  serializeFieldElement,
  parseFieldElement,
  numToBits,
  bitsToNum,
} from './utils';
