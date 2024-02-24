
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

export function encodeJSON(json: any): Buffer[] {
  // 将JSON对象编码为CBOR格式
  const cborEncoded = cbor.encode(json);

  // 检查编码后的CBOR数据是否超过520字节
  if (cborEncoded.length <= 520) {
    // 如果没有超过520字节，直接返回包含一个Buffer的数组
    return [cborEncoded];
  } else {
    // 如果超过520字节，需要分割Buffer
    const parts: Buffer[] = [];
    let startIndex = 0;

    while (startIndex < cborEncoded.length) {
      // 计算分割的长度，最多520字节
      const length = Math.min(520, cborEncoded.length - startIndex);
      // 创建一个新的Buffer用于存储分割的部分
      const part = Buffer.alloc(length);
      // 将CBOR数据的一部分复制到新的Buffer中
      cborEncoded.copy(part, 0, startIndex, startIndex + length);
      // 将分割的部分添加到数组中
      parts.push(part);
      // 更新起始索引
      startIndex += length;
    }

    return parts;
  }
}