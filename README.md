# torx402-core

Privacy-preserving HTTP micropayment protocol combining Tornado Cash's zero-knowledge privacy with x402 micropayments.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

**🌪️ Tornado Cash Privacy** + ** x402 Micropayments** = ** Anonymous HTTP Payments**

</div>

## What is torx402?

**torx402** enables truly private micropayments over HTTP. By combining:

- **Tornado Cash**: Zero-knowledge privacy through zk-SNARKs (deposit-withdrawal unlinkability)
- **x402 Protocol**: HTTP-native micropayments using the `402 Payment Required` status code

Users can pay for APIs, content, and services **without revealing their identity**, while merchants receive cryptographically verified payments **without knowing who paid**.

## Features

### Core Protocol

- ✅ **Privacy-Preserving**: Zero-knowledge proofs ensure deposit-withdrawal unlinkability
- ✅ **High Volume**: Supports 10,000+ deposits/hour with 10,000 root history
- ✅ **EVM Compatible**: Optimized for L2s (Base, Arbitrum), BSC, and Ethereum
- ✅ **Fixed Denominations**: 0.001 ETH pools
- ✅ **Double-Spend Prevention**: Nullifier hash tracking
- ✅ **Battle-Tested Crypto**: Groth16 zk-SNARKs over BN128 curve

### Packages Included

- ✅ **@torx402/core**: Cryptographic utilities (Pedersen, MiMC, field operations)
- ✅ **Smart Contracts**: PrivacyPool, MerkleTreeWithHistory, Verifier
- ✅ **Circom Circuits**: Height 32 Merkle tree verification
- ✅ **Comprehensive Tests**: 44 passing tests (crypto + contracts)

## Architecture

```
┌─────────────┐                    ┌──────────────┐                    ┌──────────┐
│   Client    │                    │ Privacy Pool │                    │ Merchant │
│             │                    │  (Contract)  │                    │  Server  │
└──────┬──────┘                    └──────┬───────┘                    └────┬─────┘
       │                                  │                                 │
       │  1. Deposit (commitment)         │                                 │
       │─────────────────────────────────>│                                 │
       │                                  │                                 │
       │  2. Request resource (no pay)    │                                 │
       │──────────────────────────────────┼────────────────────────────────>│
       │                                  │                                 │
       │  3. 402 Payment Required         │                                 │
       │<─────────────────────────────────┼─────────────────────────────────│
       │                                  │                                 │
       │  4. Generate zk-SNARK proof      │                                 │
       │  (prove deposit without reveal)  │                                 │
       │                                  │                                 │
       │  5. Request + X-PAYMENT (proof)  │                                 │
       │──────────────────────────────────┼────────────────────────────────>│
       │                                  │                                 │
       │                                  │  6. Verify proof                │
       │                                  │<────────────────────────────────│
       │                                  │                                 │
       │                                  │  7. Withdraw (settle payment)   │
       │                                  │<────────────────────────────────│
       │                                  │                                 │
       │  8. Resource delivered           │                                 │
       │<─────────────────────────────────┼─────────────────────────────────│
       │                                  │                                 │
```

## Repository Structure

This repository is organized as a monorepo containing the core protocol components:

```
torx402-core/
├── crypto/            # @torx402/core - Cryptographic utilities npm package
│   ├── src/
│   │   ├── hash.ts           # Pedersen & MiMC hash functions
│   │   ├── commitment.ts     # Commitment generation
│   │   ├── field.ts          # Field element operations
│   │   ├── random.ts         # Secure random generation
│   │   └── utils.ts          # Conversion utilities
│   ├── test/
│   └── package.json
├── circuits/          # Circom zk-SNARK circuits (height 32)
│   ├── withdraw.circom       # Main withdrawal circuit
│   ├── merkleTree.circom     # Merkle tree verification
│   └── build/                # Compiled circuits & trusted setup
├── contracts/         # Solidity smart contracts
│   ├── PrivacyPool.sol
│   ├── MerkleTreeWithHistory.sol
│   ├── Verifier.sol
│   └── test/
└── package.json       # Monorepo orchestrator
```

