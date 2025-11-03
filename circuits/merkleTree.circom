pragma circom 2.1.6;

include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/mimcsponge.circom";

/**
 * MerkleTreeChecker
 * Verifies that a leaf is included in a Merkle tree
 *
 * Uses MiMC-Sponge hash function for efficiency in zk-SNARKs
 */
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component selectors[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux();
        selectors[i].in[0] <== i == 0 ? leaf : hashers[i - 1].outs[0];
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = MiMCSponge(2, 220, 1);
        hashers[i].ins[0] <== selectors[i].out[0];
        hashers[i].ins[1] <== selectors[i].out[1];
        hashers[i].k <== 0;
    }

    // Verify the calculated root matches the input root
    root === hashers[levels - 1].outs[0];
}

/**
 * DualMux
 * Multiplexer that selects left/right order for hashing
 *
 * When s = 0: out[0] = in[0], out[1] = in[1] (current is left child)
 * When s = 1: out[0] = in[1], out[1] = in[0] (current is right child)
 */
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    s * (1 - s) === 0; // Ensure s is binary (0 or 1)

    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}
