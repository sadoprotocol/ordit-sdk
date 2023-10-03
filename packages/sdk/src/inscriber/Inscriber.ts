import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"
import { Tapleaf } from "bitcoinjs-lib/src/types"

import { buildWitnessScript } from "~/inscription"
import { PSBTBuilder } from "~/psbt-builder"
import { SkipStrictSatsCheckOptions, UTXOLimited } from "~/transactions/types"
import { createTransaction, encodeObject, getDummyP2TRInput, getNetwork } from "~/utils"
import { NestedObject } from "~/utils/types"
import { OnOffUnion } from "~/wallet"

import { InscriberArgOptions } from "./types"

bitcoin.initEccLib(ecc)

export class Inscriber extends PSBTBuilder {
  protected mediaType: string
  protected mediaContent: string
  protected meta?: NestedObject
  protected postage: number

  private ready = false
  private commitAddress: string | null = null
  private destinationAddress: string
  private payment: bitcoin.payments.Payment | null = null
  private suitableUnspent: UTXOLimited | null = null
  private recovery = false
  private safeMode: OnOffUnion
  private encodeMetadata: boolean
  private previewMode = false

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
    if (!publicKey || !changeAddress || !mediaContent) {
      throw new Error("Invalid options provided")
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

  async build() {
    if (!this.suitableUnspent || !this.payment) {
      throw new Error("Failed to build PSBT. Transaction not ready")
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
      this.outputs.push({
        address: this.changeAddress || this.address,
        value: this.suitableUnspent.sats - this.fee
      })
    }

    await this.prepare() // prepare PSBT using PSBTBuilder
  }

  private isBuilt() {
    if (!this.commitAddress || !this.fee) {
      throw new Error("Invalid tx! Make sure you generate commit address or recover and finally build")
    }
  }

  buildWitness() {
    this.witnessScripts = {
      inscription: buildWitnessScript({
        mediaContent: this.mediaContent,
        mediaType: this.mediaType,
        meta: this.getMetadata(),
        xkey: this.xKey
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
        throw new Error("No UTXO found to recover")
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
      throw new Error("Unable to process request in preview mode")
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
    const [utxo] = await this.retrieveSelectedUTXOs(this.commitAddress!, amount)
    this.suitableUnspent = utxo
    this.ready = true

    return this.suitableUnspent
  }
}
