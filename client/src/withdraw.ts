/**
 * torx402 Client Library - Withdrawal
 *
 * Functions for withdrawing funds from privacy pools using zk-SNARK proofs
 * - Submit withdrawal transactions
 * - Handle relayer fees
 * - Direct vs relayer-based withdrawals
 * - Transaction monitoring and confirmation
 */

import {
  Contract,
  Provider,
  Signer,
  ZeroAddress,
  parseEther,
  formatEther,
} from "ethers";
import {
  Deposit,
  WithdrawalProof,
  WithdrawalOptions,
  TorxError,
  ErrorCode,
} from "./types";
import { generateWithdrawalProof } from "./proof";
import { formatProofForTransaction } from "./proof";

// ============================================
// Privacy Pool ABI
// ============================================

const PRIVACY_POOL_ABI = [
  "function withdraw(uint256[8] calldata _proof, bytes32 _root, bytes32 _nullifierHash, address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) external payable",
  "function denomination() external view returns (uint256)",
  "function isSpent(bytes32 _nullifierHash) external view returns (bool)",
  "function isKnownRoot(bytes32 _root) external view returns (bool)",
  "function getPoolInfo() external view returns (uint256 poolDenomination, uint32 treeHeight, uint32 nextLeafIndex, bytes32 currentRoot, uint256 poolBalance)",
  "event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee)",
];

// ============================================
// Direct Withdrawal (No Relayer)
// ============================================

/**
 * Withdraw funds directly without a relayer
 * The recipient pays for the gas themselves
 *
 * @param poolAddress - Privacy pool contract address
 * @param deposit - Deposit object with secrets
 * @param recipient - Address to receive the funds
 * @param signer - Ethereum signer (for transaction)
 * @param provider - Ethereum provider
 * @param options - Transaction options
 * @returns Transaction receipt
 *
 * @example
 * ```typescript
 * const receipt = await withdrawDirect(
 *   poolAddress,
 *   deposit,
 *   recipientAddress,
 *   signer,
 *   provider
 * );
 * console.log('Withdrawn to:', receipt.to);
 * ```
 */
export async function withdrawDirect(
  poolAddress: string,
  deposit: Deposit,
  recipient: string,
  signer: Signer,
  provider: Provider,
  options: WithdrawalOptions = {},
): Promise<any> {
  try {
    console.log("========================================");
    console.log("torx402 - Direct Withdrawal");
    console.log("========================================");
    console.log("");

    // Step 1: Pre-flight checks
    console.log("Pre-flight checks...");
    const pool = new Contract(poolAddress, PRIVACY_POOL_ABI, provider);

    // Check if note already spent
    const isSpent = await pool.isSpent(deposit.nullifierHash);
    if (isSpent) {
      throw new TorxError(
        ErrorCode.NOTE_ALREADY_SPENT,
        "This note has already been spent",
        { nullifierHash: deposit.nullifierHash },
      );
    }
    console.log("✓ Note not spent");

    // Get pool info
    const poolInfo = await pool.getPoolInfo();
    const denomination = poolInfo[0];
    console.log("✓ Pool denomination:", formatEther(denomination), "ETH");
    console.log("");

    // Step 2: Generate withdrawal proof
    console.log("Generating withdrawal proof...");
    console.log("This will take ~10 seconds...");
    console.log("");

    const withdrawalProof = await generateWithdrawalProof(
      poolAddress,
      deposit,
      recipient,
      provider,
      {
        relayer: options.relayer || ZeroAddress,
        fee: options.fee ? BigInt(options.fee) : BigInt(0),
        refund: options.refund ? BigInt(options.refund) : BigInt(0),
      },
    );

    console.log("✓ Proof generated successfully!");
    console.log("");

    // Step 3: Submit withdrawal transaction
    console.log("Submitting withdrawal transaction...");

    const poolWithSigner = pool.connect(signer);

    // Format proof for contract
    const proofArray = formatProofForTransaction(withdrawalProof.proof);

    // Prepare transaction options
    const txOptions: any = { ...options };

    // Submit withdrawal
    const tx = await (poolWithSigner as any).withdraw(
      proofArray,
      withdrawalProof.publicSignals.root,
      withdrawalProof.publicSignals.nullifierHash,
      recipient,
      withdrawalProof.publicSignals.relayer,
      withdrawalProof.publicSignals.fee,
      withdrawalProof.publicSignals.refund,
      txOptions,
    );

    console.log("✓ Transaction submitted:", tx.hash);
    console.log("Waiting for confirmation...");
    console.log("");

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log("========================================");
    console.log("✓ Withdrawal Complete!");
    console.log("========================================");
    console.log("");
    console.log("Transaction:", receipt.hash);
    console.log("Block:", receipt.blockNumber);
    console.log("Recipient:", recipient);
    console.log("Amount:", formatEther(denomination), "ETH");
    console.log("");

    return receipt;
  } catch (error: any) {
    if (error instanceof TorxError) {
      throw error;
    }

    throw new TorxError(
      ErrorCode.WITHDRAWAL_FAILED,
      "Failed to withdraw funds",
      { poolAddress, recipient, error: error.message },
    );
  }
}

