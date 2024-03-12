import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"
import { Tapleaf } from "bitcoinjs-lib/src/types"

import {
  InscriptionID,
  buildWitnessScript,
  createTransaction,
  encodeObject,
  getDummyP2TRInput,
  getNetwork,
  GetWalletOptions,
  OnOffUnion
} from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { NestedObject } from "../utils/types"
import { PSBTBuilder } from "./PSBTBuilder"
import { SkipStrictSatsCheckOptions, UTXOLimited } from "./types"

bitcoin.initEccLib(ecc)

export class Inscriber extends PSBTBuilder {
  protected mediaType?: string
  protected mediaContent?: string
  protected meta?: NestedObject
  protected postage: number

  private ready = false
  private commitAddress: string | null = null
  private destinationAddress: string
  private payment: bitcoin.payments.Payment | null = null
  private suitableUnspent: UTXOLimited | null = null
  private recovery = false
  private recoverAmount = 0
  private safeMode: OnOffUnion
  private encodeMetadata: boolean
  private previewMode = false
  private pointer?: number
  private parent?: InscriptionID
  private metaprotocol?: string
  private contentEncoding?: string
  private delegate?: InscriptionID

  private witnessScripts: Record<"inscription" | "recovery", Buffer | null> = {
    inscription: null,
    recovery: null
  }
  private taprootTree!: [Tapleaf, Tapleaf]

  constructor({
    network,
    address,
    changeAddress,
    destinationAddress,
    publicKey,
    feeRate,
    postage,
    mediaContent,
    mediaType,
    outputs = [],
    encodeMetadata = false,
    safeMode,
    meta
  }: InscriberArgOptions) {
    super({
      address,
      changeAddress,
      feeRate,
      network,
      publicKey,
      outputs,
      autoAdjustment: false
    })
    if (!publicKey || !changeAddress) {
      throw new OrditSDKError("Invalid options provided")
    }

    this.destinationAddress = destinationAddress
    this.mediaType = mediaType
    this.mediaContent = mediaContent
    this.meta = meta
    this.postage = postage
    this.safeMode = !safeMode ? "on" : safeMode
    this.encodeMetadata = encodeMetadata
  }

  get data() {
    return {
      fee: this.fee,
      virtualSize: this.virtualSize,
      weight: this.weight,
      changeAmount: this.changeAmount,
      inputAmount: this.inputAmount,
      outputAmount: this.outputAmount,
      postage: this.postage
    }
  }

  private getMetadata() {
    return this.meta && this.encodeMetadata ? encodeObject(this.meta) : this.meta
  }

  withPointer(pointer: number): Inscriber {
    this.pointer = pointer
    return this
  }

  withParent(parent: InscriptionID): Inscriber {
    this.parent = parent
    return this
  }

  withMetaProtocol(metaprotocol: string): Inscriber {
    this.metaprotocol = metaprotocol
    return this
  }

  withContentEncoding(contentEncoding: string): Inscriber {
    this.contentEncoding = contentEncoding
    return this
  }

  withDelegate(delegate: InscriptionID): Inscriber {
    this.delegate = delegate
    return this
  }

  async build() {
    if (!this.suitableUnspent || !this.payment) {
      throw new OrditSDKError("Failed to build PSBT. Transaction not ready")
    }

    this.inputs = [
      {
        type: "taproot",
        hash: this.suitableUnspent.txid,
        index: this.suitableUnspent.n,
        tapInternalKey: Buffer.from(this.xKey, "hex"),
        witnessUtxo: {
          script: this.payment.output!,
          value: this.suitableUnspent.sats
        },
        tapLeafScript: [
          {
            leafVersion: this.payment.redeemVersion!,
            script: this.payment.redeem!.output!,
            controlBlock: this.payment.witness![this.payment.witness!.length - 1]
          }
        ]
      }
    ]

    if (!this.recovery) {
      this.outputs = [
        {
          address: this.destinationAddress || this.address,
          value: this.postage
        }
      ].concat(this.outputs)
    }

    if (this.recovery) {
      this.recoverAmount = this.suitableUnspent.sats - this.fee
      // when in recovery mode, there will only be 1 output
      this.outputs = [{
        address: this.changeAddress || this.address,
        value: this.recoverAmount
      }]
    }

    await this.prepare() // prepare PSBT using PSBTBuilder
  }

  private isBuilt() {
    if (!this.commitAddress || !this.fee) {
      throw new OrditSDKError("Invalid tx! Make sure you generate commit address or recover and finally build")
    }
  }

