#!/bin/bash

# Circom Installation Script for macOS
# This script installs Circom 2.1.6 to ~/bin (no sudo required)

set -e

echo "=========================================="
echo "Circom Installation for torx402"
echo "=========================================="
echo ""

# Configuration
CIRCOM_VERSION="2.1.6"
CIRCOM_URL="https://github.com/iden3/circom/releases/download/v${CIRCOM_VERSION}/circom-macos-amd64"
INSTALL_DIR="$HOME/bin"
CIRCOM_PATH="$INSTALL_DIR/circom"

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bash_profile"
    SHELL_NAME="bash"
else
    SHELL_CONFIG="$HOME/.profile"
    SHELL_NAME="sh"
fi

echo "Detected shell: $SHELL_NAME"
echo "Shell config: $SHELL_CONFIG"
echo "Install directory: $INSTALL_DIR"
echo ""

# Step 1: Create install directory
echo "Step 1/4: Creating install directory..."
mkdir -p "$INSTALL_DIR"
echo "✓ Created: $INSTALL_DIR"
echo ""

# Step 2: Download Circom
echo "Step 2/4: Downloading Circom v${CIRCOM_VERSION}..."
echo "URL: $CIRCOM_URL"
echo ""

if command -v curl &> /dev/null; then
    curl -L --progress-bar "$CIRCOM_URL" -o "$CIRCOM_PATH"
elif command -v wget &> /dev/null; then
    wget --show-progress "$CIRCOM_URL" -O "$CIRCOM_PATH"
else
    echo "Error: Neither curl nor wget found. Please install one of them."
    exit 1
fi

echo "✓ Downloaded successfully"
echo ""

# Step 3: Make executable
echo "Step 3/4: Making Circom executable..."
chmod +x "$CIRCOM_PATH"

# Remove quarantine attribute on macOS (if exists)
if command -v xattr &> /dev/null; then
    xattr -d com.apple.quarantine "$CIRCOM_PATH" 2>/dev/null || true
fi

echo "✓ Circom is now executable"
echo ""

# Step 4: Add to PATH
echo "Step 4/4: Configuring PATH..."

# Check if already in PATH
if echo "$PATH" | grep -q "$INSTALL_DIR"; then
    echo "✓ $INSTALL_DIR is already in PATH"
else
    # Add to shell config
    echo "" >> "$SHELL_CONFIG"
    echo "# Added by torx402 Circom installer" >> "$SHELL_CONFIG"
    echo 'export PATH="$HOME/bin:$PATH"' >> "$SHELL_CONFIG"
    echo "✓ Added $INSTALL_DIR to PATH in $SHELL_CONFIG"
    echo ""
    echo "⚠️  Please run: source $SHELL_CONFIG"
    echo "   Or restart your terminal for PATH changes to take effect"
fi

echo ""

# Verify installation
echo "=========================================="
echo "Verifying Installation..."
echo "=========================================="
echo ""

# Try to run circom with full path first
if [ -f "$CIRCOM_PATH" ]; then
    VERSION_OUTPUT=$($CIRCOM_PATH --version 2>&1 || echo "failed")
    if echo "$VERSION_OUTPUT" | grep -q "circom compiler"; then
        echo "✓ Circom installed successfully!"
        echo ""
        echo "Version: $VERSION_OUTPUT"
        echo "Location: $CIRCOM_PATH"
        echo ""

        # Check if in current PATH
        if command -v circom &> /dev/null; then
            echo "✓ Circom is in your PATH and ready to use"
        else
            echo "⚠️  Circom installed but not in current PATH"
            echo "   Run: export PATH=\"\$HOME/bin:\$PATH\""
            echo "   Or: source $SHELL_CONFIG"
        fi
    else
        echo "⚠️  Circom installed but version check failed"
        echo "   This might be an architecture issue (Intel vs Apple Silicon)"
        echo ""
        echo "If you have Apple Silicon (M1/M2/M3), try:"
        echo "  softwareupdate --install-rosetta"
        echo "  arch -x86_64 $CIRCOM_PATH --version"
    fi
else
    echo "❌ Installation failed - file not found: $CIRCOM_PATH"
    exit 1
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Run: source $SHELL_CONFIG"
echo "     OR restart your terminal"
echo ""
echo "  2. Verify: circom --version"
echo ""
echo "  3. Continue with circuit setup:"
echo "     cd circuits"
echo "     npm run download:ptau"
echo "     npm run build:circuit"
echo "     npm run setup:keys"
echo ""