/**
 * Withdraw funds via a relayer
 * The relayer submits the transaction and pays gas, taking a fee
 *
 * @param poolAddress - Privacy pool contract address
 * @param deposit - Deposit object with secrets
 * @param recipient - Address to receive the funds
 * @param relayerAddress - Relayer's address
 * @param relayerFee - Fee to pay the relayer (in wei)
 * @param provider - Ethereum provider
 * @param options - Withdrawal options
 * @returns Withdrawal proof (to send to relayer)
 *
 * @example
 * ```typescript
 * const proof = await withdrawViaRelayer(
 *   poolAddress,
 *   deposit,
 *   recipientAddress,
 *   relayerAddress,
 *   parseEther('0.0001'), // 0.0001 ETH fee
 *   provider
 * );
 * // Send proof to relayer endpoint
 * await fetch('https://relayer.example.com/relay', {
 *   method: 'POST',
 *   body: JSON.stringify(proof)
 * });
 * ```
 */
export async function withdrawViaRelayer(
  poolAddress: string,
  deposit: Deposit,
  recipient: string,
  relayerAddress: string,
  relayerFee: bigint,
  provider: Provider,
  options: WithdrawalOptions = {},
): Promise<WithdrawalProof> {
  try {
    console.log("========================================");
    console.log("torx402 - Relayer Withdrawal");
    console.log("========================================");
    console.log("");

    // Validate relayer fee
    const pool = new Contract(poolAddress, PRIVACY_POOL_ABI, provider);
    const poolInfo = await pool.getPoolInfo();
    const denomination = poolInfo[0];

    if (relayerFee >= denomination) {
      throw new TorxError(
        ErrorCode.WITHDRAWAL_FAILED,
        "Relayer fee must be less than denomination",
        { fee: relayerFee.toString(), denomination: denomination.toString() },
      );
    }

    console.log("Pool denomination:", formatEther(denomination), "ETH");
    console.log("Relayer fee:", formatEther(relayerFee), "ETH");
    console.log("You receive:", formatEther(denomination - relayerFee), "ETH");
    console.log("");

    // Check if note already spent
    const isSpent = await pool.isSpent(deposit.nullifierHash);
    if (isSpent) {
      throw new TorxError(
        ErrorCode.NOTE_ALREADY_SPENT,
        "This note has already been spent",
        { nullifierHash: deposit.nullifierHash },
      );
    }

    // Generate proof with relayer info
    console.log("Generating withdrawal proof for relayer...");
    const withdrawalProof = await generateWithdrawalProof(
      poolAddress,
      deposit,
      recipient,
      provider,
      {
        relayer: relayerAddress,
        fee: relayerFee,
        refund: options.refund ? BigInt(options.refund) : BigInt(0),
      },
    );

    console.log("✓ Proof generated!");
    console.log("");
    console.log("Send this proof to the relayer to complete the withdrawal");
    console.log("");

    return withdrawalProof;
  } catch (error: any) {
    if (error instanceof TorxError) {
      throw error;
    }

    throw new TorxError(
      ErrorCode.WITHDRAWAL_FAILED,
      "Failed to generate proof for relayer",
      { error: error.message },
    );
  }
}

