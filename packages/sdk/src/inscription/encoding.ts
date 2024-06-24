import { splitInscriptionId } from "../utils"

export function trimTrailingZeroBytes(buffer: Buffer): Buffer {
  let trimmedBuffer = buffer
  for (let i = buffer.length - 1; i >= 0; i--) {
    // find the first non-zero byte
    if (buffer[i] !== 0) {
      trimmedBuffer = buffer.subarray(0, i + 1)
      break
    }
  }
  return trimmedBuffer
}

export function encodePointer(num: number | string | bigint): Buffer {
  const buffer = Buffer.allocUnsafe(8)
  buffer.writeBigUInt64LE(BigInt(num))
  return trimTrailingZeroBytes(buffer)
}

export function encodeTag(tag: number): Buffer {
  let tagInHex = tag.toString(16)
  // ensure even length or Buffer.from will remove odd length bytes
  if (tagInHex.length % 2 !== 0) {
    tagInHex = "0" + tagInHex
  }
  return Buffer.from(tagInHex, "hex")
}

function reverseBufferByteChunks(src: Buffer): Buffer {
  const buffer = Buffer.from(src)
  return buffer.reverse()
}

export function encodeInscriptionId(inscriptionId: string): Buffer {
  const { txId, index } = splitInscriptionId(inscriptionId)

  // reverse txId byte
  const txidBuffer = Buffer.from(txId, "hex")
  const reversedTxIdBuffer = reverseBufferByteChunks(txidBuffer)

  // Convert index to little-endian, max 4 bytes
  const indexBuffer = Buffer.alloc(4)
  indexBuffer.writeUInt32LE(index)

  // Trim trailing zero bytes
  const trimmedIndexBuffer = trimTrailingZeroBytes(indexBuffer)

  return Buffer.concat([reversedTxIdBuffer, trimmedIndexBuffer])
}
