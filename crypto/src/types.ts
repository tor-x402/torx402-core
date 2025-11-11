/**
 * @torx402/core - Shared Type Definitions
 *
 * Core TypeScript types shared across torx402 packages
 * Used by both client and facilitator
 */

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
