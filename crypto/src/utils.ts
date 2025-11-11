/**
 * @torx402/core - Utility Functions
 *
 * Conversion and utility functions for cryptographic operations
 */

import { isValidFieldElement } from './field';

/**
 * Convert BigInt to hex string with 0x prefix
 *
 * @param value - BigInt value
 * @param bytes - Number of bytes (default: 32)
 * @returns Hex string with 0x prefix
 */
export function toHex(value: bigint, bytes = 32): string {
  return '0x' + value.toString(16).padStart(bytes * 2, '0');
}

/**
 * Convert hex string to BigInt
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns BigInt value
 */
export function fromHex(hex: string): bigint {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + cleanHex);
}

/**
 * Convert buffer to BigInt
 *
 * @param buffer - Buffer to convert
 * @returns BigInt value
 */
export function bufferToBigInt(buffer: Buffer | Uint8Array): bigint {
  return BigInt('0x' + Buffer.from(buffer).toString('hex'));
}

/**
 * Convert BigInt to buffer
 *
 * @param value - BigInt value
 * @param bytes - Number of bytes (default: 32)
 * @returns Buffer
 */
export function bigIntToBuffer(value: bigint, bytes = 32): Buffer {
  const hex = value.toString(16).padStart(bytes * 2, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Ensure value is BigInt
 *
 * @param value - Value to convert
 * @returns BigInt value
 */
export function toBigInt(value: bigint | string | number): bigint {
  return BigInt(value);
}

/**
 * Convert BigInt to decimal string
 *
 * @param value - BigInt value
 * @returns Decimal string
 */
export function toDecimalString(value: bigint): string {
  return value.toString(10);
}

/**
 * Convert BigInt to hex string (without 0x prefix)
 *
 * @param value - BigInt value
 * @param bytes - Number of bytes (default: 32)
 * @returns Hex string without 0x prefix
 */
export function toHexString(value: bigint, bytes = 32): string {
  return value.toString(16).padStart(bytes * 2, '0');
}

/**
 * Serialize field element to bytes32
 *
 * @param value - Field element
 * @returns Hex string (0x-prefixed, 32 bytes)
 */
export function serializeFieldElement(value: bigint): string {
  return toHex(value, 32);
}

/**
 * Parse field element from bytes32
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Field element as BigInt
 */
export function parseFieldElement(hex: string): bigint {
  const value = fromHex(hex);
  if (!isValidFieldElement(value)) {
    throw new Error('Invalid field element');
  }
  return value;
}

/**
 * Convert number to bit array
 *
 * @param num - Number to convert
 * @param bits - Number of bits
 * @returns Array of 0s and 1s
 */
export function numToBits(num: bigint, bits: number): number[] {
  const result: number[] = [];
  let n = num;

  for (let i = 0; i < bits; i++) {
    result.push(Number(n & BigInt(1)));
    n = n >> BigInt(1);
  }

  return result;
}

/**
 * Convert bit array to number
 *
 * @param bits - Array of 0s and 1s
 * @returns BigInt value
 */
export function bitsToNum(bits: number[]): bigint {
  let result = BigInt(0);

  for (let i = bits.length - 1; i >= 0; i--) {
    result = (result << BigInt(1)) + BigInt(bits[i]);
  }

  return result;
}
