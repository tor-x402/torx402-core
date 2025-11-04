// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

/**
 * @title MockVerifier
 * @dev Mock Groth16 verifier for testing purposes
 *
 * WARNING: This contract ALWAYS returns true for any proof!
 * This is ONLY for testing the integration flow without real zk-SNARKs.
 * DO NOT use in production!
 *
 * In production, use the actual Verifier.sol generated from circuits.
 */
contract MockVerifier {
    // Allow tests to force verification failure
    bool public shouldFail = false;

    // Track verification calls for testing
    uint256 public verificationCount = 0;
    bytes32 public lastRoot;
    bytes32 public lastNullifierHash;
    address public lastRecipient;
    address public lastRelayer;
    uint256 public lastFee;
    uint256 public lastRefund;

    /**
     * @dev Mock proof verification (always returns true unless shouldFail is set)
     * @param a Proof component A (ignored in mock)
     * @param b Proof component B (ignored in mock)
     * @param c Proof component C (ignored in mock)
     * @param input Public inputs [root, nullifierHash, recipient, relayer, fee, refund]
     * @return True if shouldFail is false
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[6] memory input
    ) external view returns (bool) {
        // Suppress unused variable warnings
        a;
        b;
        c;
        input;

        // Always return true for testing (mock verifier)
        // In production, use the real Verifier.sol from circuits
        return !shouldFail;
    }

    /**
     * @dev Set verification to fail (for testing error cases)
     * @param _shouldFail True to make verification fail
     */
    function setShouldFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }

    /**
     * @dev Reset verification state
     */
    function reset() external {
        verificationCount = 0;
        lastRoot = bytes32(0);
        lastNullifierHash = bytes32(0);
        lastRecipient = address(0);
        lastRelayer = address(0);
        lastFee = 0;
        lastRefund = 0;
        shouldFail = false;
    }

    /**
     * @dev Get last verification inputs (for test assertions)
     */
    function getLastVerification()
        external
        view
        returns (
            bytes32 root,
            bytes32 nullifierHash,
            address recipientAddr,
            address relayerAddr,
            uint256 fee,
            uint256 refund
        )
    {
        return (
            lastRoot,
            lastNullifierHash,
            lastRecipient,
            lastRelayer,
            lastFee,
            lastRefund
        );
    }
}
