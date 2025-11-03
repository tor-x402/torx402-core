pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/pedersen.circom";
include "./merkleTree.circom";

/**
 * CommitmentHasher
 * Computes commitment = Pedersen(nullifier || secret)
 * and nullifierHash = Pedersen(nullifier)
 */
template CommitmentHasher() {
    signal input nullifier;
    signal input secret;
    signal output commitment;
    signal output nullifierHash;

    // Hash components
    component commitmentHasher = Pedersen(496);
    component nullifierHasher = Pedersen(248);
    component nullifierBits = Num2Bits(248);
    component secretBits = Num2Bits(248);

    // Convert nullifier and secret to bits
    nullifierBits.in <== nullifier;
    secretBits.in <== secret;

    // Compute nullifierHash = Pedersen(nullifier)
    for (var i = 0; i < 248; i++) {
        nullifierHasher.in[i] <== nullifierBits.out[i];
    }

    // Compute commitment = Pedersen(nullifier || secret)
    for (var i = 0; i < 248; i++) {
        commitmentHasher.in[i] <== nullifierBits.out[i];
        commitmentHasher.in[i + 248] <== secretBits.out[i];
    }

    commitment <== commitmentHasher.out[0];
    nullifierHash <== nullifierHasher.out[0];
}

/**
 * Withdraw
 * Verifies that a commitment corresponding to given nullifier and secret
 * is included in the Merkle tree of deposits
 *
 * Public inputs:
 * - root: Merkle tree root
 * - nullifierHash: Hash of nullifier (prevents double-spend)
 * - recipient: Address receiving the funds
 * - relayer: Address of relayer (for fee)
 * - fee: Fee paid to relayer
 * - refund: Refund amount (future use)
 *
 * Private inputs:
 * - nullifier: Secret random value
 * - secret: Secret random value
 * - pathElements: Sibling hashes for Merkle proof
 * - pathIndices: Path direction bits (0=left, 1=right)
 */
template Withdraw(levels) {
    // Public inputs
    signal input root;
    signal input nullifierHash;
    signal input recipient;
    signal input relayer;
    signal input fee;
    signal input refund;

    // Private inputs
    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Compute commitment and nullifierHash from secrets
    component hasher = CommitmentHasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;

    // Ensure computed nullifierHash matches public input
    hasher.nullifierHash === nullifierHash;

    // Verify commitment is in Merkle tree
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // Add hidden signals to ensure tampering with recipient/fee/relayer/refund
    // invalidates the proof. Squares prevent optimizer from removing constraints.
    signal recipientSquare;
    signal feeSquare;
    signal relayerSquare;
    signal refundSquare;

    recipientSquare <== recipient * recipient;
    feeSquare <== fee * fee;
    relayerSquare <== relayer * relayer;
    refundSquare <== refund * refund;
}

// Main component with height 32 tree
component main {public [root, nullifierHash, recipient, relayer, fee, refund]} = Withdraw(32);
