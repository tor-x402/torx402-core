# @torx402/client

TypeScript client library for torx402 privacy-preserving micropayments.

**Make anonymous deposits and withdrawals from privacy pools on Ethereum using zero-knowledge proofs.**

## Features

- ✅ **Deposit Generation** - Create anonymous deposits with cryptographic commitments
- ✅ **Proof Generation** - Generate zk-SNARK proofs for anonymous withdrawals
- ✅ **Note Management** - Serialize/deserialize deposit notes for secure storage
- ✅ **Merkle Proofs** - Automatic Merkle proof generation from blockchain state
- ✅ **Direct Withdrawals** - Withdraw funds directly (you pay gas)
- ✅ **Relayer Support** - Withdraw via relayers for IP privacy (coming soon)
- ✅ **Type Safe** - Full TypeScript support with comprehensive types
- ✅ **Browser & Node.js** - Works in both environments

## Installation

```bash
# From the client directory
npm install

# Or from monorepo root
cd client && npm install
```

## Quick Start

### 1. Generate and Make a Deposit

```typescript
import { generateDeposit, makeDeposit, depositToNote } from '@torx402/client';
import { ethers } from 'ethers';

// Setup provider and signer
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const signer = new ethers.Wallet(privateKey, provider);

// Generate deposit secrets
const deposit = await generateDeposit('0.001', 'baseSepolia');

// Submit deposit to pool
const { receipt, deposit: confirmedDeposit } = await makeDeposit(
  poolAddress,
  deposit,
  signer
);

// Create note (SAVE THIS SECURELY!)
const note = await depositToNote(confirmedDeposit);
console.log('Your deposit note:', note);
// => "tornado-eth-0.001-baseSepolia-YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="
```

### 2. Withdraw Funds

```typescript
import { parseDepositNote, withdrawDirect } from '@torx402/client';
import { ethers } from 'ethers';

// Setup provider and signer
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const signer = new ethers.Wallet(privateKey, provider);

// Parse your deposit note
const deposit = await parseDepositNote(noteString);

// Withdraw to recipient address (generates proof automatically)
const receipt = await withdrawDirect(
  poolAddress,
  deposit,
  recipientAddress,
  signer,
  provider
);

console.log('Withdrawn! Transaction:', receipt.hash);
```

### 3. Quick Helpers

```typescript
import { quickDeposit, quickWithdraw } from '@torx402/client';

// One-liner deposit
const { note, receipt } = await quickDeposit(
  poolAddress,
  signer,
  '0.001',
  'baseSepolia'
);

// One-liner withdrawal
const receipt = await quickWithdraw(
  poolAddress,
  noteString,
  recipientAddress,
  signer,
  provider
);
```

## Usage Examples

### Example 1: Complete Deposit Flow

```typescript
import {
  generateDeposit,
  makeDeposit,
  depositToNote,
  saveNoteToFile,
  getPoolInfo,
} from '@torx402/client';
import { ethers } from 'ethers';

async function deposit() {
  // 1. Check pool status
  const poolInfo = await getPoolInfo(poolAddress, provider);
  console.log('Pool has', poolInfo.nextIndex, 'deposits');
  console.log('Denomination:', ethers.formatEther(poolInfo.denomination), 'ETH');

  // 2. Generate deposit
  const deposit = await generateDeposit('0.001', 'baseSepolia');
  console.log('Commitment:', deposit.commitment);

  // 3. Submit transaction
  const { receipt, deposit: confirmed } = await makeDeposit(
    poolAddress,
    deposit,
    signer
  );

  console.log('Deposited at index:', confirmed.leafIndex);
  console.log('Transaction:', receipt.hash);

  // 4. Save note securely
  const note = await depositToNote(confirmed);
  await saveNoteToFile(note, './my-deposit.txt');

  console.log('✓ Note saved to my-deposit.txt');
  console.log('⚠️  Keep this file safe! You need it to withdraw.');

  return note;
}
```

### Example 2: Complete Withdrawal Flow

```typescript
import {
  parseDepositNote,
  isNoteSpent,
  withdrawDirect,
  getWithdrawalEstimate,
  loadNoteFromFile,
} from '@torx402/client';
import { ethers } from 'ethers';

async function withdraw() {
  // 1. Load deposit note
  const noteString = await loadNoteFromFile('./my-deposit.txt');
  const deposit = await parseDepositNote(noteString);

  // 2. Check if already spent
  const spent = await isNoteSpent(poolAddress, deposit, provider);
  if (spent) {
    throw new Error('Note already spent!');
  }

  // 3. Get withdrawal estimate
  const estimate = await getWithdrawalEstimate(poolAddress, provider);
  console.log('You will receive:', estimate.netAmountETH, 'ETH');
  console.log('Estimated gas cost:', estimate.estimatedGasCostETH, 'ETH');

  // 4. Generate proof and withdraw
  // This takes ~10 seconds for proof generation
  const receipt = await withdrawDirect(
    poolAddress,
    deposit,
    recipientAddress,
    signer,
    provider
  );

  console.log('✓ Withdrawn!');
  console.log('Transaction:', receipt.hash);

  return receipt;
}
```

