/**
 * torx402 Client Library - Cryptographic Utilities
 *
 * Core cryptographic functions for torx402 privacy-preserving micropayments
 * - Random number generation (248-bit nullifier and secret)
 * - Pedersen hash computation (commitment and nullifierHash)
 * - Field element validation (BN128 curve)
 * - BigInt utilities for cryptographic operations
 */

import { randomBytes } from "crypto";
// @ts-ignore
import { buildPedersenHash, buildMimcSponge } from "circomlibjs";

// ============================================
// Constants
// ============================================

/**
 * BN128 curve field size
 * All field elements must be < FIELD_SIZE
 */
export const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

/**
 * Maximum value for 248-bit numbers
 * nullifier and secret are 248 bits
 */
export const MAX_248_BIT = BigInt(
  "452312848583266388373324160190187140051835877600158453279131187530910662655",
); // 2^248 - 1

/**
 * Zero value used in Merkle tree
 */
export const ZERO_VALUE = BigInt(
  "21663839004416932945382355908790599225266501822907911457504978515578255421292",
);

// ============================================
// Random Number Generation
// ============================================

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
  let randomBN = BigInt("0x" + randomHex.toString("hex"));

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
  let randomBN = BigInt("0x" + randomHex.toString("hex"));

  // Ensure it's within the field
  randomBN = randomBN % FIELD_SIZE;

  // Ensure it's not zero
  if (randomBN === BigInt(0)) {
    randomBN = BigInt(1);
  }

  return randomBN;
}

// ============================================
// Field Element Validation
// ============================================

/**
 * Check if a value is a valid field element
 * Must be >= 0 and < FIELD_SIZE
 *
 * @param value - Value to check
 * @returns True if valid field element
 */
export function isValidFieldElement(value: bigint | string): boolean {
  try {
    const bn = typeof value === "string" ? BigInt(value) : value;
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
    throw new Error("Field element cannot be negative");
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
    const bn = typeof value === "string" ? BigInt(value) : value;
    return bn >= BigInt(0) && bn <= MAX_248_BIT;
  } catch {
    return false;
  }
}

// ============================================
// Pedersen Hash (for commitments)
// ============================================

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
    console.log("Initializing Pedersen hasher...");
    pedersenHasher = await buildPedersenHash();
    console.log("✓ Pedersen hasher ready");
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
export async function pedersenHashMultiple(
  elements: bigint[],
): Promise<bigint> {
  // Convert elements to buffer
  const buffer = Buffer.concat(
    elements.map((el) => {
      // Convert to 31-byte buffer (248 bits)
      const hex = el.toString(16).padStart(62, "0");
      return Buffer.from(hex, "hex");
    }),
  );

  return pedersenHash(buffer);
}

/**
 * Compute nullifier hash
 * nullifierHash = Pedersen(nullifier)
 *
 * @param nullifier - 248-bit nullifier
 * @returns Nullifier hash as hex string
 */
export async function computeNullifierHash(nullifier: bigint): Promise<string> {
  if (!isValid248Bit(nullifier)) {
    throw new Error("Nullifier must be a valid 248-bit number");
  }

  // Convert nullifier to buffer (31 bytes for 248 bits)
  const nullifierHex = nullifier.toString(16).padStart(62, "0");
  const nullifierBuffer = Buffer.from(nullifierHex, "hex");

  const hash = await pedersenHash(nullifierBuffer);
  return "0x" + hash.toString(16).padStart(64, "0");
}

/**
 * Compute commitment
 * commitment = Pedersen(nullifier || secret)
 *
 * @param nullifier - 248-bit nullifier
 * @param secret - 248-bit secret
 * @returns Commitment as hex string
 */
export async function computeCommitment(
  nullifier: bigint,
  secret: bigint,
): Promise<string> {
  if (!isValid248Bit(nullifier)) {
    throw new Error("Nullifier must be a valid 248-bit number");
  }

  if (!isValid248Bit(secret)) {
    throw new Error("Secret must be a valid 248-bit number");
  }

  // Concatenate nullifier and secret (31 bytes each = 62 bytes total)
  const nullifierHex = nullifier.toString(16).padStart(62, "0");
  const secretHex = secret.toString(16).padStart(62, "0");
  const combined = Buffer.from(nullifierHex + secretHex, "hex");

  const hash = await pedersenHash(combined);
  return "0x" + hash.toString(16).padStart(64, "0");
}

// ============================================
// MiMC Hash (for Merkle tree)
// ============================================

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
    console.log("Initializing MiMC hasher...");
    mimcHasher = await buildMimcSponge();
    console.log("✓ MiMC hasher ready");
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
  console.log("Initializing torx402 cryptographic libraries...");
  await initializePedersenHasher();
  await initializeMimcHasher();
  console.log("✓ All cryptographic libraries initialized\n");
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
    throw new Error("Left element must be a valid field element");
  }

  if (!isValidFieldElement(right)) {
    throw new Error("Right element must be a valid field element");
  }

  const hasher = await getMimcHasher();
  const hash = hasher.hash(left, right);
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

// ============================================
// Conversion Utilities
// ============================================

/**
 * Convert BigInt to hex string with 0x prefix
 *
 * @param value - BigInt value
 * @param bytes - Number of bytes (default: 32)
 * @returns Hex string with 0x prefix
 */
export function toHex(value: bigint, bytes = 32): string {
  return "0x" + value.toString(16).padStart(bytes * 2, "0");
}

/**
 * Convert hex string to BigInt
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns BigInt value
 */
