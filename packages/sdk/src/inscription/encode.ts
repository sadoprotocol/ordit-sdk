
import cbor from 'cbor';
import { InscriptionID } from "./types";

export function encodeNumber(num: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeInt32BE(num);
  return buffer;
}

function reverseBufferByteChunks(src: Buffer): Buffer {
  const buffer = Buffer.alloc(src.length);
  for (let i = 0, j = src.length - 1; i <= j; i++, j--) {
    buffer[i] = src[j];
    buffer[j] = src[i];
  }
  return buffer;
}


export function encodeInscriptionID(inscriptionID: InscriptionID): Buffer {
  // Convert the txid string to a Buffer
  const txidBuffer = Buffer.from(inscriptionID.txid, 'hex');
  const reversedTxidBuffer = reverseBufferByteChunks(txidBuffer);

  // Convert the index to a 4-byte little-endian Buffer
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32LE(inscriptionID.index);

  // Trim trailing zero bytes
  let trimmedIndexBuffer = indexBuffer;
  for (let i = indexBuffer.length - 1; i >= 0; i--) {
    if (indexBuffer[i] === 0) {
      trimmedIndexBuffer = indexBuffer.slice(0, i);
    } else {
      break;
    }
  }

  return Buffer.concat([reversedTxidBuffer, trimmedIndexBuffer]);
}

export function encodeJSONAsCBORBuffer(json: any): Buffer[] {
  // Encode the JSON object into CBOR format
  const cborEncoded = cbor.encode(json);

  // Check if the encoded CBOR data exceeds 520 bytes
  if (cborEncoded.length <= 520) {
    // If it does not exceed 520 bytes, directly return an array containing one Buffer
    return [cborEncoded];
  } else {
    // If it exceeds 520 bytes, the Buffer needs to be split
    const parts: Buffer[] = [];
    let startIndex = 0;

    while (startIndex < cborEncoded.length) {
      // Calculate the length of the split, up to 520 bytes
      const length = Math.min(520, cborEncoded.length - startIndex);
      // Create a new Buffer to store the split part
      const part = Buffer.alloc(length);
      // Copy a portion of the CBOR data into the new Buffer
      cborEncoded.copy(part, 0, startIndex, startIndex + length);
      // Add the split part to the array
      parts.push(part);
      // Update the starting index
      startIndex += length;
    }

    return parts;
  }
}
