/**
 * torx402 Client Library - Proof Generation
 *
 * Functions for generating and verifying zk-SNARK proofs for anonymous withdrawals
 * - Merkle proof generation
 * - Circuit witness generation
 * - zk-SNARK proof generation (Groth16)
 * - Proof validation and formatting
 */

import { Contract, Provider, ZeroAddress } from "ethers";
// @ts-ignore - snarkjs doesn't have type definitions
import * as snarkjs from "snarkjs";
import * as path from "path";
import * as fs from "fs";
import {
  Deposit,
  MerkleProof,
  CircuitWitness,
  WithdrawalProof,
  Groth16Proof,
  PublicSignals,
  TorxError,
  ErrorCode,
} from "./types";
import {
  computeNullifierHash,
  mimcHash,
  toHex,
  fromHex,
  getZeroValue,
} from "./crypto";

// ============================================
// Constants
// ============================================

const TREE_HEIGHT = 32;

// Default paths for circuit artifacts (relative to project root)
const DEFAULT_VERIFICATION_KEY =
  "../circuits/build/withdraw_verification_key.json";

// ============================================
// Merkle Proof Generation
// ============================================

/**
 * Build Merkle tree from deposit commitments
 * Fetches all deposits from the pool contract and builds the tree locally
 *
 * @param poolAddress - Privacy pool contract address
 * @param provider - Ethereum provider
 * @param leafIndex - Optional leaf index to stop at
 * @returns Array of leaves (commitments)
 */
async function fetchDepositLeaves(
  poolAddress: string,
  provider: Provider,
  leafIndex?: number,
): Promise<string[]> {
  const poolAbi = [
    "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
    "function nextIndex() external view returns (uint32)",
  ];

  const pool = new Contract(poolAddress, poolAbi, provider);

  // Get current tree size
  const nextIndex = await pool.nextIndex();
  const maxIndex = leafIndex !== undefined ? leafIndex + 1 : Number(nextIndex);

  if (maxIndex === 0) {
    return [];
  }

  // Fetch all Deposit events
  const filter = pool.filters.Deposit();
  const events = await pool.queryFilter(filter, 0, "latest");

  // Extract commitments sorted by leafIndex
  const leaves: string[] = new Array(maxIndex).fill(getZeroValue(0));

  for (const event of events) {
    const parsedEvent = event as any;
    if (parsedEvent.args) {
      const commitment = parsedEvent.args.commitment;
      const index = Number(parsedEvent.args.leafIndex);

      if (index < maxIndex) {
        leaves[index] = commitment;
      }
    }
  }

  return leaves;
}

/**
 * Build full Merkle tree from leaves
 * tree[level][index] = hash at that position
 *
 * @param leaves - Array of leaf commitments
 * @param treeHeight - Height of the tree
 * @returns Tree structure (array of arrays)
 */
async function buildMerkleTree(
  leaves: string[],
  treeHeight = TREE_HEIGHT,
): Promise<string[][]> {
  // Initialize tree
  const tree: string[][] = [];
  tree[0] = [...leaves];

  // Pad with zeros to reach full tree capacity
  const capacity = Math.pow(2, treeHeight);
  while (tree[0].length < capacity) {
    tree[0].push(getZeroValue(0));
  }

  // Build tree level by level
  for (let level = 0; level < treeHeight; level++) {
    tree[level + 1] = [];
    const currentLevel = tree[level];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = fromHex(currentLevel[i]);
      const right =
        i + 1 < currentLevel.length
          ? fromHex(currentLevel[i + 1])
          : fromHex(getZeroValue(level));

      const hash = await mimcHash(left, right);
      tree[level + 1].push(toHex(hash));
    }
  }

  return tree;
}

/**
 * Generate Merkle proof for a specific leaf
 *
 * @param poolAddress - Privacy pool contract address
 * @param leafIndex - Index of the leaf to prove
 * @param provider - Ethereum provider
 * @returns Merkle proof (root, pathElements, pathIndices)
 */
