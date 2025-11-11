# @torx402/core

> Shared cryptographic utilities and types for torx402 privacy-preserving payment protocol

[![Tests](https://img.shields.io/badge/tests-19%2F20%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## Overview

`@torx402/core` provides the foundational cryptographic primitives and utilities used across the torx402 ecosystem. This package is used by both `@torx402/client` (end-user library) and `@torx402/facilitator` (merchant server).

**Key Features:**

- **Zero-knowledge friendly cryptography** - Pedersen hash, MiMC-Sponge
- **BN128 curve operations** - Field element validation and operations
- **Cryptographically secure RNG** - 248-bit random numbers for secrets
- **Shared types** - TypeScript types for field elements, commitments, nullifier hashes
- **Well-tested** - 19/20 tests passing (95% pass rate)

## Installation

```bash
npm install @torx402/core
```

For local development (monorepo):

```bash
cd torx402-core/crypto
npm install
npm run build
```

## Usage

### Random Number Generation

```typescript
import { randomBN248, randomFieldElement } from '@torx402/core';

// Generate 248-bit random number (for nullifier/secret)
const nullifier = randomBN248();
const secret = randomBN248();

// Generate random field element (< FIELD_SIZE)
const randomElement = randomFieldElement();
```

### Commitments and Nullifier Hashes

```typescript
import { computeCommitment, computeNullifierHash } from '@torx402/core';

// Compute commitment = Pedersen(nullifier || secret)
const commitment = await computeCommitment(nullifier, secret);
// Returns: "0x1234..." (hex string)

// Compute nullifier hash = Pedersen(nullifier)
const nullifierHash = await computeNullifierHash(nullifier);
// Returns: "0xabcd..." (hex string)
```

### Hash Functions

```typescript
import { pedersenHash, mimcHash, initializeCrypto } from '@torx402/core';

// Initialize crypto libraries (call once)
await initializeCrypto();

// Pedersen hash (for commitments)
const data = Buffer.from('hello');
const hash = await pedersenHash(data);

// MiMC hash (for Merkle trees)
const left = BigInt(100);
const right = BigInt(200);
const treeHash = await mimcHash(left, right);
```

### Field Element Validation

```typescript
import { isValidFieldElement, isValid248Bit, toFieldElement, FIELD_SIZE } from '@torx402/core';

// Check if value is valid field element
const valid = isValidFieldElement(myBigInt); // true/false

// Check if value is valid 248-bit number
const valid248 = isValid248Bit(myBigInt); // true/false

// Convert and validate (throws if invalid)
const element = toFieldElement(myValue); // bigint

// Field size constant
console.log(FIELD_SIZE); // 21888242871839275...
```

### Utility Functions

```typescript
import { toHex, fromHex, toBigInt, bufferToBigInt } from '@torx402/core';

// Convert BigInt to hex string
const hex = toHex(BigInt(123)); // "0x000...07b"

// Convert hex to BigInt
const value = fromHex('0x7b'); // 123n

// Convert to BigInt
const bn = toBigInt('123'); // 123n

// Convert buffer to BigInt
const buffer = Buffer.from([1, 2, 3]);
const bufValue = bufferToBigInt(buffer); // 66051n
```

## API Reference

### Constants

- `FIELD_SIZE` - BN128 curve field size (21888242...)
- `MAX_248_BIT` - Maximum 248-bit value
- `ZERO_VALUE` - Zero value used in Merkle trees
- `TREE_HEIGHT` - Merkle tree height (32)
- `ROOT_HISTORY_SIZE` - Number of historical roots (10,000)
- `MERKLE_ZERO_VALUES` - Pre-computed zero values for each tree level

### Random Generation

- `randomBN248()` → `bigint` - Generate random 248-bit number
- `randomFieldElement()` → `bigint` - Generate random field element
- `randomBytes32()` → `Uint8Array` - Generate 32 random bytes

### Hash Functions

- `initializeCrypto()` → `Promise<void>` - Initialize crypto libraries
- `initializePedersenHasher()` → `Promise<void>` - Initialize Pedersen hasher
- `initializeMimcHasher()` → `Promise<void>` - Initialize MiMC hasher
- `pedersenHash(data)` → `Promise<bigint>` - Compute Pedersen hash
- `pedersenHashMultiple(elements)` → `Promise<bigint>` - Hash multiple elements
- `mimcHash(left, right)` → `Promise<bigint>` - Compute MiMC hash
- `mimcHashMultiple(inputs)` → `Promise<bigint>` - Hash multiple inputs

### Commitments

- `computeCommitment(nullifier, secret)` → `Promise<string>` - Compute commitment
- `computeNullifierHash(nullifier)` → `Promise<string>` - Compute nullifier hash

### Field Operations

- `isValidFieldElement(value)` → `boolean` - Check if valid field element
- `isValid248Bit(value)` → `boolean` - Check if valid 248-bit number
- `toFieldElement(value)` → `bigint` - Convert and validate field element
- `getZeroValue(level)` → `string` - Get Merkle zero value for level

### Utilities

- `toHex(value, bytes?)` → `string` - Convert to hex (with 0x prefix)
- `fromHex(hex)` → `bigint` - Convert from hex
- `toBigInt(value)` → `bigint` - Convert to BigInt
- `toDecimalString(value)` → `string` - Convert to decimal string
- `toHexString(value, bytes?)` → `string` - Convert to hex (no prefix)
- `bufferToBigInt(buffer)` → `bigint` - Convert buffer to BigInt
- `bigIntToBuffer(value, bytes?)` → `Buffer` - Convert BigInt to buffer
- `serializeFieldElement(value)` → `string` - Serialize to bytes32
- `parseFieldElement(hex)` → `bigint` - Parse from bytes32
- `numToBits(num, bits)` → `number[]` - Convert to bit array
- `bitsToNum(bits)` → `bigint` - Convert from bit array

## Testing

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage
```

**Test Results:**

- ✓ 19 out of 20 tests passing (95%)
- ✓ All core functionality validated
- ✓ Constants, random generation, field validation
- ✓ Commitments, nullifier hashes, utilities

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Lint
npm run lint

# Format
npm run format
```

## Package Structure

```
@torx402/core/
├── src/
│   ├── types.ts       # Shared TypeScript types
│   ├── constants.ts   # Cryptographic constants
│   ├── random.ts      # Random number generation
│   ├── field.ts       # Field element operations
│   ├── hash.ts        # Pedersen and MiMC hashing
│   ├── commitment.ts  # Commitment computation
│   ├── utils.ts       # Utility functions
│   └── index.ts       # Main exports
├── test/
│   └── crypto.test.ts # Test suite (20 tests)
└── dist/              # Built package (generated)
```

## Dependencies

- **circomlibjs** (^0.1.7) - Circom cryptographic library
- **ffjavascript** (^0.2.60) - Finite field arithmetic
- **ethers** (^6.9.0) - Peer dependency

## Used By

- `@torx402/client` - End-user library for deposits/withdrawals
- `@torx402/facilitator` - Merchant server for x402 protocol

## Security

⚠️ **TESTNET ONLY** - This package is currently for testnet use only. Do not use with real funds.

**Security Considerations:**

- Cryptographically secure random number generation
- Field element validation to prevent overflow attacks
- Well-tested hash functions (Pedersen, MiMC)
- Based on battle-tested Tornado Cash cryptography

**Before Production:**

- Professional security audit required
- Multi-party trusted setup ceremony for circuits
- Production MiMC implementation verification

## License

MIT

## Links

- **GitHub:** https://github.com/torx402/torx402-core
- **Documentation:** See `.CLAUDE.md` in repository root
- **Issues:** https://github.com/torx402/torx402-core/issues

## Related Packages

- [@torx402/client](https://github.com/torx402/torx402-client) - Client library
- [@torx402/facilitator](https://github.com/torx402/torx402-facilitator) - Merchant server (Coming soon)