  buildWitness() {
    this.witnessScripts = {
      inscription: buildWitnessScript({
        mediaContent: this.mediaContent,
        mediaType: this.mediaType,
        meta: this.getMetadata(),
        xkey: this.xKey,
        pointer: this.pointer,
        parent: this.parent,
        metaprotocol: this.metaprotocol,
        contentEncoding: this.contentEncoding,
        delegate: this.delegate
      }),
      recovery: buildWitnessScript({
        mediaContent: this.mediaContent,
        mediaType: this.mediaType,
        meta: this.getMetadata(),
        xkey: this.xKey,
        recover: true
      })
    }
  }

  buildTaprootTree() {
    this.buildWitness()
    this.taprootTree = [{ output: this.witnessScripts.inscription! }, { output: this.witnessScripts.recovery! }]
  }

  getInscriptionRedeemScript(): bitcoin.payments.Payment["redeem"] {
    return {
      output: this.witnessScripts.inscription!,
      redeemVersion: 192
    }
  }

  getRecoveryRedeemScript(): bitcoin.payments.Payment["redeem"] {
    return {
      output: this.witnessScripts.recovery!,
      redeemVersion: 192
    }
  }

  private async preview({ activate }: Record<"activate", boolean> = { activate: true }) {
    if (activate) {
      this.previewMode = true
      this.suitableUnspent = this.recovery
        ? (await this.datasource.getUnspents({ address: this.commitAddress! })).spendableUTXOs[0]
        : getDummyP2TRInput()

      if (this.recovery && !this.suitableUnspent) {
        throw new OrditSDKError("No UTXO found to recover")
      }

      this.ready = true
      await this.build()
    } else {
      this.initPSBT()
      this.suitableUnspent = null
      this.ready = false
      this.outputs.shift()
      this.previewMode = false
    }
  }

  private restrictUsageInPreviewMode() {
    if (this.previewMode) {
      throw new OrditSDKError("Unable to process request in preview mode")
    }
  }

  private async calculateNetworkFeeUsingPreviewMode() {
    await this.preview()
    this.calculateNetworkFee()
    await this.preview({ activate: false })
  }

  async generateCommit() {
    this.buildTaprootTree()
    this.payment = bitcoin.payments.p2tr({
      internalPubkey: Buffer.from(this.xKey, "hex"),
      network: getNetwork(this.network),
      scriptTree: this.taprootTree,
      redeem: this.getInscriptionRedeemScript()
    })
    this.witness = this.payment.witness

    await this.calculateNetworkFeeUsingPreviewMode()

    this.commitAddress = this.payment.address!
    return {
      address: this.payment.address!,
      revealFee: this.fee + this.outputAmount
    }
  }

  async recover() {
    this.recovery = true
    this.buildTaprootTree()

    this.payment = createTransaction(Buffer.from(this.xKey, "hex"), "p2tr", this.network, {
      scriptTree: this.taprootTree,
      redeem: this.getRecoveryRedeemScript()
    })
    this.commitAddress = this.payment.address!

    await this.calculateNetworkFeeUsingPreviewMode()

    return {
      recoverAddress: this.changeAddress || this.address,
      recoverAmount: this.recoverAmount - this.fee, // need to minus this.fee again because the first time, fee is 0
      recoverFee: this.fee
    }
  }

  async isReady({ skipStrictSatsCheck, customAmount }: SkipStrictSatsCheckOptions = {}) {
    this.isBuilt()

    if (!this.ready) {
      try {
        await this.fetchAndSelectSuitableUnspent({ skipStrictSatsCheck, customAmount })
      } catch (error) {
        return false
      }
    }

    return this.ready
  }

  async fetchAndSelectSuitableUnspent({ skipStrictSatsCheck, customAmount }: SkipStrictSatsCheckOptions = {}) {
    this.restrictUsageInPreviewMode()
    this.isBuilt()

    const amount = this.recovery
      ? this.outputAmount - this.fee
      : skipStrictSatsCheck && customAmount && !isNaN(customAmount)
        ? customAmount
        : this.outputAmount + this.fee

    // Output to be paid to user
    if (amount < MINIMUM_AMOUNT_IN_SATS) {
      throw new OrditSDKError("Requested output amount is lower than minimum dust amount")
    }

    const utxos = await this.retrieveSelectedUTXOs(this.commitAddress!, amount)

    if (utxos.length === 0) {
      throw new OrditSDKError("No selected utxos retrieved")
    }

    this.suitableUnspent = utxos[0]
    this.ready = true

    return this.suitableUnspent
  }
}

export type InscriberArgOptions = Pick<GetWalletOptions, "safeMode"> & {
  network: Network
  address: string
  destinationAddress: string
  publicKey: string
  feeRate: number
  postage: number
  mediaType?: string
  mediaContent?: string
  changeAddress: string
  meta?: NestedObject
  outputs?: Outputs
  encodeMetadata?: boolean
}

type Outputs = Array<{ address: string; value: number }>
