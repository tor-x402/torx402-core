/**
 * torx402 Client Library - Deposit Tests
 *
 * Unit tests for deposit generation, note management, and cryptographic operations
 */

import { expect } from 'chai';
import {
  generateDeposit,
  createDepositFromSecrets,
  depositToNote,
  parseDepositNote,
  validateDeposit,
  generateDeposits,
  depositsToNotes,
  formatDenomination,
  parseDenomination,
  getDepositSummary,
} from '../src/deposit';
import {
  randomBN248,
  computeCommitment,
  computeNullifierHash,
  isValid248Bit,
  isValidFieldElement,
  FIELD_SIZE,
  MAX_248_BIT,
} from '../src/crypto';
import { TorxError, ErrorCode } from '../src/types';

describe('torx402 Client Library - Deposits', function () {
  this.timeout(30000); // Increase timeout for crypto operations

  describe('Random Number Generation', function () {
    it('Should generate valid 248-bit random numbers', function () {
      const random = randomBN248();
      expect(random).to.be.a('bigint');
      expect(random > BigInt(0)).to.be.true;
      expect(random <= MAX_248_BIT).to.be.true;
    });

    it('Should generate different random numbers', function () {
      const random1 = randomBN248();
      const random2 = randomBN248();
      expect(random1).to.not.equal(random2);
    });

    it('Should generate numbers within field size', function () {
      for (let i = 0; i < 10; i++) {
        const random = randomBN248();
        expect(random < FIELD_SIZE).to.be.true;
      }
    });
  });

  describe('Field Element Validation', function () {
    it('Should validate correct field elements', function () {
      expect(isValidFieldElement(BigInt(0))).to.be.true;
      expect(isValidFieldElement(BigInt(1))).to.be.true;
      expect(isValidFieldElement(BigInt(12345))).to.be.true;
      expect(isValidFieldElement(FIELD_SIZE - BigInt(1))).to.be.true;
    });

    it('Should reject field elements >= FIELD_SIZE', function () {
      expect(isValidFieldElement(FIELD_SIZE)).to.be.false;
      expect(isValidFieldElement(FIELD_SIZE + BigInt(1))).to.be.false;
    });

    it('Should reject negative numbers', function () {
      expect(isValidFieldElement(BigInt(-1))).to.be.false;
    });

    it('Should validate 248-bit numbers', function () {
      expect(isValid248Bit(BigInt(0))).to.be.true;
      expect(isValid248Bit(BigInt(1))).to.be.true;
      expect(isValid248Bit(MAX_248_BIT)).to.be.true;
    });

    it('Should reject numbers > 248 bits', function () {
      expect(isValid248Bit(MAX_248_BIT + BigInt(1))).to.be.false;
    });
  });

  describe('Commitment and Nullifier Hash', function () {
    it('Should compute commitment from nullifier and secret', async function () {
      const nullifier = randomBN248();
      const secret = randomBN248();

      const commitment = await computeCommitment(nullifier, secret);

      expect(commitment).to.be.a('string');
      expect(commitment.startsWith('0x')).to.be.true;
      expect(commitment.length).to.equal(66); // 0x + 64 hex chars
    });

    it('Should compute nullifier hash from nullifier', async function () {
      const nullifier = randomBN248();

      const nullifierHash = await computeNullifierHash(nullifier);

      expect(nullifierHash).to.be.a('string');
      expect(nullifierHash.startsWith('0x')).to.be.true;
      expect(nullifierHash.length).to.equal(66);
    });

    it('Should produce different commitments for different secrets', async function () {
      const nullifier = randomBN248();
      const secret1 = randomBN248();
      const secret2 = randomBN248();

      const commitment1 = await computeCommitment(nullifier, secret1);
      const commitment2 = await computeCommitment(nullifier, secret2);

      expect(commitment1).to.not.equal(commitment2);
    });

    it('Should produce different commitments for different nullifiers', async function () {
      const nullifier1 = randomBN248();
      const nullifier2 = randomBN248();
      const secret = randomBN248();

      const commitment1 = await computeCommitment(nullifier1, secret);
      const commitment2 = await computeCommitment(nullifier2, secret);

      expect(commitment1).to.not.equal(commitment2);
    });

    it('Should produce same commitment for same inputs', async function () {
      const nullifier = BigInt(12345);
      const secret = BigInt(67890);

      const commitment1 = await computeCommitment(nullifier, secret);
      const commitment2 = await computeCommitment(nullifier, secret);

      expect(commitment1).to.equal(commitment2);
    });
  });

  describe('Deposit Generation', function () {
    it('Should generate a valid deposit', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');

      expect(deposit).to.have.property('nullifier');
      expect(deposit).to.have.property('secret');
      expect(deposit).to.have.property('commitment');
      expect(deposit).to.have.property('nullifierHash');
      expect(deposit.denomination).to.equal('0.001');
      expect(deposit.network).to.equal('baseSepolia');
    });

    it('Should generate deposits with valid field elements', async function () {
      const deposit = await generateDeposit();

      expect(isValid248Bit(deposit.nullifier)).to.be.true;
      expect(isValid248Bit(deposit.secret)).to.be.true;
      expect(deposit.commitment.startsWith('0x')).to.be.true;
      expect(deposit.nullifierHash.startsWith('0x')).to.be.true;
    });

    it('Should generate unique deposits', async function () {
      const deposit1 = await generateDeposit();
      const deposit2 = await generateDeposit();

      expect(deposit1.nullifier).to.not.equal(deposit2.nullifier);
      expect(deposit1.secret).to.not.equal(deposit2.secret);
      expect(deposit1.commitment).to.not.equal(deposit2.commitment);
      expect(deposit1.nullifierHash).to.not.equal(deposit2.nullifierHash);
    });
  });

  describe('Deposit from Secrets', function () {
    it('Should create deposit from existing secrets', async function () {
      const nullifier = randomBN248();
      const secret = randomBN248();

      const deposit = await createDepositFromSecrets(
        nullifier,
        secret,
        '0.001',
        'baseSepolia'
      );

      expect(deposit.nullifier).to.equal(nullifier);
      expect(deposit.secret).to.equal(secret);
      expect(deposit.denomination).to.equal('0.001');
      expect(deposit.network).to.equal('baseSepolia');
    });

    it('Should reject invalid nullifier', async function () {
      const nullifier = MAX_248_BIT + BigInt(1); // Too large
      const secret = randomBN248();

      try {
        await createDepositFromSecrets(nullifier, secret);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(TorxError);
        expect(error.code).to.equal(ErrorCode.INVALID_NULLIFIER);
      }
    });

    it('Should reject invalid secret', async function () {
      const nullifier = randomBN248();
      const secret = MAX_248_BIT + BigInt(1); // Too large

      try {
        await createDepositFromSecrets(nullifier, secret);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(TorxError);
        expect(error.code).to.equal(ErrorCode.INVALID_SECRET);
      }
    });
  });

  describe('Note Serialization', function () {
    it('Should serialize deposit to note string', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');
      const note = await depositToNote(deposit);

      expect(note).to.be.a('string');
      expect(note.startsWith('tornado-eth-')).to.be.true;
      expect(note).to.include('0.001');
      expect(note).to.include('baseSepolia');
    });

    it('Should parse note string back to deposit', async function () {
      const original = await generateDeposit('0.001', 'baseSepolia');
      const note = await depositToNote(original);
      const parsed = await parseDepositNote(note);

      expect(parsed.nullifier).to.equal(original.nullifier);
      expect(parsed.secret).to.equal(original.secret);
      expect(parsed.commitment).to.equal(original.commitment);
      expect(parsed.nullifierHash).to.equal(original.nullifierHash);
      expect(parsed.denomination).to.equal('0.001');
      expect(parsed.network).to.equal('baseSepolia');
    });

    it('Should handle note with leafIndex', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');
      deposit.leafIndex = 42;

      const note = await depositToNote(deposit);
      const parsed = await parseDepositNote(note);

      expect(parsed.leafIndex).to.equal(42);
    });

    it('Should reject invalid note format', async function () {
      try {
        await parseDepositNote('invalid-note-format');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(TorxError);
        expect(error.code).to.equal(ErrorCode.INVALID_NOTE_FORMAT);
      }
    });

    it('Should reject wrong protocol', async function () {
      try {
        await parseDepositNote('wrong-eth-0.001-baseSepolia-ABC123');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(TorxError);
      }
    });
  });

  describe('Deposit Validation', function () {
    it('Should validate correct deposit', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');
      expect(() => validateDeposit(deposit)).to.not.throw();
    });

    it('Should reject deposit with invalid nullifier', function () {
      const invalidDeposit = {
        nullifier: FIELD_SIZE, // Too large
        secret: BigInt(12345),
        commitment: '0x1234567890abcdef',
        nullifierHash: '0xabcdef1234567890',
      };

      expect(() => validateDeposit(invalidDeposit as any)).to.throw();
    });

    it('Should reject deposit with invalid commitment format', async function () {
      const deposit = await generateDeposit();
      deposit.commitment = 'invalid'; // No 0x prefix

      expect(() => validateDeposit(deposit)).to.throw();
    });
  });

  describe('Batch Operations', function () {
    it('Should generate multiple deposits', async function () {
      const count = 5;
      const deposits = await generateDeposits(count, '0.001', 'baseSepolia');

      expect(deposits).to.have.length(count);

      // All should be unique
      const commitments = deposits.map((d) => d.commitment);
      const uniqueCommitments = new Set(commitments);
      expect(uniqueCommitments.size).to.equal(count);
    });

    it('Should reject invalid count', async function () {
      try {
        await generateDeposits(0);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('between 1 and 100');
      }

      try {
        await generateDeposits(101);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('between 1 and 100');
      }
    });

    it('Should convert deposits to notes', async function () {
      const deposits = await generateDeposits(3, '0.001', 'baseSepolia');
      const notes = await depositsToNotes(deposits);

      expect(notes).to.have.length(3);
      notes.forEach((note) => {
        expect(note.startsWith('tornado-eth-0.001-baseSepolia-')).to.be.true;
      });
    });
  });

  describe('Denomination Helpers', function () {
    it('Should parse denomination from ETH to wei', function () {
      const wei = parseDenomination('0.001');
      expect(wei).to.equal(BigInt('1000000000000000'));
    });

    it('Should format denomination from wei to ETH', function () {
      const eth = formatDenomination(BigInt('1000000000000000'));
      expect(eth).to.equal('0.001');
    });

    it('Should handle various denominations', function () {
      expect(parseDenomination('1')).to.equal(BigInt('1000000000000000000'));
      expect(parseDenomination('0.1')).to.equal(BigInt('100000000000000000'));
      expect(parseDenomination('0.01')).to.equal(BigInt('10000000000000000'));
    });
  });

  describe('Deposit Summary', function () {
    it('Should create deposit summary', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');
      deposit.leafIndex = 42;
      deposit.txHash = '0x1234567890abcdef';

      const summary = getDepositSummary(deposit);

      expect(summary.commitment).to.equal(deposit.commitment);
      expect(summary.nullifierHash).to.equal(deposit.nullifierHash);
      expect(summary.denomination).to.equal('0.001');
      expect(summary.network).to.equal('baseSepolia');
      expect(summary.leafIndex).to.equal(42);
      expect(summary.txHash).to.equal('0x1234567890abcdef');
      expect(summary.spent).to.be.false;
    });
  });

  describe('Note Format', function () {
    it('Should create note with correct format', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');
      const note = await depositToNote(deposit);

      const parts = note.split('-');
      expect(parts[0]).to.equal('tornado');
      expect(parts[1]).to.equal('eth');
      expect(parts[2]).to.equal('0.001');
      expect(parts[3]).to.equal('baseSepolia');
      expect(parts[4]).to.exist; // encoded secrets
    });

    it('Should preserve all data through serialization', async function () {
      const original = await generateDeposit('0.001', 'baseSepolia');
      original.leafIndex = 123;

      const note = await depositToNote(original);
      const parsed = await parseDepositNote(note);

      // Check all fields match
      expect(parsed.nullifier.toString()).to.equal(original.nullifier.toString());
      expect(parsed.secret.toString()).to.equal(original.secret.toString());
      expect(parsed.commitment).to.equal(original.commitment);
      expect(parsed.nullifierHash).to.equal(original.nullifierHash);
      expect(parsed.denomination).to.equal(original.denomination);
      expect(parsed.network).to.equal(original.network);
      expect(parsed.leafIndex).to.equal(original.leafIndex);
    });

    it('Should handle note without leafIndex', async function () {
      const deposit = await generateDeposit('0.001', 'baseSepolia');
      // Don't set leafIndex (deposit not yet submitted)

      const note = await depositToNote(deposit);
      const parsed = await parseDepositNote(note);

      expect(parsed.nullifier).to.equal(deposit.nullifier);
      expect(parsed.secret).to.equal(deposit.secret);
      // leafIndex should be undefined or 0
      expect(parsed.leafIndex === undefined || parsed.leafIndex === 0).to.be.true;
    });
  });

  describe('Edge Cases', function () {
    it('Should handle minimum valid values', async function () {
      const deposit = await createDepositFromSecrets(BigInt(1), BigInt(1), '0.001', 'test');

      expect(deposit.nullifier).to.equal(BigInt(1));
      expect(deposit.secret).to.equal(BigInt(1));
      expect(deposit.commitment.startsWith('0x')).to.be.true;
    });

    it('Should handle maximum 248-bit values', async function () {
      const deposit = await createDepositFromSecrets(
        MAX_248_BIT,
        MAX_248_BIT,
        '0.001',
        'test'
      );

      expect(deposit.nullifier).to.equal(MAX_248_BIT);
      expect(deposit.secret).to.equal(MAX_248_BIT);
    });

    it('Should handle string number inputs', async function () {
      const deposit = await createDepositFromSecrets('12345', '67890', '0.001', 'test');

      expect(deposit.nullifier).to.equal(BigInt(12345));
      expect(deposit.secret).to.equal(BigInt(67890));
    });
  });

  describe('Error Handling', function () {
    it('Should throw TorxError with correct error code', async function () {
      try {
        await createDepositFromSecrets(FIELD_SIZE, BigInt(1)); // Invalid nullifier
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(TorxError);
        expect(error.code).to.equal(ErrorCode.INVALID_NULLIFIER);
        expect(error.message).to.include('248-bit');
      }
    });

    it('Should include error details', async function () {
      try {
        await parseDepositNote('invalid-format');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error).to.be.instanceOf(TorxError);
        expect(error.details).to.exist;
      }
    });
  });

  describe('Deterministic Behavior', function () {
    it('Should produce same output for same inputs', async function () {
      const nullifier = BigInt(11111);
      const secret = BigInt(22222);

      const deposit1 = await createDepositFromSecrets(nullifier, secret);
      const deposit2 = await createDepositFromSecrets(nullifier, secret);

      expect(deposit1.commitment).to.equal(deposit2.commitment);
      expect(deposit1.nullifierHash).to.equal(deposit2.nullifierHash);
    });

    it('Should serialize/deserialize consistently', async function () {
      const original = await generateDeposit('0.001', 'baseSepolia');

      // Serialize and parse multiple times
      const note1 = await depositToNote(original);
      const parsed1 = await parseDepositNote(note1);
      const note2 = await depositToNote(parsed1);
      const parsed2 = await parseDepositNote(note2);

      expect(note1).to.equal(note2);
      expect(parsed1.commitment).to.equal(parsed2.commitment);
    });
  });

  describe('Performance', function () {
    it('Should generate deposit quickly', async function () {
      const startTime = Date.now();
      await generateDeposit('0.001', 'baseSepolia');
      const elapsedTime = Date.now() - startTime;

      // Should take less than 1 second
      expect(elapsedTime).to.be.lessThan(1000);
    });

    it('Should generate batch deposits efficiently', async function () {
      const startTime = Date.now();
      await generateDeposits(10, '0.001', 'baseSepolia');
      const elapsedTime = Date.now() - startTime;

      // Should take less than 5 seconds for 10 deposits
      expect(elapsedTime).to.be.lessThan(5000);
    });
  });
});