### Example 3: Withdrawal via Relayer (Privacy)

```typescript
import { withdrawViaRelayer, calculateRelayerFee } from '@torx402/client';

async function withdrawWithRelayer() {
  const deposit = await parseDepositNote(noteString);

  // Calculate appropriate relayer fee
  const fee = await calculateRelayerFee(provider);
  console.log('Relayer fee:', ethers.formatEther(fee), 'ETH');

  // Generate proof for relayer
  const proof = await withdrawViaRelayer(
    poolAddress,
    deposit,
    recipientAddress,
    relayerAddress,
    fee,
    provider
  );

  // Send proof to relayer endpoint
  const response = await fetch('https://relayer.example.com/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proof),
  });

  console.log('Relayer response:', await response.json());
}
```

## API Reference

### Deposit Functions

#### `generateDeposit(denomination?, network?)`

Generate a new deposit with random secrets.

**Parameters:**
- `denomination` (string, optional): Denomination in ETH (e.g., '0.001')
- `network` (string, optional): Network name (e.g., 'baseSepolia')

**Returns:** `Promise<Deposit>`

**Example:**
```typescript
const deposit = await generateDeposit('0.001', 'baseSepolia');
```

#### `makeDeposit(poolAddress, deposit, signer, options?)`

Submit a deposit transaction to the privacy pool.

**Parameters:**
- `poolAddress` (string): Pool contract address
- `deposit` (Deposit): Deposit object with commitment
- `signer` (Signer): Ethereum signer
- `options` (DepositOptions, optional): Gas options

**Returns:** `Promise<{ receipt, deposit }>`

**Example:**
```typescript
const { receipt, deposit: confirmed } = await makeDeposit(
  '0x1234...',
  deposit,
  signer,
  { gasLimit: 300000 }
);
```

#### `depositToNote(deposit)`

Serialize deposit to note string.

**Returns:** `Promise<string>`

**Example:**
```typescript
const note = await depositToNote(deposit);
// => "tornado-eth-0.001-baseSepolia-ABC123..."
```

#### `parseDepositNote(note)`

Parse deposit note string back to Deposit object.

**Returns:** `Promise<Deposit>`

**Example:**
```typescript
const deposit = await parseDepositNote(noteString);
```

### Withdrawal Functions

#### `withdrawDirect(poolAddress, deposit, recipient, signer, provider, options?)`

Withdraw funds directly (you pay gas, no relayer).

**Parameters:**
- `poolAddress` (string): Pool contract address
- `deposit` (Deposit): Deposit with secrets
- `recipient` (string): Address to receive funds
- `signer` (Signer): Ethereum signer
- `provider` (Provider): Ethereum provider
- `options` (WithdrawalOptions, optional): Transaction options

**Returns:** `Promise<TransactionReceipt>`

**Example:**
```typescript
const receipt = await withdrawDirect(
  poolAddress,
  deposit,
  recipientAddress,
  signer,
  provider
);
```

#### `withdrawViaRelayer(poolAddress, deposit, recipient, relayer, fee, provider)`

Generate proof for relayer withdrawal (relayer pays gas).

**Returns:** `Promise<WithdrawalProof>`

### Proof Functions

#### `generateWithdrawalProof(poolAddress, deposit, recipient, provider, options?)`

Generate complete withdrawal proof (Merkle proof + zk-SNARK).

**Returns:** `Promise<WithdrawalProof>`

This function:
1. Generates Merkle proof from blockchain state
2. Verifies Merkle proof locally
3. Generates zk-SNARK proof (~10 seconds)

#### `verifyProofLocally(proof, publicSignals)`

Verify zk-SNARK proof off-chain before submitting.

**Returns:** `Promise<boolean>`

### Utility Functions

#### `getPoolInfo(poolAddress, provider)`

Get privacy pool information.

**Returns:**
```typescript
{
  denomination: bigint,
  treeHeight: number,
  nextIndex: number,
  currentRoot: string,
  balance: bigint
}
```

#### `isNoteSpent(poolAddress, deposit, provider)`

Check if a note has been spent.

**Returns:** `Promise<boolean>`

#### `getWithdrawalEstimate(poolAddress, provider, relayerFee?)`

Get detailed withdrawal estimate with fees.

