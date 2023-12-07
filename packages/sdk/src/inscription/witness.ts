import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"

import { MAXIMUM_SCRIPT_ELEMENT_SIZE } from "../constants"
import { OrditSDKError } from "../utils/errors"

export function buildWitnessScript({ recover = false, ...options }: WitnessScriptOptions) {
  bitcoin.initEccLib(ecc)
  if (!options.mediaType || !options.mediaContent || !options.xkey) {
    throw new OrditSDKError("Failed to build witness script")
  }

  if (recover) {
    return bitcoin.script.compile([Buffer.from(options.xkey, "hex"), bitcoin.opcodes.OP_CHECKSIG])
  }

  const contentChunks = chunkContent(options.mediaContent, !options.mediaType.includes("text") ? "base64" : "utf8")
  const contentStackElements = contentChunks.map(opPush)
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

  return bitcoin.script.compile([
    ...baseStackElements,
    ...contentStackElements,
    bitcoin.opcodes.OP_ENDIF,
    ...metaStackElements
  ])
}

function opPush(data: string | Buffer) {
  const buff = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8")
  if (buff.byteLength > MAXIMUM_SCRIPT_ELEMENT_SIZE)
    throw new OrditSDKError("Data is too large to push. Use chunkContent to split data into smaller chunks")

  return Buffer.concat([buff])
}

export const chunkContent = function (str: string, encoding: BufferEncoding = "utf8") {
  const contentBuffer = Buffer.from(str, encoding)
  const chunks: Buffer[] = []
  let chunkedBytes = 0

  while (chunkedBytes < contentBuffer.byteLength) {
    const chunk = contentBuffer.subarray(chunkedBytes, chunkedBytes + MAXIMUM_SCRIPT_ELEMENT_SIZE)
    chunkedBytes += chunk.byteLength
    chunks.push(chunk)
  }

  return chunks
}

export type WitnessScriptOptions = {
  xkey: string
  mediaContent: string
  mediaType: string
  meta: any
  recover?: boolean
}