export function fromHex(hex: string): bigint {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return BigInt("0x" + cleanHex);
}

/**
 * Convert buffer to BigInt
 *
 * @param buffer - Buffer to convert
 * @returns BigInt value
 */
export function bufferToBigInt(buffer: Buffer | Uint8Array): bigint {
  return BigInt("0x" + Buffer.from(buffer).toString("hex"));
}

/**
 * Convert BigInt to buffer
 *
 * @param value - BigInt value
 * @param bytes - Number of bytes (default: 32)
 * @returns Buffer
 */
export function bigIntToBuffer(value: bigint, bytes = 32): Buffer {
  const hex = value.toString(16).padStart(bytes * 2, "0");
  return Buffer.from(hex, "hex");
}

// ============================================
// Bit Manipulation
// ============================================

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

// ============================================
// Precomputed Zero Values (Merkle Tree)
// ============================================

/**
 * Pre-computed zero values for each level of the Merkle tree
 * zeros(i) = hash(zeros(i-1), zeros(i-1))
 */
export const MERKLE_ZERO_VALUES: string[] = [
  "0x2fe54c60d3acabf3343a35b6eba15db4821b340f76e741e2249685ed4899af6c",
  "0x256a6135777eee2fd26f54b8b7037a25439d5235caee224154186d2b8a52e31d",
  "0x1151949895e82ab19924de92c40a3d6f7bcb60d92b00504b8199613683f0c200",
  "0x20121ee811489ff8d61f09fb89e313f14959a0f28bb428a20dba6b0b068b3bdb",
  "0x0a89ca6ffa14cc462cfedb842c30ed221a50a3d6bf022a6a57dc82ab24c157c9",
  "0x24ca05c2b5cd42e890d6be94c68d0689f4f21c9cec9c0f13fe41d566dfb54959",
  "0x1ccb97c932565a92c60156bdba2d08f3bf1377464e025cee765679e604a7315c",
  "0x19156fbd7d1a8bf5cba8909367de1b624534ebab4f0f79e003bccdd1b182bdb4",
  "0x261af8c1f0912e465744641409f622d466c3920ac6e5ff37e36604cb11dfff80",
  "0x0058459724ff6ca5a1652fcbc3e82b93895cf08e975b19beab3f54c217d1c007",
  "0x1f04ef20dee48d39984d8eabe768a70eafa6310ad20849d4573c3c40c2ad1e30",
  "0x1bea3dec5dab51567ce7e200a30f7ba6d4276aeaa53e2686f962a46c66d511e5",
  "0x0ee0f941e2da4b9e31c3ca97a40d8fa9ce68d97c084177071b3cb46cd3372f0f",
  "0x1ca9503e8935884501bbaf20be14eb4c46b89772c97b96e3b2ebf3a36a948bbd",
  "0x133a80e30697cd55d8f7d4b0965b7be24057ba5dc3da898ee2187232446cb108",
  "0x13e6d8fc88839ed76e182c2a779af5b2c0da9dd18c90427a644f7e148a6253b6",
  "0x1eb16b057a477f4bc8f572ea6bee39561098f78f15bfb3699dcbb7bd8db61854",
  "0x0da2cb16a1ceaabf1c16b838f7a9e3f2a3a3088d9e0a6debaa748114620696ea",
  "0x24a3b3d822420b14b5d8cb6c28a574f01e98ea9e940551d2ebd75cee12649f9d",
  "0x198622acbd783d1b0d9064105b1fc8e4d8889de95c4c519b3f635809fe6afc05",
  "0x29d7ed391256ccc3ea596c86e933b89ff339d25ea8ddced975ae2fe30b5296d4",
  "0x19be59f2f0413ce78c0c3703a3a5451b1d7f39629fa33abd11548a76065b2967",
  "0x1ff3f61797e538b70e619310d33f2a063e7eb59104e112e95738da1254dc3453",
  "0x10c16ae9959cf8358980d9dd9616e48228737310a10e2b6b731c1a548f036c48",
  "0x0ba433a63174a90ac20992e75e3095496812b652685b5e1a2eae0b1bf4e8fcd1",
  "0x019ddb9df2bc98d987d0dfeca9d2b643deafab8f7036562e627c3667266a044c",
  "0x2d3c88b23175c5a5565db928414c66d1912b11acf974b2e644caaac04739ce99",
  "0x2eab55f6ae4e66e32c5189eed5c470840863445760f5ed7e7b69b2a62600f354",
  "0x002df37a2642621802383cf952bf4dd1f32e05433beeb1fd41031fb7eace979d",
  "0x104aeb41435db66c3e62feccc1d6f5d98d0a0ed75d1374db457cf462e3a1f427",
  "0x1f3c6fd858e9a7d4b0d1f38e256a09d81d5a5e3c963987e2d4b814cfab7c6ebb",
  "0x2c7a07d20dff79d01fecedc1134284a8d08436606c93693b67e333f671bf69cc",
  "0x0ebcbc703e6ee2783e5109f2baee05a7e8a1c1a4e8f6f3834c0339c7c5a3e80e",
];

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

// ============================================
// Helper Functions
// ============================================

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
  return value.toString(16).padStart(bytes * 2, "0");
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
    throw new Error("Invalid field element");
  }
  return value;
}

// ============================================
// Export All
// ============================================

export default {
  // Constants
  FIELD_SIZE,
  MAX_248_BIT,
  ZERO_VALUE,
  MERKLE_ZERO_VALUES,

  // Initialization
  initializeCrypto,
  initializePedersenHasher,
  initializeMimcHasher,

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
};