export async function generateMerkleProof(
  poolAddress: string,
  leafIndex: number,
  provider: Provider,
): Promise<MerkleProof> {
  try {
    // Fetch all leaves
    const leaves = await fetchDepositLeaves(poolAddress, provider, leafIndex);

    if (leafIndex >= leaves.length) {
      throw new Error(
        `Leaf index ${leafIndex} not found in tree (size: ${leaves.length})`,
      );
    }

    // Build tree
    const tree = await buildMerkleTree(leaves, TREE_HEIGHT);

    // Extract path
    const pathElements: string[] = [];
    const pathIndices: number[] = [];

    let currentIndex = leafIndex;

    for (let level = 0; level < TREE_HEIGHT; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      // Get sibling (or zero if doesn't exist)
      const sibling =
        siblingIndex < tree[level].length
          ? tree[level][siblingIndex]
          : getZeroValue(level);

      pathElements.push(sibling);
      pathIndices.push(isLeft ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
    }

    const root = tree[TREE_HEIGHT][0];
    const leaf = leaves[leafIndex];

    return {
      root,
      pathElements,
      pathIndices,
      leaf,
      leafIndex,
    };
  } catch (error: any) {
    throw new TorxError(
      ErrorCode.INVALID_MERKLE_PROOF,
      "Failed to generate Merkle proof",
      { poolAddress, leafIndex, error: error.message },
    );
  }
}

/**
 * Verify Merkle proof locally (off-chain)
 *
 * @param proof - Merkle proof to verify
 * @returns True if proof is valid
 */
export async function verifyMerkleProof(proof: MerkleProof): Promise<boolean> {
  try {
    let currentHash = fromHex(proof.leaf);

    for (let i = 0; i < proof.pathElements.length; i++) {
      const sibling = fromHex(proof.pathElements[i]);
      const isLeft = proof.pathIndices[i] === 0;

      if (isLeft) {
        currentHash = await mimcHash(currentHash, sibling);
      } else {
        currentHash = await mimcHash(sibling, currentHash);
      }
    }

    const computedRoot = toHex(currentHash);
    return computedRoot.toLowerCase() === proof.root.toLowerCase();
  } catch {
    return false;
  }
}

// ============================================
// Circuit Witness Generation
// ============================================

/**
 * Generate circuit witness (all inputs for proof generation)
 *
 * @param deposit - Deposit object with secrets
 * @param merkleProof - Merkle proof for the deposit
 * @param recipient - Address to receive withdrawn funds
 * @param relayer - Relayer address (0x0 for no relayer)
 * @param fee - Relayer fee in wei (default: 0)
 * @param refund - Refund amount in wei (default: 0)
 * @returns Circuit witness object
 */
export async function generateWitness(
  deposit: Deposit,
  merkleProof: MerkleProof,
  recipient: string,
  relayer: string = ZeroAddress,
  fee: bigint = BigInt(0),
  refund: bigint = BigInt(0),
): Promise<CircuitWitness> {
  // Validate inputs
  if (!deposit.nullifier || !deposit.secret) {
    throw new TorxError(
      ErrorCode.INVALID_SECRET,
      "Deposit must have nullifier and secret",
      { deposit },
    );
  }

  // Ensure we have the correct number of path elements
  if (merkleProof.pathElements.length !== TREE_HEIGHT) {
    throw new TorxError(
      ErrorCode.INVALID_MERKLE_PROOF,
      `Merkle proof must have ${TREE_HEIGHT} path elements`,
      { actual: merkleProof.pathElements.length },
    );
  }

  // Recompute nullifier hash to verify
  const nullifierHash = await computeNullifierHash(deposit.nullifier);
  if (nullifierHash !== deposit.nullifierHash) {
    throw new TorxError(
      ErrorCode.INVALID_NULLIFIER,
      "Nullifier hash mismatch",
      { expected: deposit.nullifierHash, actual: nullifierHash },
    );
  }

  return {
    // Public inputs
    root: merkleProof.root,
    nullifierHash: deposit.nullifierHash,
    recipient: BigInt(recipient).toString(),
    relayer: BigInt(relayer).toString(),
    fee: fee.toString(),
    refund: refund.toString(),

    // Private inputs
    nullifier: deposit.nullifier.toString(),
    secret: deposit.secret.toString(),
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
  };
}

// ============================================
// zk-SNARK Proof Generation
// ============================================

/**
 * Find circuit artifacts
 * Looks in common locations for the circuit files
 *
 * @param customPath - Custom path to circuit directory
 * @returns Paths to wasm and proving key
 */
function findCircuitArtifacts(customPath?: string): {
  wasmPath: string;
  provingKeyPath: string;
} {
  const basePaths = customPath
    ? [customPath]
    : [
        path.join(__dirname, "../../circuits/build"),
        path.join(__dirname, "../../../circuits/build"),
        path.join(process.cwd(), "circuits/build"),
      ];

  for (const basePath of basePaths) {
    const wasmPath = path.join(basePath, "withdraw_js/withdraw.wasm");
    const provingKeyPath = path.join(basePath, "withdraw_final.zkey");

    if (fs.existsSync(wasmPath) && fs.existsSync(provingKeyPath)) {
      return { wasmPath, provingKeyPath };
    }
  }

  throw new TorxError(
    ErrorCode.CIRCUIT_NOT_FOUND,
    "Circuit artifacts not found. Run npm run setup:circuits first.",
    { searchedPaths: basePaths },
  );
}

/**
 * Generate zk-SNARK proof for withdrawal
 *
 * @param witness - Circuit witness (all inputs)
 * @param circuitPath - Optional custom path to circuit artifacts
 * @returns Groth16 proof and public signals
 *
 * @example
 * ```typescript
 * const witness = await generateWitness(deposit, merkleProof, recipient);
 * const { proof, publicSignals } = await generateProof(witness);
 * ```
 */
export async function generateProof(
  witness: CircuitWitness,
  circuitPath?: string,
): Promise<WithdrawalProof> {
  try {
    const { wasmPath, provingKeyPath } = findCircuitArtifacts(circuitPath);

    console.log("Generating zk-SNARK proof...");
    console.log("WASM:", wasmPath);
    console.log("Proving key:", provingKeyPath);

    const startTime = Date.now();

    // Generate proof using snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      witness,
      wasmPath,
      provingKeyPath,
    );

    const elapsedTime = Date.now() - startTime;
    console.log(`✓ Proof generated in ${elapsedTime}ms`);

    // Format proof for Solidity
    const formattedProof: Groth16Proof = {
      pi_a: [proof.pi_a[0], proof.pi_a[1]],
      pi_b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      pi_c: [proof.pi_c[0], proof.pi_c[1]],
      protocol: "groth16",
      curve: "bn128",
    };

    const formattedSignals: PublicSignals = {
      root: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, "0"),
      nullifierHash:
        "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, "0"),
      recipient: "0x" + BigInt(publicSignals[2]).toString(16).padStart(40, "0"),
      relayer: "0x" + BigInt(publicSignals[3]).toString(16).padStart(40, "0"),
      fee: BigInt(publicSignals[4]).toString(),
      refund: BigInt(publicSignals[5]).toString(),
    };

    return {
      proof: formattedProof,
      publicSignals: formattedSignals,
    };
  } catch (error: any) {
    throw new TorxError(
      ErrorCode.PROOF_GENERATION_FAILED,
      "Failed to generate zk-SNARK proof",
      { error: error.message, witness },
    );
  }
}