// ============================================
// Withdrawal via Smart Contract Call
// ============================================

/**
 * Submit withdrawal transaction using pre-generated proof
 * Use this when you already have a proof generated
 *
 * @param poolAddress - Privacy pool contract address
 * @param withdrawalProof - Pre-generated withdrawal proof
 * @param signer - Ethereum signer
 * @param options - Transaction options
 * @returns Transaction receipt
 */
export async function submitWithdrawal(
  poolAddress: string,
  withdrawalProof: WithdrawalProof,
  signer: Signer,
  options: WithdrawalOptions = {},
): Promise<any> {
  try {
    const pool = new Contract(poolAddress, PRIVACY_POOL_ABI, signer);

    // Format proof for contract
    const proofArray = formatProofForTransaction(withdrawalProof.proof);

    // Prepare transaction
    const txOptions: any = { ...options };

    // Submit withdrawal
    const tx = await pool.withdraw(
      proofArray,
      withdrawalProof.publicSignals.root,
      withdrawalProof.publicSignals.nullifierHash,
      withdrawalProof.publicSignals.recipient,
      withdrawalProof.publicSignals.relayer,
      withdrawalProof.publicSignals.fee,
      withdrawalProof.publicSignals.refund,
      txOptions,
    );

    console.log("Transaction submitted:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log("✓ Withdrawal confirmed in block:", receipt.blockNumber);

    return receipt;
  } catch (error: any) {
    throw new TorxError(
      ErrorCode.WITHDRAWAL_FAILED,
      "Failed to submit withdrawal transaction",
      { error: error.message },
    );
  }
}

// ============================================
// Fee Calculation
// ============================================

/**
 * Calculate optimal relayer fee based on gas price
 *
 * @param provider - Ethereum provider
 * @param gasPriceMultiplier - Multiplier for gas price (default: 1.1 for 10% margin)
 * @returns Recommended fee in wei
 */
export async function calculateRelayerFee(
  provider: Provider,
  gasPriceMultiplier = 1.1,
): Promise<bigint> {
  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || BigInt(0);

    // Estimate withdrawal gas cost (~458,000 gas)
    const WITHDRAWAL_GAS = BigInt(458000);

    // Calculate fee with margin
    const baseFee = gasPrice * WITHDRAWAL_GAS;
    const fee =
      (baseFee * BigInt(Math.floor(gasPriceMultiplier * 100))) / BigInt(100);

    return fee;
  } catch (error) {
    // Fallback: 0.0001 ETH on L2s
    return parseEther("0.0001");
  }
}

/**
 * Get minimum acceptable fee for L2 networks
 *
 * @param network - Network name
 * @returns Minimum fee in wei
 */
export function getMinimumRelayerFee(network: string): bigint {
  const minimumFees: Record<string, string> = {
    baseSepolia: "0.0001",
    base: "0.0001",
    arbitrumSepolia: "0.0001",
    arbitrum: "0.0001",
    optimismSepolia: "0.0001",
    optimism: "0.0001",
    sepolia: "0.001", // L1 is more expensive
    mainnet: "0.01", // L1 mainnet
  };

  const feeETH = minimumFees[network.toLowerCase()] || "0.001";
  return parseEther(feeETH);
}

// ============================================
// Withdrawal Status Checking
// ============================================

