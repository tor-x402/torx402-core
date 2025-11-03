#!/bin/bash

# Generate proving and verification keys for torx402 circuits
# This performs the "Phase 2" trusted setup for the specific circuit

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"
CONTRACTS_DIR="$CIRCUITS_DIR/../contracts/contracts"

# Configuration
CIRCUIT_NAME="withdraw"
PTAU_POWER=17
PTAU_FILE="powersOfTau28_hez_final_${PTAU_POWER}.ptau"

echo "=========================================="
echo "torx402 - Trusted Setup (Phase 2)"
echo "=========================================="
echo ""
echo "Circuit: ${CIRCUIT_NAME}.circom"
echo "Merkle tree height: 32"
echo "Setup type: UNSAFE (for testing only)"
echo ""
echo "⚠️  WARNING: This uses a single-party setup"
echo "⚠️  DO NOT use in production!"
echo "⚠️  For mainnet, perform multi-party ceremony"
echo ""

# Check if Powers of Tau exists
if [ ! -f "$BUILD_DIR/$PTAU_FILE" ]; then
    echo "Error: Powers of Tau file not found!"
    echo "Expected: $BUILD_DIR/$PTAU_FILE"
    echo ""
    echo "Run: npm run download:ptau"
    exit 1
fi

# Check if circuit is compiled
if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" ]; then
    echo "Error: Circuit not compiled!"
    echo "Expected: $BUILD_DIR/${CIRCUIT_NAME}.r1cs"
    echo ""
    echo "Run: npm run build:circuit"
    exit 1
fi

# Show circuit info
echo "Circuit information:"
snarkjs r1cs info "$BUILD_DIR/${CIRCUIT_NAME}.r1cs"
echo ""

# Step 1: Start a new zkey (first contribution)
echo "Step 1/5: Initializing proving key..."
snarkjs groth16 setup \
    "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" \
    "$BUILD_DIR/$PTAU_FILE" \
    "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"
echo "✓ Initial proving key generated"
echo ""

# Step 2: Contribute to the ceremony (unsafe single contribution)
echo "Step 2/5: Contributing randomness (unsafe test setup)..."
echo "torx402-test-contribution" | snarkjs zkey contribute \
    "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey" \
    "$BUILD_DIR/${CIRCUIT_NAME}_0001.zkey" \
    --name="Test Contribution" \
    -v
echo "✓ Contribution complete"
echo ""

# Step 3: Export verification key
echo "Step 3/5: Exporting verification key..."
snarkjs zkey export verificationkey \
    "$BUILD_DIR/${CIRCUIT_NAME}_0001.zkey" \
    "$BUILD_DIR/${CIRCUIT_NAME}_verification_key.json"
echo "✓ Verification key exported"
echo ""

# Step 4: Generate Solidity verifier
echo "Step 4/5: Generating Solidity verifier contract..."
snarkjs zkey export solidityverifier \
    "$BUILD_DIR/${CIRCUIT_NAME}_0001.zkey" \
    "$CONTRACTS_DIR/Verifier.sol"

# Update Solidity version in Verifier.sol
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' 's/pragma solidity \^0\.[0-9]\.[0-9];/pragma solidity ^0.7.6;/' "$CONTRACTS_DIR/Verifier.sol"
else
    # Linux
    sed -i 's/pragma solidity \^0\.[0-9]\.[0-9];/pragma solidity ^0.7.6;/' "$CONTRACTS_DIR/Verifier.sol"
fi

echo "✓ Verifier contract generated: $CONTRACTS_DIR/Verifier.sol"
echo ""

# Step 5: Rename final key
echo "Step 5/5: Finalizing proving key..."
cp "$BUILD_DIR/${CIRCUIT_NAME}_0001.zkey" "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey"
echo "✓ Final proving key ready"
echo ""

# Cleanup intermediate files
echo "Cleaning up intermediate files..."
rm -f "$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"
echo "✓ Cleanup complete"
echo ""

# Summary
echo "=========================================="
echo "✓ Trusted Setup Complete!"
echo "=========================================="
echo ""
echo "Generated files:"
echo "  Proving key:       $BUILD_DIR/${CIRCUIT_NAME}_final.zkey"
echo "  Verification key:  $BUILD_DIR/${CIRCUIT_NAME}_verification_key.json"
echo "  Verifier contract: $CONTRACTS_DIR/Verifier.sol"
echo ""
echo "Proving key info:"
snarkjs zkey export json "$BUILD_DIR/${CIRCUIT_NAME}_final.zkey" "$BUILD_DIR/${CIRCUIT_NAME}_final.json" 2>/dev/null || true
if [ -f "$BUILD_DIR/${CIRCUIT_NAME}_final.json" ]; then
    echo "  Protocol: Groth16"
    echo "  Curve: bn128"
    echo "  Contributions: 1 (UNSAFE - testing only)"
fi
echo ""
echo "Next steps:"
echo "  1. Compile contracts: cd ../contracts && npm run compile"
echo "  2. Run tests: npm test"
echo "  3. Deploy to testnet: npm run deploy:base-sepolia"
echo ""
echo "⚠️  IMPORTANT: This uses an unsafe single-party setup"
echo "⚠️  For production, use multi-party ceremony with 3+ participants"
echo ""