/**
 * Generate complete withdrawal proof (Merkle proof + zk-SNARK)
 * This is the main function to call for withdrawals
 *
 * @param poolAddress - Privacy pool contract address
 * @param deposit - Deposit object with secrets
 * @param recipient - Address to receive funds
 * @param provider - Ethereum provider
 * @param options - Optional withdrawal options
 * @returns Complete withdrawal proof ready for on-chain submission
 *
 * @example
 * ```typescript
 * const withdrawalProof = await generateWithdrawalProof(
 *   poolAddress,
 *   deposit,
 *   recipientAddress,
 *   provider,
 *   { relayer: relayerAddress, fee: parseEther('0.0001') }
 * );
 * ```
 */
export async function generateWithdrawalProof(
  poolAddress: string,
  deposit: Deposit,
  recipient: string,
  provider: Provider,
  options: {
    relayer?: string;
    fee?: bigint;
    refund?: bigint;
    circuitPath?: string;
  } = {},
): Promise<WithdrawalProof> {
  // Validate deposit has leafIndex
  if (deposit.leafIndex === undefined) {
    throw new TorxError(
      ErrorCode.INVALID_COMMITMENT,
      "Deposit must have leafIndex. Make sure deposit transaction was confirmed.",
      { deposit },
    );
  }

  // Step 1: Generate Merkle proof
  console.log("Step 1/3: Generating Merkle proof...");
  const merkleProof = await generateMerkleProof(
    poolAddress,
    deposit.leafIndex,
    provider,
  );
  console.log("✓ Merkle proof generated");

  // Step 2: Verify Merkle proof locally
  console.log("Step 2/3: Verifying Merkle proof...");
  const isValid = await verifyMerkleProof(merkleProof);
  if (!isValid) {
    throw new TorxError(
      ErrorCode.INVALID_MERKLE_PROOF,
      "Generated Merkle proof is invalid",
      { merkleProof },
    );
  }
  console.log("✓ Merkle proof verified");

  // Step 3: Generate zk-SNARK proof
  console.log(
    "Step 3/3: Generating zk-SNARK proof (this takes ~10 seconds)...",
  );
  const relayer = options.relayer || ZeroAddress;
  const fee = options.fee || BigInt(0);
  const refund = options.refund || BigInt(0);

  const witness = await generateWitness(
    deposit,
    merkleProof,
    recipient,
    relayer,
    fee,
    refund,
  );
  const withdrawalProof = await generateProof(witness, options.circuitPath);

  console.log("✓ Withdrawal proof generated successfully!");

  return withdrawalProof;
}

