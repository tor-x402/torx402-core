/**
 * @torx402/core - Field Element Operations
 *
 * Field element validation and operations for BN128 curve
 */

import { FIELD_SIZE, MAX_248_BIT, MERKLE_ZERO_VALUES } from './constants';
import { FieldElement } from './types';

/**
 * Check if a value is a valid field element
 * Must be >= 0 and < FIELD_SIZE
 *
 * @param value - Value to check
 * @returns True if valid field element
 */
export function isValidFieldElement(value: FieldElement): boolean {
  try {
    const bn = typeof value === 'string' ? BigInt(value) : value;
    return bn >= BigInt(0) && bn < FIELD_SIZE;
  } catch {
    return false;
  }
}

/**
 * Validate and convert to field element
 * Throws if invalid
 *
 * @param value - Value to validate
 * @returns Valid field element as BigInt
 * @throws Error if invalid
 */
export function toFieldElement(value: bigint | string | number): bigint {
  const bn = BigInt(value);

  if (bn < BigInt(0)) {
    throw new Error('Field element cannot be negative');
  }

  if (bn >= FIELD_SIZE) {
    throw new Error(`Field element must be < FIELD_SIZE (${FIELD_SIZE})`);
  }

  return bn;
}

/**
 * Check if a value is a valid 248-bit number
 *
 * @param value - Value to check
 * @returns True if valid 248-bit number
 */
export function isValid248Bit(value: bigint | string): boolean {
  try {
    const bn = typeof value === 'string' ? BigInt(value) : value;
    return bn >= BigInt(0) && bn <= MAX_248_BIT;
  } catch {
    return false;
  }
}

/**
 * Get zero value for a specific Merkle tree level
 *
 * @param level - Tree level (0-32)
 * @returns Zero value as hex string
 */
export function getZeroValue(level: number): string {
  if (level < 0 || level >= MERKLE_ZERO_VALUES.length) {
    throw new Error(`Invalid level: ${level}. Must be 0-32`);
  }
  return MERKLE_ZERO_VALUES[level];
}

/**
 * Export FIELD_SIZE for convenience
 */
export { FIELD_SIZE } from './constants';

/**
 * Export MAX_248_BIT for convenience
 */
export { MAX_248_BIT } from './constants';
