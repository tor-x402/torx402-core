#!/bin/bash

# Download Powers of Tau for Groth16 trusted setup
# This script downloads the Powers of Tau ceremony file needed for circuit compilation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"

# Powers of Tau configuration
# Using 2^17 (131,072 constraints) for height 32 circuit (~44,000 constraints)
PTAU_POWER=17
PTAU_FILE="powersOfTau28_hez_final_${PTAU_POWER}.ptau"
# Alternative URLs if primary fails:
# https://hermez.s3-eu-west-1.amazonaws.com/${PTAU_FILE}
# https://storage.googleapis.com/zkevm/ptau/${PTAU_FILE}
PTAU_URL="https://storage.googleapis.com/zkevm/ptau/${PTAU_FILE}"

echo "=========================================="
echo "torx402 - Powers of Tau Download"
echo "=========================================="
echo ""
echo "Circuit: withdraw.circom (height 32)"
echo "Expected constraints: ~44,000"
echo "Powers of Tau: 2^${PTAU_POWER} (131,072 constraints)"
echo ""

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

# Check if file already exists
if [ -f "$BUILD_DIR/$PTAU_FILE" ]; then
    echo "✓ Powers of Tau file already exists: $PTAU_FILE"
    echo ""
    echo "File size: $(du -h "$BUILD_DIR/$PTAU_FILE" | cut -f1)"
    echo ""
    echo "To re-download, delete the file first:"
    echo "  rm $BUILD_DIR/$PTAU_FILE"
    echo ""
    exit 0
fi

echo "Downloading Powers of Tau ceremony file..."
echo "Source: $PTAU_URL"
echo "Destination: $BUILD_DIR/$PTAU_FILE"
echo ""
echo "This may take a few minutes (file size: ~288 MB)..."
echo ""

# Download using curl with progress bar
if command -v curl &> /dev/null; then
    curl -L --progress-bar "$PTAU_URL" -o "$BUILD_DIR/$PTAU_FILE"
elif command -v wget &> /dev/null; then
    wget --show-progress "$PTAU_URL" -O "$BUILD_DIR/$PTAU_FILE"
else
    echo "Error: Neither curl nor wget found. Please install one of them."
    exit 1
fi

echo ""
echo "✓ Download complete!"
echo ""
echo "File: $BUILD_DIR/$PTAU_FILE"
echo "Size: $(du -h "$BUILD_DIR/$PTAU_FILE" | cut -f1)"
echo ""
echo "Next steps:"
echo "  1. Compile circuit: npm run build:circuit"
echo "  2. Generate keys: npm run setup:keys"
echo ""
