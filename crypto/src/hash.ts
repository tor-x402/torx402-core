/**
 * @torx402/core - Hash Functions
 *
 * Pedersen and MiMC hash functions for torx402 protocol
 */

import { buildPedersenHash, buildMimcSponge } from 'circomlibjs';
import { isValidFieldElement } from './field';
import { bufferToBigInt } from './utils';

// ============================================
// Pedersen Hash (for commitments)
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pedersenHasher: any = null;

/**
 * Initialize Pedersen hasher (lazy initialization)
 * @returns Pedersen hasher instance
 */
async function getPedersenHasher() {
  if (!pedersenHasher) {
    pedersenHasher = await buildPedersenHash();
  }
  return pedersenHasher;
}

/**
 * Explicitly initialize Pedersen hasher
 * Call this before using hash functions (e.g., in test setup)
 * @returns Pedersen hasher instance
 */
export async function initializePedersenHasher() {
  if (!pedersenHasher) {
    console.log('Initializing Pedersen hasher...');
    pedersenHasher = await buildPedersenHash();
    console.log('✓ Pedersen hasher ready');
  }
  return pedersenHasher;
}

/**
 * Compute Pedersen hash of a buffer
 *
 * @param data - Data to hash (as Buffer or Uint8Array)
 * @returns Hash as BigInt
 */
export async function pedersenHash(data: Buffer | Uint8Array): Promise<bigint> {
  const hasher = await getPedersenHasher();
  const hash = hasher.hash(data);
  // Pedersen hash returns Uint8Array directly, convert to BigInt
  return bufferToBigInt(Buffer.from(hash));
}

/**
 * Compute Pedersen hash of multiple field elements
 *
 * @param elements - Array of field elements
 * @returns Hash as BigInt
 */
export async function pedersenHashMultiple(elements: bigint[]): Promise<bigint> {
  // Convert elements to buffer
  const buffer = Buffer.concat(
    elements.map((el) => {
      // Convert to 31-byte buffer (248 bits)
      const hex = el.toString(16).padStart(62, '0');
      return Buffer.from(hex, 'hex');
    })
  );

  return pedersenHash(buffer);
}

// ============================================
// MiMC Hash (for Merkle tree)
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mimcHasher: any = null;

/**
 * Initialize MiMC hasher (lazy initialization)
 * @returns MiMC hasher instance
 */
async function getMimcHasher() {
  if (!mimcHasher) {
    mimcHasher = await buildMimcSponge();
  }
  return mimcHasher;
}

/**
 * Explicitly initialize MiMC hasher
 * Call this before using Merkle tree functions (e.g., in test setup)
 * @returns MiMC hasher instance
 */
export async function initializeMimcHasher() {
  if (!mimcHasher) {
    console.log('Initializing MiMC hasher...');
    mimcHasher = await buildMimcSponge();
    console.log('✓ MiMC hasher ready');
  }
  return mimcHasher;
}

/**
 * Initialize all cryptographic libraries
 * Call this once before using any crypto functions
 * Recommended to call in test setup or application initialization
 *
 * @example
 * ```typescript
 * // In your test setup:
 * before(async function() {
 *   await initializeCrypto();
 * });
 * ```
 */
export async function initializeCrypto() {
  console.log('Initializing torx402 cryptographic libraries...');
  await initializePedersenHasher();
  await initializeMimcHasher();
  console.log('✓ All cryptographic libraries initialized\n');
}

/**
 * Compute MiMC-Sponge hash of two field elements
 * Used for Merkle tree hashing
 *
 * @param left - Left element
 * @param right - Right element
 * @returns Hash as BigInt
 */
export async function mimcHash(left: bigint, right: bigint): Promise<bigint> {
  if (!isValidFieldElement(left)) {
    throw new Error('Left element must be a valid field element');
  }

  if (!isValidFieldElement(right)) {
    throw new Error('Right element must be a valid field element');
  }

  const hasher = await getMimcHasher();
  const hash = hasher.multiHash([left, right]);
  return hasher.F.toObject(hash);
}

/**
 * Compute MiMC multi-hash (for multiple inputs)
 *
 * @param inputs - Array of field elements
 * @returns Hash as BigInt
 */
export async function mimcHashMultiple(inputs: bigint[]): Promise<bigint> {
  const hasher = await getMimcHasher();
  const hash = hasher.multiHash(inputs);
  return hasher.F.toObject(hash);
}
