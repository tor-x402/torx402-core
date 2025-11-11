/**
 * @torx402/core - Random Number Generation
 *
 * Cryptographically secure random number generation for torx402
 */

import { randomBytes } from 'crypto';
import { FIELD_SIZE, MAX_248_BIT } from './constants';

/**
 * Generate a random 248-bit number
 * Used for nullifier and secret generation
 *
 * @returns Random 248-bit BigInt
 */
export function randomBN248(): bigint {
  // Generate 32 random bytes
  const randomHex = randomBytes(32);

  // Convert to BigInt
  let randomBN = BigInt('0x' + randomHex.toString('hex'));

  // Ensure it's within 248 bits
  randomBN = randomBN % MAX_248_BIT;

  // Ensure it's not zero
  if (randomBN === BigInt(0)) {
    randomBN = BigInt(1);
  }

  return randomBN;
}

/**
 * Generate cryptographically secure random field element
 * Must be < FIELD_SIZE
 *
 * @returns Random field element as BigInt
 */
export function randomFieldElement(): bigint {
  const randomHex = randomBytes(32);
  let randomBN = BigInt('0x' + randomHex.toString('hex'));

  // Ensure it's within the field
  randomBN = randomBN % FIELD_SIZE;

  // Ensure it's not zero
  if (randomBN === BigInt(0)) {
    randomBN = BigInt(1);
  }

  return randomBN;
}

/**
 * Generate random bytes
 *
 * @param bytes - Number of bytes to generate
 * @returns Uint8Array of random bytes
 */
export function randomBytes32(): Uint8Array {
  return randomBytes(32);
}