// ============================================
// Proof Verification
// ============================================

/**
 * Verify zk-SNARK proof locally (off-chain)
 * Useful for testing before submitting on-chain
 *
 * @param proof - Groth16 proof
 * @param publicSignals - Public signals
 * @param verificationKeyPath - Path to verification key
 * @returns True if proof is valid
 */
export async function verifyProofLocally(
  proof: Groth16Proof,
  publicSignals: PublicSignals,
  verificationKeyPath?: string,
): Promise<boolean> {
  try {
    const vKeyPath =
      verificationKeyPath ||
      path.join(__dirname, DEFAULT_VERIFICATION_KEY.replace("../", "../../"));

    if (!fs.existsSync(vKeyPath)) {
      throw new TorxError(
        ErrorCode.VERIFICATION_KEY_NOT_FOUND,
        "Verification key not found",
        { path: vKeyPath },
      );
    }

    const vKey = JSON.parse(fs.readFileSync(vKeyPath, "utf-8"));

    // Convert public signals to array
    const publicSignalsArray = [
      publicSignals.root,
      publicSignals.nullifierHash,
      publicSignals.recipient,
      publicSignals.relayer,
      publicSignals.fee,
      publicSignals.refund,
    ];

    // Verify with snarkjs
    const isValid = await snarkjs.groth16.verify(
      vKey,
      publicSignalsArray,
      proof,
    );

    return isValid;
  } catch (error: any) {
    throw new TorxError(
      ErrorCode.PROOF_VERIFICATION_FAILED,
      "Failed to verify proof locally",
      { error: error.message },
    );
  }
}

/**
 * Verify proof on-chain (via contract call)
 *
 * @param poolAddress - Privacy pool contract address
 * @param proof - Groth16 proof
 * @param publicSignals - Public signals
 * @param provider - Ethereum provider
 * @returns True if proof is valid on-chain
 */