**Related Packages:**

- **[@torx402/client](https://github.com/torx402/torx402-client)** - TypeScript client library (separate repository)
- **Server/Facilitator** - Coming soon

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Circom** >= 2.1.6 (for circuit compilation)
- **snarkjs** (for trusted setup and proof generation)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/torx402/torx402-core.git
cd torx402-core
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install Circom (if not already installed)

```bash
# On macOS
brew install circom

# On Linux
curl -sSL https://github.com/iden3/circom/releases/download/v2.1.6/circom-linux-amd64 -o /usr/local/bin/circom
chmod +x /usr/local/bin/circom

# Verify installation
circom --version
```

### 4. Setup circuits and trusted setup

```bash
npm run setup:circuits
```

This will:

- Compile Circom circuits (height 32 Merkle tree)
- Download Powers of Tau ceremony file
- Generate circuit-specific proving and verification keys
- Generate Solidity verifier contract

**⚠️ Development Only**: This uses an unsafe trusted setup for testing. For production, use a multi-party computation (MPC) ceremony.

## Build

Build all components:

```bash
npm run build
```

Or build individually:

```bash
npm run build:crypto      # Build @torx402/core package
npm run build:circuits    # Compile circuits
npm run build:contracts   # Compile smart contracts
```

## Testing

### Run all tests

```bash
npm test
```

Or test individually:

```bash
npm run test:crypto       # Test @torx402/core package (20 tests)
npm run test:contracts    # Test smart contracts (24 tests)
```

**Current test status:** 44 passing tests (20 crypto + 24 contracts)

## Deployment

### Deploy to Base Sepolia (testnet)

1. Configure environment:

```bash
cp contracts/.env.example contracts/.env
# Edit .env with your private key and Base Sepolia RPC URL
```

2. Deploy contracts:

```bash
npm run deploy:testnet
```

This deploys:

- `MerkleTreeWithHistory` (height 32, 10,000 root history)
- `Verifier` (Groth16 proof verifier)
- `PrivacyPool` (0.001 ETH denomination)

### Deploy to other networks

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network <network-name>
```

## Usage

> **Note:** The client library has moved to a separate repository: [@torx402/client](https://github.com/torx402/torx402-client)

### Using @torx402/core (Cryptographic Utilities)

```typescript
import {
  randomBN248,
  computeCommitment,
  computeNullifierHash,
  initializeCrypto,
} from '@torx402/core';

// Initialize crypto libraries
await initializeCrypto();

// Generate random secrets
const nullifier = randomBN248();
const secret = randomBN248();

// Compute commitment
const commitment = await computeCommitment(nullifier, secret);
console.log('Commitment:', commitment);

// Compute nullifier hash
const nullifierHash = await computeNullifierHash(nullifier);
console.log('Nullifier Hash:', nullifierHash);
```

### 1. Deposit (Client)

See [@torx402/client](https://github.com/torx402/torx402-client) for full client library usage.

```typescript
import { generateDeposit, deposit } from '@torx402/client';
import { initializeCrypto } from '@torx402/core';

// Initialize cryptographic libraries
await initializeCrypto();

// Generate secrets and commitment
const depositNote = await generateDeposit();
// => { nullifier, secret, commitment, nullifierHash }

// Deposit to pool
const tx = await deposit(
  poolAddress,
  depositNote.commitment,
  denomination, // 0.001 ETH
  signer
);

// Save your deposit note securely!
console.log('Deposit note:', depositNote.toNote());
```

### 2. Request Resource (HTTP)

```bash
curl https://api.example.com/premium-data
```

Response: `402 Payment Required`

```json
{
  "paymentRequirements": [
    {
      "scheme": "tornado-eth",
      "network": "base-sepolia",
      "amount": "1000000000000000",
      "pool": "0x...",
      "timeout": 300
    }
  ]
}
```

### 3. Generate Proof & Pay (Client)

See [@torx402/client](https://github.com/torx402/torx402-client) for full implementation.

```typescript
import { generateProof, createPaymentHeader, DepositNote } from '@torx402/client';

// Parse deposit note
const note = DepositNote.fromString('tornado-eth-0.001-...');

// Generate zk-SNARK proof
const { proof, publicSignals } = await generateProof({
  deposit: note,
  recipient: merchantAddress,
  relayer: '0x0000000000000000000000000000000000000000', // No relayer
  fee: 0,
  poolAddress,
});

// Create X-PAYMENT header
const paymentHeader = createPaymentHeader(proof, publicSignals);

// Make request with payment
const response = await fetch('https://api.example.com/premium-data', {
  headers: {
    'X-PAYMENT': paymentHeader,
  },
});

// Resource delivered!
const data = await response.json();
```

### 4. Verify & Settle (Merchant)

> **Note:** Merchant/server SDK is under development. Coming soon!

```typescript
// Future API (planned)
import { verifyPayment, settlePayment } from '@torx402/server';

// Parse X-PAYMENT header
const payment = parsePaymentHeader(req.headers['x-payment']);

// Verify proof off-chain (fast)
const valid = await verifyPayment(payment, poolContract);

if (!valid) {
  return res.status(402).json({ error: 'Invalid payment proof' });
}

// Settle on-chain (withdraw from pool to merchant)
const tx = await settlePayment(payment, poolContract, merchantSigner);

// Deliver resource
res.status(200).json({ data: 'Premium content here!' });
```

## Technical Specifications

| Parameter              | Value        | Notes                          |
| ---------------------- | ------------ | ------------------------------ |
| **Merkle Tree Height** | 32           | 4.3 billion deposit capacity   |
| **Root History Size**  | 10,000       | ~1 hour at 10k deposits/hour   |
| **Hash Function**      | MiMC-Sponge  | zk-SNARK friendly              |
| **Proof System**       | Groth16      | BN128 curve, ~128-bit security |
| **Proof Size**         | 128 bytes    | Constant size                  |
| **Verification Gas**   | ~400,000     | On Base L2: ~$0.0001           |
| **Target Network**     | Base Sepolia | L2 testnet                     |
| **Denomination**       | 0.001 ETH    | Fixed pool size                |

## Security

### Cryptographic Security

- **zk-SNARK Security**: ~128 bits (Groth16 over BN128)
- **Hash Security**: 126 bits (Pedersen, MiMC)
- **Nullifier Entropy**: 248 bits
- **Secret Entropy**: 248 bits

### Attack Prevention

- ✅ **Double-Spend**: Nullifier hash uniqueness enforced
- ✅ **Replay Attack**: Nullifiers are unique per deposit
- ✅ **Front-Running**: Proofs bound to recipient address
- ✅ **Invalid Proofs**: Cryptographically impossible to forge

### Audit Status

⚠️ **Pre-audit**: This is experimental software. Smart contracts are NOT audited. Use only on testnets with funds you can afford to lose.

**DO NOT use in production until:**

- Professional security audit completed
- Multi-party trusted setup ceremony performed
- Extensive testnet testing (6+ months)

## Development

### Run local Hardhat node

```bash
cd contracts
npx hardhat node
```

### Deploy to local node

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

### Watch mode (auto-rebuild)

```bash
# Crypto package
cd crypto && npm run dev

# Contracts (with hardhat-watcher plugin)
cd contracts && npx hardhat watch
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

```bash
npm run lint      # Check linting
npm run format    # Auto-format code
```

### External Resources

- **Tornado Cash**: https://github.com/tornadocash/tornado-core
- **x402 Protocol**: https://x402.org
- **Circom**: https://docs.circom.io
- **snarkjs**: https://github.com/iden3/snarkjs

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- **Tornado Cash** team for pioneering zk-SNARK privacy
- **x402** community for HTTP micropayment standards
- **Circom/snarkjs** developers for excellent ZKP tooling
- **Ethereum** community for L2 scaling solutions

---

<div align="center">
  <p><strong>Built with ❤️ for a more private web3</strong></p>
  <p>⚠️ Experimental software - Use at your own risk</p>
</div>
