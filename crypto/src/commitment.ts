/**
 * @torx402/core - Commitment Operations
 *
 * Compute commitments and nullifier hashes for torx402 protocol
 */

import { pedersenHash } from './hash';
import { isValid248Bit } from './field';

/**
 * Compute nullifier hash
 * nullifierHash = Pedersen(nullifier)
 *
 * @param nullifier - 248-bit nullifier
 * @returns Nullifier hash as hex string
 */
export async function computeNullifierHash(nullifier: bigint): Promise<string> {
  if (!isValid248Bit(nullifier)) {
    throw new Error('Nullifier must be a valid 248-bit number');
  }

  // Convert nullifier to buffer (31 bytes for 248 bits)
  const nullifierHex = nullifier.toString(16).padStart(62, '0');
  const nullifierBuffer = Buffer.from(nullifierHex, 'hex');

  const hash = await pedersenHash(nullifierBuffer);
  return '0x' + hash.toString(16).padStart(64, '0');
}

/**
 * Compute commitment
 * commitment = Pedersen(nullifier || secret)
 *
 * @param nullifier - 248-bit nullifier
 * @param secret - 248-bit secret
 * @returns Commitment as hex string
 */
export async function computeCommitment(nullifier: bigint, secret: bigint): Promise<string> {
  if (!isValid248Bit(nullifier)) {
    throw new Error('Nullifier must be a valid 248-bit number');
  }

  if (!isValid248Bit(secret)) {
    throw new Error('Secret must be a valid 248-bit number');
  }

  // Concatenate nullifier and secret (31 bytes each = 62 bytes total)
  const nullifierHex = nullifier.toString(16).padStart(62, '0');
  const secretHex = secret.toString(16).padStart(62, '0');
  const combined = Buffer.from(nullifierHex + secretHex, 'hex');

  const hash = await pedersenHash(combined);
  return '0x' + hash.toString(16).padStart(64, '0');
}
