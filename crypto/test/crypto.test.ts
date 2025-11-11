/**
 * @torx402/core - Crypto Tests
 *
 * Tests for extracted cryptographic functions
 */

import { expect } from 'chai';
import {
  // Constants
  FIELD_SIZE,
  MAX_248_BIT,
  // Random generation
  randomBN248,
  randomFieldElement,
  // Field operations
  isValidFieldElement,
  isValid248Bit,
  toFieldElement,
  // Hash functions
  initializeCrypto,
  computeCommitment,
  computeNullifierHash,
  mimcHash,
  // Utilities
  toHex,
  fromHex,
  toBigInt,
} from '../src';

describe('@torx402/core - Crypto Tests', () => {
  // Initialize crypto libraries once before all tests
  before(async function () {
    this.timeout(30000);
    await initializeCrypto();
  });

  describe('Constants', () => {
    it('should have correct FIELD_SIZE', () => {
      expect(FIELD_SIZE).to.be.a('bigint');
      expect(FIELD_SIZE.toString()).to.equal(
        '21888242871839275222246405745257275088548364400416034343698204186575808495617'
      );
    });

    it('should have correct MAX_248_BIT', () => {
      expect(MAX_248_BIT).to.be.a('bigint');
      expect(MAX_248_BIT < FIELD_SIZE).to.be.true;
    });
  });

  describe('Random Generation', () => {
    it('should generate valid 248-bit random numbers', () => {
      const random = randomBN248();
      expect(random).to.be.a('bigint');
      expect(random > BigInt(0)).to.be.true;
      expect(random <= MAX_248_BIT).to.be.true;
    });

    it('should generate different random numbers', () => {
      const random1 = randomBN248();
      const random2 = randomBN248();
      expect(random1).to.not.equal(random2);
    });

    it('should generate valid field elements', () => {
      const random = randomFieldElement();
      expect(random).to.be.a('bigint');
      expect(random > BigInt(0)).to.be.true;
      expect(random < FIELD_SIZE).to.be.true;
      expect(isValidFieldElement(random)).to.be.true;
    });
  });

  describe('Field Operations', () => {
    it('should validate field elements correctly', () => {
      expect(isValidFieldElement(BigInt(0))).to.be.true;
      expect(isValidFieldElement(BigInt(100))).to.be.true;
      expect(isValidFieldElement(FIELD_SIZE - BigInt(1))).to.be.true;
      expect(isValidFieldElement(FIELD_SIZE)).to.be.false;
      expect(isValidFieldElement(FIELD_SIZE + BigInt(1))).to.be.false;
    });

    it('should validate 248-bit numbers correctly', () => {
      expect(isValid248Bit(BigInt(0))).to.be.true;
      expect(isValid248Bit(BigInt(100))).to.be.true;
      expect(isValid248Bit(MAX_248_BIT)).to.be.true;
      expect(isValid248Bit(MAX_248_BIT + BigInt(1))).to.be.false;
    });

    it('should convert to field element or throw', () => {
      expect(toFieldElement(BigInt(0))).to.equal(BigInt(0));
      expect(toFieldElement(100)).to.equal(BigInt(100));
      expect(() => toFieldElement(FIELD_SIZE)).to.throw();
      expect(() => toFieldElement(-1)).to.throw();
    });
  });

  describe('Hash Functions', () => {
    const nullifier = BigInt(123);
    const secret = BigInt(456);

    it('should compute commitments', async () => {
      const commitment = await computeCommitment(nullifier, secret);
      expect(commitment).to.be.a('string');
      expect(commitment).to.match(/^0x[0-9a-f]{64}$/);
    });

    it('should compute deterministic commitments', async () => {
      const commitment1 = await computeCommitment(nullifier, secret);
      const commitment2 = await computeCommitment(nullifier, secret);
      expect(commitment1).to.equal(commitment2);
    });

    it('should compute different commitments for different inputs', async () => {
      const commitment1 = await computeCommitment(nullifier, secret);
      const commitment2 = await computeCommitment(nullifier + BigInt(1), secret);
      expect(commitment1).to.not.equal(commitment2);
    });

    it('should compute nullifier hashes', async () => {
      const nullifierHash = await computeNullifierHash(nullifier);
      expect(nullifierHash).to.be.a('string');
      expect(nullifierHash).to.match(/^0x[0-9a-f]{64}$/);
    });

    it('should compute deterministic nullifier hashes', async () => {
      const hash1 = await computeNullifierHash(nullifier);
      const hash2 = await computeNullifierHash(nullifier);
      expect(hash1).to.equal(hash2);
    });

    it('should compute MiMC hashes', async () => {
      const left = BigInt(100);
      const right = BigInt(200);
      const hash = await mimcHash(left, right);
      expect(hash).to.be.a('bigint');
      expect(isValidFieldElement(hash)).to.be.true;
    });

    it('should reject invalid inputs for commitments', async () => {
      const invalidNullifier = MAX_248_BIT + BigInt(1);
      try {
        await computeCommitment(invalidNullifier, secret);
        throw new Error('Should have thrown an error');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.message).to.include('248-bit');
      }
    });

    it('should reject invalid inputs for MiMC', async () => {
      try {
        await mimcHash(FIELD_SIZE, BigInt(0));
        throw new Error('Should have thrown an error');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        expect(error.message).to.include('field element');
      }
    });
  });

  describe('Utility Functions', () => {
    const testValue = BigInt(123456789);

    it('should convert to hex correctly', () => {
      const hex = toHex(testValue);
      expect(hex).to.be.a('string');
      expect(hex).to.match(/^0x[0-9a-f]{64}$/);
    });

    it('should convert from hex correctly', () => {
      const hex = toHex(testValue);
      const value = fromHex(hex);
      expect(value).to.equal(testValue);
    });

    it('should round-trip hex conversion', () => {
      const hex = '0x' + '1234'.padStart(64, '0');
      const value = fromHex(hex);
      const hex2 = toHex(value);
      expect(hex2).to.equal(hex);
    });

    it('should convert to BigInt', () => {
      expect(toBigInt(123)).to.equal(BigInt(123));
      expect(toBigInt('456')).to.equal(BigInt(456));
      expect(toBigInt(BigInt(789))).to.equal(BigInt(789));
    });
  });
});
