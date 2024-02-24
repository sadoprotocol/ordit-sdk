import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"

import { MAXIMUM_SCRIPT_ELEMENT_SIZE } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { InscriptionID, InscriptionFieldTag } from "./types"
import { encodeNumber, encodeInscriptionID, encodeJSONAsCBORBuffer } from './encode'

export function buildWitnessScript({ recover = false, ...options }: WitnessScriptOptions) {
  bitcoin.initEccLib(ecc)

  if (!options.xkey) {
    throw new OrditSDKError("Failed to build witness script")
  }

  if (recover) {
    return bitcoin.script.compile([Buffer.from(options.xkey, "hex"), bitcoin.opcodes.OP_CHECKSIG])
  }

  const baseStackElements = [
    Buffer.from(options.xkey, "hex"),
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    opPush("ord"),
  ]

  let fieldStackElements = new Array<number | Buffer>();

  // push field: pointer
  if (options.pointer) {
    fieldStackElements.push(InscriptionFieldTag.Pointer)
    fieldStackElements.push(encodeNumber(options.pointer))
  }

  // push field: parent
  if (options.parent) {
    fieldStackElements.push(InscriptionFieldTag.Parent)
    fieldStackElements.push(encodeInscriptionID(options.parent))
  }

  // push field: metadata
  if (typeof options.meta === "object") {
    const metaChunks = encodeJSONAsCBORBuffer(options.meta)

    metaChunks &&
      metaChunks.forEach((chunk) => {
        fieldStackElements.push(InscriptionFieldTag.Metadata)
        fieldStackElements.push(opPush(chunk))
      })
  }

  // push field: metaprotocol
  if (options.metaprotocol) {
    fieldStackElements.push(InscriptionFieldTag.Metaprotocol)
    fieldStackElements.push(opPush(options.metaprotocol))
  }

  // push field: content_encoding
  if (options.contentEncoding) {
    fieldStackElements.push(InscriptionFieldTag.ContentEncoding)
    fieldStackElements.push(opPush(options.contentEncoding))
  }

  // push field: delegate
  if (options.delegate) {
    fieldStackElements.push(InscriptionFieldTag.Delegate)
    fieldStackElements.push(encodeInscriptionID(options.delegate))
  }

  // push content
  let contentStackElements = new Array<number | Buffer>();

  if (options.mediaType && options.mediaContent) {
    // push field: content-type
    fieldStackElements.push(InscriptionFieldTag.ContentType)
    fieldStackElements.push(opPush(options.mediaType))

    // push content-body
    contentStackElements.push(InscriptionFieldTag.Body)
    const contentChunks = chunkContent(options.mediaContent, !options.mediaType.includes("text") ? "base64" : "utf8")
    contentChunks.forEach((chunk) => {
      contentStackElements.push(opPush(chunk))
    })
  }

  return bitcoin.script.compile([
    ...baseStackElements,
    ...fieldStackElements,
    ...contentStackElements,
    bitcoin.opcodes.OP_ENDIF,
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
  mediaContent?: string
  mediaType?: string
  meta?: any
  recover?: boolean
  pointer?: number
  parent?: InscriptionID
  metaprotocol?: string
  contentEncoding?: string
  delegate?: InscriptionID
}