export async function verifyProofOnChain(
  poolAddress: string,
  proof: Groth16Proof,
  publicSignals: PublicSignals,
  provider: Provider,
): Promise<boolean> {
  const poolAbi = [
    "function verifier() external view returns (address)",
    "function isKnownRoot(bytes32 _root) external view returns (bool)",
    "function isSpent(bytes32 _nullifierHash) external view returns (bool)",
  ];

  const verifierAbi = [
    "function verifyProof(uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[6] memory input) external view returns (bool)",
  ];

  try {
    const pool = new Contract(poolAddress, poolAbi, provider);

    // Check if root is known
    const isKnownRoot = await pool.isKnownRoot(publicSignals.root);
    if (!isKnownRoot) {
      console.warn("Root not found in pool history");
      return false;
    }

    // Check if already spent
    const isSpent = await pool.isSpent(publicSignals.nullifierHash);
    if (isSpent) {
      console.warn("Note already spent");
      return false;
    }

    // Get verifier contract
    const verifierAddress = await pool.verifier();
    const verifier = new Contract(verifierAddress, verifierAbi, provider);

    // Format proof for contract call
    const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const b = [
      [BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1])],
      [BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])],
    ];
    const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
    const input = [
      BigInt(publicSignals.root),
      BigInt(publicSignals.nullifierHash),
      BigInt(publicSignals.recipient),
      BigInt(publicSignals.relayer),
      BigInt(publicSignals.fee),
      BigInt(publicSignals.refund),
    ];

    // Verify proof
    return await verifier.verifyProof(a, b, c, input);
  } catch (error: any) {
    throw new TorxError(
      ErrorCode.PROOF_VERIFICATION_FAILED,
      "Failed to verify proof on-chain",
      { error: error.message },
    );
  }
}

// ============================================
// Proof Formatting for Transactions
// ============================================

/**
 * Format proof for contract withdraw() call
 * Converts proof to flat uint256[8] array for Solidity
 *
 * @param proof - Groth16 proof
 * @returns Flattened proof array [a0, a1, b00, b01, b10, b11, c0, c1]
 */
export function formatProofForTransaction(proof: Groth16Proof): string[] {
  return [
    proof.pi_a[0],
    proof.pi_a[1],
    proof.pi_b[0][0],
    proof.pi_b[0][1],
    proof.pi_b[1][0],
    proof.pi_b[1][1],
    proof.pi_c[0],
    proof.pi_c[1],
  ];
}

/**
 * Parse proof from transaction format
 *
 * @param flatProof - Flattened proof array
 * @returns Groth16Proof object
 */
export function parseProofFromTransaction(flatProof: string[]): Groth16Proof {
  if (flatProof.length !== 8) {
    throw new Error("Invalid flat proof length. Expected 8 elements.");
  }

  return {
    pi_a: [flatProof[0], flatProof[1]],
    pi_b: [
      [flatProof[2], flatProof[3]],
      [flatProof[4], flatProof[5]],
    ],
    pi_c: [flatProof[6], flatProof[7]],
    protocol: "groth16",
    curve: "bn128",
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Estimate proof generation time based on system
 *
 * @returns Estimated time in seconds
 */
export function estimateProofTime(): number {
  // Height 32 circuit with ~44k constraints
  // CPU: 8-12 seconds
  // GPU accelerated: 2-4 seconds
  return 10;
}

/**
 * Get proof size in bytes
 *
 * @returns Size of Groth16 proof in bytes (constant)
 */
export function getProofSize(): number {
  // Groth16 proof: 2 G1 points (64 bytes) + 1 G2 point (128 bytes/2 = 64 bytes for compressed)
  // Actually it's: 2*32 (pi_a) + 2*2*32 (pi_b) + 2*32 (pi_c) = 256 bytes uncompressed
  // But typically transmitted as ~128 bytes
  return 128;
}

/**
 * Check if circuit artifacts exist
 *
 * @param customPath - Optional custom circuit path
 * @returns True if all required files exist
 */
export function checkCircuitArtifacts(customPath?: string): boolean {
  try {
    findCircuitArtifacts(customPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Export All
// ============================================

export default {
  // Main functions
  generateMerkleProof,
  generateWitness,
  generateProof,
  generateWithdrawalProof,

  // Verification
  verifyMerkleProof,
  verifyProofLocally,
  verifyProofOnChain,

  // Formatting
  formatProofForTransaction,
  parseProofFromTransaction,

  // Utilities
  estimateProofTime,
  getProofSize,
  checkCircuitArtifacts,
};
