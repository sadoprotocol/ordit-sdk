import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"

import { MAXIMUM_SCRIPT_ELEMENT_SIZE } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { encodeInscriptionId, encodePointer, encodeTag } from "./encoding"
import { EnvelopeOpts } from "./types"

export const INSCRIPTION_FIELD_TAG = {
  ContentType: encodeTag(1),
  Pointer: encodeTag(2),
  Parent: encodeTag(3),
  Metadata: encodeTag(5),
  Metaprotocol: encodeTag(7),
  ContentEncoding: encodeTag(9),
  Delegate: encodeTag(11)
}

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

export function buildWitnessScriptV2({ xkey, envelopes }: WitnessScriptV2Options) {
  bitcoin.initEccLib(ecc)
  if (!xkey) {
    throw new OrditSDKError("xkey is required to build witness script")
  }

  const envelopesStackElements:(number | Buffer)[] = []
  // build all envelopes
  for (const envelopeOpt of envelopes) {
    const envelope = buildEnvelope(envelopeOpt)
    envelopesStackElements.push(...envelope)
  }

  return bitcoin.script.compile([
    Buffer.from(xkey, "hex"),
    bitcoin.opcodes.OP_CHECKSIG,
    ...envelopesStackElements
  ])
}

export function buildRecoverWitnessScript(xkey: string) {
  return bitcoin.script.compile([Buffer.from(xkey, "hex"), bitcoin.opcodes.OP_CHECKSIG])
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

export const buildEnvelope = function ({delegateInscriptionId,mediaContent,mediaType,pointer}: EnvelopeOpts) {
  if (!delegateInscriptionId && !mediaContent && !mediaType) {
    throw new OrditSDKError("mediaContent and mediaType are required to build an envelope")
  }
  if (!!delegateInscriptionId && !!mediaContent && !!mediaType) {
    throw new OrditSDKError("Cannot build an envelope with both media content and a delegate inscription id")
  }

  const baseStackElements = [
    bitcoin.opcodes.OP_FALSE,
    bitcoin.opcodes.OP_IF,
    opPush("ord"),
  ]

  if (pointer) {
    const encodedPointer = encodePointer(pointer)
    if (!encodedPointer.equals(Buffer.alloc(0))) {
      // only push pointer tag if it is not 0
      baseStackElements.push(
        INSCRIPTION_FIELD_TAG.Pointer,
        encodedPointer
      )
    }
  }

  if (delegateInscriptionId) {
    baseStackElements.push(
      INSCRIPTION_FIELD_TAG.Delegate,
      encodeInscriptionId(delegateInscriptionId)
    )
  }

  // TODO: support other tags (Parent, Metadata, Metaprotocol, ContentEncoding)

  if (mediaContent && mediaType) {
    baseStackElements.push(
      INSCRIPTION_FIELD_TAG.ContentType,
      opPush(mediaType),
      bitcoin.opcodes.OP_0,
      ...chunkContent(mediaContent, !mediaType.includes("text") ? "base64" : "utf8")
    )
  }

  // END
  baseStackElements.push(bitcoin.opcodes.OP_ENDIF)
  return baseStackElements
}

export type WitnessScriptOptions = {
  xkey: string
  mediaContent: string
  mediaType: string
  meta: any
  recover?: boolean
}

export type WitnessScriptV2Options = {
  xkey: string
  envelopes: EnvelopeOpts[]
}