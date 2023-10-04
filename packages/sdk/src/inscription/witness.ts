import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"

import { MAXIMUM_SCRIPT_ELEMENT_SIZE } from "../constants"

export function buildWitnessScript({ recover = false, ...options }: WitnessScriptOptions) {
  bitcoin.initEccLib(ecc)
  if (!options.mediaType || !options.mediaContent || !options.xkey) {
    throw new Error("Failed to build witness script")
  }

  const contentChunks = chunkContent(options.mediaContent, !options.mediaType.includes("text") ? "base64" : "utf8")
  const metaStackElements: (number | Buffer)[] = []

  if (typeof options.meta === "object") {
    metaStackElements.push(
      ...[
        bitcoin.opcodes.OP_FALSE,
        bitcoin.opcodes.OP_IF,
        opPush("ord"),
        1,
        1,
        opPush("application/json;charset=utf-8"),
        bitcoin.opcodes.OP_0
      ]
    )
    const metaChunks = chunkContent(JSON.stringify(options.meta))

    metaChunks &&
      metaChunks.forEach((chunk) => {
        metaStackElements.push(opPush(chunk))
      })
    metaChunks && metaStackElements.push(bitcoin.opcodes.OP_ENDIF)
  }

  const baseStackElements = [
    Buffer.from(options.xkey, "hex"),
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    opPush("ord"),
    1,
    1,
    opPush(options.mediaType),
    bitcoin.opcodes.OP_0
  ]

  const contentStackElements = contentChunks.map(opPush)

  if (recover) {
    return bitcoin.script.compile([Buffer.from(options.xkey, "hex"), bitcoin.opcodes.OP_CHECKSIG])
  }

  return bitcoin.script.compile([
    ...baseStackElements,
    ...contentStackElements,
    bitcoin.opcodes.OP_ENDIF,
    ...metaStackElements
  ])
}

function opPush(data: string | Buffer) {
  const buff = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")
  return Buffer.concat([buff])
}

export const chunkContent = function (str: string, encoding: BufferEncoding = "utf8") {
  const contentBuffer = Buffer.from(str, encoding)
  const chunks: Buffer[] = []
  let chunkedBytes = 0

  do {
    const chunk = contentBuffer.subarray(chunkedBytes, chunkedBytes + MAXIMUM_SCRIPT_ELEMENT_SIZE)
    chunkedBytes += chunk.byteLength

    chunks.push(chunk)
  } while (chunkedBytes < contentBuffer.byteLength)

  return chunks
}

export type WitnessScriptOptions = {
  xkey: string
  mediaContent: string
  mediaType: string
  meta: any
  recover?: boolean
}