**Returns:**
```typescript
{
  denomination: bigint,
  denominationETH: string,
  netAmount: bigint,
  netAmountETH: string,
  estimatedGas: bigint,
  estimatedGasCost: bigint
}
```

## Cryptographic Functions

### Random Generation

```typescript
import { randomBN248, randomFieldElement } from '@torx402/client';

const nullifier = randomBN248();      // Random 248-bit number
const fieldEl = randomFieldElement(); // Random field element
```

### Hashing

```typescript
import { computeCommitment, computeNullifierHash } from '@torx402/client';

const commitment = await computeCommitment(nullifier, secret);
const nullifierHash = await computeNullifierHash(nullifier);
```

### Validation

```typescript
import { isValidFieldElement, isValid248Bit } from '@torx402/client';

const valid = isValidFieldElement(value);     // Check if < FIELD_SIZE
const valid248 = isValid248Bit(value);        // Check if <= 2^248 - 1
```

## Note Management

### Save to File (Node.js)

```typescript
import { saveNoteToFile, loadNoteFromFile } from '@torx402/client';

// Save note
await saveNoteToFile(note, './my-deposit.txt');

// Load note
const note = await loadNoteFromFile('./my-deposit.txt');
```

### Save to LocalStorage (Browser)

```typescript
import { saveNoteToLocalStorage, loadNoteFromLocalStorage } from '@torx402/client';

// Save
saveNoteToLocalStorage(note, 'my_deposit_key');

// Load
const note = loadNoteFromLocalStorage('my_deposit_key');
```

## Error Handling

All errors are `TorxError` instances with specific error codes:

```typescript
import { TorxError, ErrorCode } from '@torx402/client';

try {
  const deposit = await makeDeposit(poolAddress, deposit, signer);
} catch (error) {
  if (error instanceof TorxError) {
    console.error('Error code:', error.code);
    console.error('Message:', error.message);
    console.error('Details:', error.details);

    switch (error.code) {
      case ErrorCode.NOTE_ALREADY_SPENT:
        console.log('This note was already withdrawn');
        break;
      case ErrorCode.INVALID_ROOT:
        console.log('Merkle root expired from history');
        break;
      case ErrorCode.PROOF_GENERATION_FAILED:
        console.log('Failed to generate proof');
        break;
    }
  }
}
```

### Error Codes

- `INVALID_FIELD_ELEMENT` - Value outside valid field range
- `INVALID_NULLIFIER` - Invalid nullifier value
- `INVALID_SECRET` - Invalid secret value
- `PROOF_GENERATION_FAILED` - zk-SNARK proof generation failed
- `PROOF_VERIFICATION_FAILED` - Proof verification failed
- `DEPOSIT_FAILED` - Deposit transaction failed
- `WITHDRAWAL_FAILED` - Withdrawal transaction failed
- `NOTE_ALREADY_SPENT` - Note has been used for withdrawal
- `INVALID_ROOT` - Merkle root not in pool history
- `INVALID_NOTE_FORMAT` - Note string format invalid
- `CIRCUIT_NOT_FOUND` - Circuit artifacts not found

## Performance

### Deposit Flow
- **Secret generation:** < 100ms
- **Commitment computation:** < 500ms
- **Transaction submission:** ~2 seconds (network dependent)
- **Total:** ~3 seconds

### Withdrawal Flow
- **Merkle proof generation:** ~1 second
- **zk-SNARK proof generation:** ~10 seconds (CPU) / ~2 seconds (GPU)
- **Transaction submission:** ~2 seconds
- **Total:** ~13 seconds

## Privacy Considerations

### Anonymity Set Size

Your privacy depends on how many deposits are in the pool:

| Deposits | Privacy Level | Recommendation |
|----------|---------------|----------------|
| < 10 | ❌ Poor | Wait for more deposits |
| 10-50 | ⚠️ Low | Wait if possible |
| 50-100 | ✓ Moderate | Acceptable for testing |
| 100-500 | ✓ Good | Good privacy |
| 500+ | ✅ Excellent | Withdraw anytime |

Check anonymity set:
```typescript
const poolInfo = await getPoolInfo(poolAddress, provider);
console.log('Anonymity set:', poolInfo.nextIndex, 'deposits');
```

### Best Practices

1. **Wait for deposits** - The more deposits, the better your privacy
2. **Different address** - Withdraw to a different address than you deposited from
3. **Timing** - Don't withdraw immediately after depositing
4. **Relayers** - Use relayers to hide your IP address (coming in Phase 4)
5. **Note security** - Store deposit notes securely, encrypted if possible