/**
 * Check withdrawal status (has note been spent?)
 *
 * @param poolAddress - Privacy pool contract address
 * @param nullifierHash - Nullifier hash to check
 * @param provider - Ethereum provider
 * @returns True if withdrawn (spent)
 */
export async function checkWithdrawalStatus(
  poolAddress: string,
  nullifierHash: string,
  provider: Provider,
): Promise<boolean> {
  const pool = new Contract(poolAddress, PRIVACY_POOL_ABI, provider);
  return await pool.isSpent(nullifierHash);
}

/**
 * Wait for withdrawal to be confirmed
 *
 * @param poolAddress - Privacy pool contract address
 * @param nullifierHash - Nullifier hash to monitor
 * @param provider - Ethereum provider
 * @param timeoutSeconds - Timeout in seconds (default: 300)
 * @returns True when withdrawal is confirmed
 */
export async function waitForWithdrawal(
  poolAddress: string,
  nullifierHash: string,
  provider: Provider,
  timeoutSeconds = 300,
): Promise<boolean> {
  const startTime = Date.now();
  const timeout = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeout) {
    const isSpent = await checkWithdrawalStatus(
      poolAddress,
      nullifierHash,
      provider,
    );

    if (isSpent) {
      return true;
    }

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new TorxError(
    ErrorCode.WITHDRAWAL_FAILED,
    "Withdrawal timeout - note not spent within timeout period",
    { nullifierHash, timeoutSeconds },
  );
}

// ============================================
// Batch Withdrawals (Future)
// ============================================

/**
 * Prepare multiple withdrawals (for future batch support)
 * Currently generates proofs for multiple notes
 *
 * @param poolAddress - Privacy pool contract address
 * @param deposits - Array of deposits to withdraw
 * @param recipient - Address to receive all funds
 * @param provider - Ethereum provider
 * @returns Array of withdrawal proofs
 */
