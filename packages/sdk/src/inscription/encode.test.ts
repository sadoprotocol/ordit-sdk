import * as cbor from 'cbor';
import { InscriptionID } from "./types";
import { encodeNumber, encodeInscriptionID, encodeJSONAsCBORBuffer } from './encode';

describe('encodeNumber', () => {
  it('should encode a positive number correctly', () => {
    const num = 123456;
    const encoded = encodeNumber(num);
    expect(encoded).toBeInstanceOf(Buffer);
    expect(encoded.readInt32BE()).toBe(num);
  });

  it('should encode a negative number correctly', () => {
    const num = -123456;
    const encoded = encodeNumber(num);
    expect(encoded).toBeInstanceOf(Buffer);
    expect(encoded.readInt32BE()).toBe(num);
  });

  it('should encode zero correctly', () => {
    const num = 0;
    const encoded = encodeNumber(num);
    expect(encoded).toBeInstanceOf(Buffer);
    expect(encoded.readInt32BE()).toBe(num);
  });

  it('should throw an error if the number is too large', () => {
    const num = 2 ** 31; // One more than the max 32-bit integer
    expect(() => encodeNumber(num)).toThrow();
  });

  it('should throw an error if the number is too small', () => {
    const num = -(2 ** 31) - 1; // One less than the min 32-bit integer
    expect(() => encodeNumber(num)).toThrow();
  });
});

describe('encodeInscriptionID', () => {
  it('should correctly encode a given InscriptionID into a Buffer', () => {
    // Arrange
    const inscriptionID: InscriptionID = {
      txid: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      index: 0
    };

    // Act
    const resultBuffer = encodeInscriptionID(inscriptionID);

    // Assert
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.toString('hex')).toBe('1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100');
  });

  it('should correctly encode a given InscriptionID into a Buffer with index 255', () => {
    // Arrange
    const inscriptionID: InscriptionID = {
      txid: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      index: 255
    };

    // Act
    const resultBuffer = encodeInscriptionID(inscriptionID);

    // Assert
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.toString('hex')).toBe('1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100ff');
  });

  it('should correctly encode a given InscriptionID into a Buffer with index 256', () => {
    // Arrange
    const inscriptionID: InscriptionID = {
      txid: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      index: 256
    };

    // Act
    const resultBuffer = encodeInscriptionID(inscriptionID);

    // Assert
    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.toString('hex')).toBe('1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a090807060504030201000001');
  });
});

describe('encodeJSONAsCBORBuffer', () => {
  test('encodes a JSON object into a single CBOR buffer if under 520 bytes', () => {
    const json = { key: 'value' };
    const encodedBuffers = encodeJSONAsCBORBuffer(json);
    expect(encodedBuffers).toHaveLength(1);
    expect(Buffer.isBuffer(encodedBuffers[0])).toBe(true);
    expect(encodedBuffers[0].length).toBeLessThanOrEqual(520);
    expect(cbor.decode(encodedBuffers[0])).toEqual(json);
  });

  test('splits CBOR buffer into multiple parts if over 520 bytes', () => {
    const largeJson = { longKey: 'a'.repeat(1000) }; // Adjust size to ensure it's over 520 bytes when encoded
    const encodedBuffers = encodeJSONAsCBORBuffer(largeJson);
    expect(encodedBuffers.length).toBeGreaterThan(1);
    encodedBuffers.forEach(buffer => {
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeLessThanOrEqual(520);
    });
    const combinedBuffer = Buffer.concat(encodedBuffers);
    expect(cbor.decode(combinedBuffer)).toEqual(largeJson);
  });

  test('handles edge case where CBOR encoding is exactly 520 bytes', () => {
    const edgeCaseJson = { exactSizeKey: 'b'.repeat(512) }; // Adjust the repeat count to get an exact 520-byte output
    const encodedBuffers = encodeJSONAsCBORBuffer(edgeCaseJson);
    expect(encodedBuffers).toHaveLength(2);
    expect(encodedBuffers[0].length).toEqual(520);
    const combinedBuffer = Buffer.concat(encodedBuffers);
    expect(cbor.decode(combinedBuffer)).toEqual(edgeCaseJson);
  });
});