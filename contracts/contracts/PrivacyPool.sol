// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./MerkleTreeWithHistory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IVerifier
 * @dev Interface for Groth16 zk-SNARK verifier
 */
interface IVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[6] memory input
    ) external view returns (bool);
}

/**
 * @title PrivacyPool
 * @dev Privacy-preserving payment pool for torx402 protocol
 *
 * Features:
 * - Fixed denomination deposits (0.001 ETH)
 * - Zero-knowledge proof withdrawals
 * - Height 32 Merkle tree (4.3B capacity)
 * - 10,000 root history for high volume
 * - Double-spend prevention via nullifiers
 * - Support for relayer fees
 * - Optimized for micropayments
 */
contract PrivacyPool is MerkleTreeWithHistory, ReentrancyGuard {
    // Verifier contract for zk-SNARK proofs
    IVerifier public immutable verifier;

    // Fixed denomination for this pool (in wei)
    uint256 public immutable denomination;

    // Nullifier tracking to prevent double-spending
    // nullifierHash => spent status
    mapping(bytes32 => bool) public nullifierHashes;

    // Commitment tracking to prevent duplicate deposits
    // commitment => exists status
    mapping(bytes32 => bool) public commitments;

    // Events
    event Deposit(
        bytes32 indexed commitment,
        uint32 leafIndex,
        uint256 timestamp
    );

    event Withdrawal(
        address to,
        bytes32 nullifierHash,
        address indexed relayer,
        uint256 fee
    );

    /**
     * @dev Constructor
     * @param _verifier Address of Groth16 verifier contract
     * @param _hasher Address of MiMC hasher contract
     * @param _denomination Fixed deposit amount in wei (e.g., 0.001 ETH = 1000000000000000)
     * @param _merkleTreeHeight Height of Merkle tree (recommended: 32)
     */
    constructor(
        IVerifier _verifier,
        IHasher _hasher,
        uint256 _denomination,
        uint32 _merkleTreeHeight
    ) MerkleTreeWithHistory(_merkleTreeHeight, _hasher) {
        require(
            address(_verifier) != address(0),
            "PrivacyPool: invalid verifier address"
        );
        require(
            _denomination > 0,
            "PrivacyPool: denomination must be greater than 0"
        );

        verifier = _verifier;
        denomination = _denomination;
    }

    /**
     * @dev Deposit funds into the pool
     * @param _commitment Pedersen hash of (nullifier, secret)
     *
     * The commitment is computed as: commitment = PedersenHash(nullifier || secret)
     * where nullifier and secret are both 248-bit random values.
     *
     * The caller must send exactly `denomination` ETH with this transaction.
     */
    function deposit(bytes32 _commitment) external payable nonReentrant {
        require(
            msg.value == denomination,
            "PrivacyPool: incorrect deposit amount"
        );
        require(
            !commitments[_commitment],
            "PrivacyPool: commitment already exists"
        );
        require(_commitment != bytes32(0), "PrivacyPool: invalid commitment");

        // Insert commitment into Merkle tree
        uint32 insertedIndex = _insert(_commitment);

        // Mark commitment as used
        commitments[_commitment] = true;

        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    /**
     * @dev Withdraw funds from the pool using a zk-SNARK proof
     * @param _proof Groth16 proof components [a, b, c]
     * @param _root Merkle root (must be in history)
     * @param _nullifierHash Hash of nullifier to prevent double-spend
     * @param _recipient Address to receive the funds
     * @param _relayer Address of relayer (0x0 if no relayer)
     * @param _fee Fee paid to relayer (must be <= denomination)
     * @param _refund Refund amount (for future use, currently 0)
     *
     * The proof demonstrates knowledge of:
     * - A valid commitment in the Merkle tree
     * - The nullifier and secret corresponding to that commitment
     * - Without revealing which specific commitment
     *
     * Public inputs to the proof are:
     * [root, nullifierHash, recipient, relayer, fee, refund]
     */
    function withdraw(
        uint256[8] calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash,
        address payable _recipient,
        address payable _relayer,
        uint256 _fee,
        uint256 _refund
    ) external payable nonReentrant {
        require(
            _recipient != address(0),
            "PrivacyPool: invalid recipient address"
        );
        require(_fee <= denomination, "PrivacyPool: fee exceeds denomination");
        require(_refund == 0, "PrivacyPool: refund not supported yet");
        require(
            !nullifierHashes[_nullifierHash],
            "PrivacyPool: note already spent"
        );
        require(
            isKnownRoot(_root),
            "PrivacyPool: merkle root not found in history"
        );

        // Verify zk-SNARK proof
        require(
            _verifyProof(
                _proof,
                _root,
                _nullifierHash,
                _recipient,
                _relayer,
                _fee,
                _refund
            ),
            "PrivacyPool: invalid withdrawal proof"
        );

        // Mark nullifier as spent
        nullifierHashes[_nullifierHash] = true;

        // Calculate amounts
        uint256 recipientAmount = denomination - _fee;

        // Transfer funds to recipient
        (bool recipientSuccess, ) = _recipient.call{value: recipientAmount}("");
        require(recipientSuccess, "PrivacyPool: recipient transfer failed");

        // Transfer fee to relayer (if applicable)
        if (_fee > 0 && _relayer != address(0)) {
            (bool relayerSuccess, ) = _relayer.call{value: _fee}("");
            require(relayerSuccess, "PrivacyPool: relayer transfer failed");
        }

        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    /**
     * @dev Verify the zk-SNARK proof
     * @param _proof Proof components as flat array [a0, a1, b00, b01, b10, b11, c0, c1]
     * @param _root Merkle root
     * @param _nullifierHash Nullifier hash
     * @param _recipient Recipient address
     * @param _relayer Relayer address
     * @param _fee Relayer fee
     * @param _refund Refund amount
     * @return True if proof is valid
     */
    function _verifyProof(
        uint256[8] calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash,
        address _recipient,
        address _relayer,
        uint256 _fee,
        uint256 _refund
    ) private view returns (bool) {
        // Extract proof components
        uint256[2] memory a = [_proof[0], _proof[1]];
        uint256[2][2] memory b = [
            [_proof[2], _proof[3]],
            [_proof[4], _proof[5]]
        ];
        uint256[2] memory c = [_proof[6], _proof[7]];

        // Public inputs (signals)
        uint256[6] memory input = [
            uint256(_root),
            uint256(_nullifierHash),
            uint256(uint160(_recipient)),
            uint256(uint160(_relayer)),
            _fee,
            _refund
        ];

        return verifier.verifyProof(a, b, c, input);
    }

    /**
     * @dev Check if a note has been spent
     * @param _nullifierHash The nullifier hash to check
     * @return True if the note has been spent
     */
    function isSpent(bytes32 _nullifierHash) external view returns (bool) {
        return nullifierHashes[_nullifierHash];
    }

    /**
     * @dev Check multiple notes for spent status
     * @param _nullifierHashes Array of nullifier hashes to check
     * @return spent Array of spent statuses
     */
    function isSpentArray(
        bytes32[] calldata _nullifierHashes
    ) external view returns (bool[] memory spent) {
        spent = new bool[](_nullifierHashes.length);
        for (uint256 i = 0; i < _nullifierHashes.length; i++) {
            spent[i] = nullifierHashes[_nullifierHashes[i]];
        }
    }

    /**
     * @dev Get pool information
     * @return poolDenomination The denomination of this pool
     * @return treeHeight The height of the Merkle tree
     * @return nextLeafIndex The index of the next leaf to be inserted
     * @return currentRoot The current Merkle root
     * @return poolBalance The ETH balance of the pool
     */
    function getPoolInfo()
        external
        view
        returns (
            uint256 poolDenomination,
            uint32 treeHeight,
            uint32 nextLeafIndex,
            bytes32 currentRoot,
            uint256 poolBalance
        )
    {
        return (
            denomination,
            levels,
            nextIndex,
            getLastRoot(),
            address(this).balance
        );
    }

    /**
     * @dev Fallback function to reject direct ETH transfers
     * Use deposit() function instead
     */
    receive() external payable {
        revert("PrivacyPool: use deposit() function");
    }
}
