// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

/**
 * @title MiMCMock
 * @dev Mock implementation of MiMC hasher for testing purposes
 *
 * WARNING: This is NOT a secure hash function!
 * This is only for testing the Merkle tree structure.
 * In production, use the actual MiMC implementation.
 */
contract MiMCMock {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /**
     * @dev Mock MiMC-Sponge hash function
     * @param in_xL Left input value
     * @param in_xR Right input value (used as round constant)
     * @return xL Output hash value
     * @return xR Output state value
     *
     * This is a simplified mock that uses keccak256 internally.
     * Real MiMC uses a series of cube operations over a prime field.
     */
    function MiMCSponge(
        uint256 in_xL,
        uint256 in_xR
    ) external pure returns (uint256 xL, uint256 xR) {
        // Simple mock: hash the inputs and take modulo FIELD_SIZE
        uint256 hashResult = uint256(keccak256(abi.encodePacked(in_xL, in_xR)));

        xL = hashResult % FIELD_SIZE;
        xR = 0; // In the real MiMC, this would be the state

        return (xL, xR);
    }

    /**
     * @dev Alternative hash function for testing
     * Takes two inputs and returns their "hash"
     */
    function hash(uint256 left, uint256 right) external pure returns (uint256) {
        uint256 hash_value = uint256(keccak256(abi.encodePacked(left, right)));
        return hash_value % FIELD_SIZE;
    }
}