## Security

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Testnet Only** - This release uses unsafe trusted setup
2. **Save Your Notes** - If you lose your note, your funds are lost forever
3. **One Withdrawal** - Each note can only be used once
4. **Verify Pool** - Always verify the pool address before depositing
5. **Never Share Secrets** - Never share your nullifier or secret

### Protecting Your Notes

```typescript
// ❌ BAD: Storing note in plain text
const note = await depositToNote(deposit);
console.log(note); // Don't log to console in production!
localStorage.setItem('note', note); // Not encrypted!

// ✅ GOOD: Encrypted storage
import { encrypt } from 'some-encryption-library';
const encrypted = encrypt(note, password);
await saveNoteToFile(encrypted, './encrypted-note.enc');
```

## Running Examples

### Deposit Example

```bash
cd client
ts-node examples/deposit.ts <pool_address> 0.001 baseSepolia
```

This will:
1. Generate random secrets
2. Compute commitment
3. Submit deposit transaction
4. Save note to `notes/` directory

### Withdrawal Example

```bash
cd client
ts-node examples/withdraw.ts <note_string> <recipient_address>
```

Or load from file:
```bash
ts-node examples/withdraw.ts notes/deposit_baseSepolia_123456.txt 0x742d35Cc...
```

This will:
1. Parse deposit note
2. Check if already spent
3. Generate Merkle proof
4. Generate zk-SNARK proof (~10 seconds)
5. Submit withdrawal transaction

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Development

```bash
# Build TypeScript
npm run build

# Watch mode (auto-rebuild)
npm run dev

# Lint code
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

## Advanced Usage

### Custom Circuit Path

```typescript
import { generateWithdrawalProof } from '@torx402/client';

const proof = await generateWithdrawalProof(
  poolAddress,
  deposit,
  recipient,
  provider,
  {
    circuitPath: '/custom/path/to/circuits'
  }
);
```

### Gas Optimization

```typescript
import { estimateWithdrawalGas, getWithdrawalEstimate } from '@torx402/client';

// Estimate gas before withdrawal
const gasEstimate = await estimateWithdrawalGas(poolAddress, proof, provider);
console.log('Estimated gas:', gasEstimate);

// Get detailed estimate
const estimate = await getWithdrawalEstimate(poolAddress, provider);
console.log('Net amount after gas:', estimate.netAmountETH, 'ETH');
```

### Batch Deposits

```typescript
import { generateDeposits, depositsToNotes } from '@torx402/client';

// Generate 10 deposits
const deposits = await generateDeposits(10, '0.001', 'baseSepolia');

// Convert to notes
const notes = await depositsToNotes(deposits);

// Submit all deposits
for (const deposit of deposits) {
  await makeDeposit(poolAddress, deposit, signer);
}
```

## Type Definitions

Full TypeScript types are included:

```typescript
import type {
  Deposit,
  DepositNote,
  WithdrawalProof,
  MerkleProof,
  Groth16Proof,
  PublicSignals,
  PoolInfo,
  ClientConfig,
} from '@torx402/client';
```

See `src/types.ts` for complete type definitions.

## Circuit Artifacts

The client library requires circuit artifacts from the `circuits/` directory:

- `circuits/build/withdraw_js/withdraw.wasm` - Circuit WASM
- `circuits/build/withdraw_final.zkey` - Proving key (~23 MB)
- `circuits/build/withdraw_verification_key.json` - Verification key

**Make sure you've run the circuit setup:**
```bash
cd ../circuits
npm run setup
```

## Troubleshooting

### "Circuit artifacts not found"

**Solution:**
```bash
cd ../circuits
npm run setup
```

### "Proof generation failed"

**Possible causes:**
- Circuit artifacts missing
- Invalid witness data
- Merkle proof incorrect

**Solution:**
```bash
# Rebuild circuits
cd ../circuits
npm run clean
npm run setup
```

### "Note already spent"

This note was already used for withdrawal. Each note can only be withdrawn once.

### "Merkle root not found in history"

The root has expired from the pool's history (10,000 roots). This happens if:
- Too much time passed (depends on pool volume)
- More than 10,000 deposits happened since yours

**Solution:** Deposit to more active pools or withdraw sooner.

### "Insufficient funds"

You need ETH to pay for gas fees. Fund your wallet and try again.

## Contributing

Contributions welcome! Please see the main project [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Resources

- **Main Documentation**: [../README.md](../README.md)
- **Architecture**: [../../architecture.md](../../architecture.md)
- **Technical Spec**: [../../technical-specification.md](../../technical-specification.md)
- **Tornado Cash Docs**: https://docs.tornado.cash
- **snarkjs**: https://github.com/iden3/snarkjs
- **Circom**: https://docs.circom.io

---

**Built with ❤️ for private micropayments**