export async function prepareMultipleWithdrawals(
  poolAddress: string,
  deposits: Deposit[],
  recipient: string,
  provider: Provider,
): Promise<WithdrawalProof[]> {
  const proofs: WithdrawalProof[] = [];

  for (const deposit of deposits) {
    console.log(`Generating proof for deposit ${deposit.leafIndex}...`);
    const proof = await generateWithdrawalProof(
      poolAddress,
      deposit,
      recipient,
      provider,
    );
    proofs.push(proof);
  }

  return proofs;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Estimate gas cost for withdrawal
 *
 * @param poolAddress - Privacy pool contract address
 * @param withdrawalProof - Withdrawal proof
 * @param provider - Ethereum provider
 * @returns Estimated gas used
 */
export async function estimateWithdrawalGas(
  poolAddress: string,
  withdrawalProof: WithdrawalProof,
  provider: Provider,
): Promise<bigint> {
  try {
    const pool = new Contract(poolAddress, PRIVACY_POOL_ABI, provider);

    const proofArray = formatProofForTransaction(withdrawalProof.proof);

    const gasEstimate = await pool.withdraw.estimateGas(
      proofArray,
      withdrawalProof.publicSignals.root,
      withdrawalProof.publicSignals.nullifierHash,
      withdrawalProof.publicSignals.recipient,
      withdrawalProof.publicSignals.relayer,
      withdrawalProof.publicSignals.fee,
      withdrawalProof.publicSignals.refund,
    );

    return gasEstimate;
  } catch (error: any) {
    // Return default estimate if estimation fails
    return BigInt(458000);
  }
}

/**
 * Calculate net amount after relayer fee
 *
 * @param denomination - Pool denomination in wei
 * @param relayerFee - Relayer fee in wei
 * @returns Net amount recipient receives
 */
export function calculateNetAmount(
  denomination: bigint,
  relayerFee: bigint,
): bigint {
  if (relayerFee >= denomination) {
    throw new Error("Relayer fee must be less than denomination");
  }
  return denomination - relayerFee;
}

/**
 * Validate withdrawal parameters
 *
 * @param deposit - Deposit object
 * @param recipient - Recipient address
 * @param relayerFee - Relayer fee (optional)
 * @param denomination - Pool denomination
 * @throws TorxError if parameters are invalid
 */
export function validateWithdrawalParams(
  deposit: Deposit,
  recipient: string,
  relayerFee?: bigint,
  denomination?: bigint,
): void {
  // Check deposit has required fields
  if (deposit.leafIndex === undefined) {
    throw new TorxError(
      ErrorCode.INVALID_COMMITMENT,
      "Deposit must have leafIndex. Ensure deposit transaction was confirmed.",
      { deposit },
    );
  }

  if (!deposit.nullifier || !deposit.secret) {
    throw new TorxError(
      ErrorCode.INVALID_SECRET,
      "Deposit must have nullifier and secret",
      { deposit },
    );
  }

  // Validate recipient address
  if (!recipient || recipient === ZeroAddress) {
    throw new TorxError(
      ErrorCode.WITHDRAWAL_FAILED,
      "Invalid recipient address",
      { recipient },
    );
  }

  // Validate relayer fee
  if (relayerFee && denomination) {
    if (relayerFee >= denomination) {
      throw new TorxError(
        ErrorCode.WITHDRAWAL_FAILED,
        "Relayer fee must be less than denomination",
        {
          fee: relayerFee.toString(),
          denomination: denomination.toString(),
        },
      );
    }
  }
}

// ============================================
// Withdrawal Information
// ============================================

/**
 * Get withdrawal estimate
 *
 * @param poolAddress - Privacy pool contract address
 * @param provider - Ethereum provider
 * @param relayerFee - Optional relayer fee
 * @returns Withdrawal estimate details
 */
export async function getWithdrawalEstimate(
  poolAddress: string,
  provider: Provider,
  relayerFee: bigint = BigInt(0),
): Promise<{
  denomination: bigint;
  denominationETH: string;
  relayerFee: bigint;
  relayerFeeETH: string;
  netAmount: bigint;
  netAmountETH: string;
  estimatedGas: bigint;
  estimatedGasCost: bigint;
  estimatedGasCostETH: string;
}> {
  const pool = new Contract(poolAddress, PRIVACY_POOL_ABI, provider);
  const poolInfo = await pool.getPoolInfo();
  const denomination = poolInfo[0];

  const netAmount = denomination - relayerFee;

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || BigInt(0);
  const estimatedGas = BigInt(458000);
  const estimatedGasCost = gasPrice * estimatedGas;

  return {
    denomination,
    denominationETH: formatEther(denomination),
    relayerFee,
    relayerFeeETH: formatEther(relayerFee),
    netAmount,
    netAmountETH: formatEther(netAmount),
    estimatedGas,
    estimatedGasCost,
    estimatedGasCostETH: formatEther(estimatedGasCost),
  };
}

/**
 * Check if withdrawal would be profitable
 * (net amount > gas cost for direct withdrawal)
 *
 * @param poolAddress - Privacy pool contract address
 * @param provider - Ethereum provider
 * @returns True if withdrawal is profitable
 */
export async function isWithdrawalProfitable(
  poolAddress: string,
  provider: Provider,
): Promise<boolean> {
  const estimate = await getWithdrawalEstimate(poolAddress, provider);
  return estimate.netAmount > estimate.estimatedGasCost;
}

// ============================================
// Export All
// ============================================

export default {
  // Main withdrawal functions
  withdrawDirect,
  withdrawViaRelayer,
  submitWithdrawal,

  // Fee calculation
  calculateRelayerFee,
  getMinimumRelayerFee,
  calculateNetAmount,

  // Status checking
  checkWithdrawalStatus,
  waitForWithdrawal,

  // Validation
  validateWithdrawalParams,

  // Information
  getWithdrawalEstimate,
  isWithdrawalProfitable,
  estimateWithdrawalGas,

  // Batch operations
  prepareMultipleWithdrawals,
};
