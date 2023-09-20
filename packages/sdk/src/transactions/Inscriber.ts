import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"
import { Tapleaf } from "bitcoinjs-lib/src/types"

import {
  buildWitnessScript,
  createTransaction,
  encodeObject,
  getAddressesFromPublicKey,
  getDummyP2TRInput,
  getNetwork,
  GetWalletOptions,
  OnOffUnion
} from ".."
import { Network } from "../config/types"
import { InputsToSign } from "../inscription/types"
import { NestedObject } from "../utils/types"
import { PSBTBuilder } from "./PSBTBuilder"
import { UTXOLimited } from "./types"

bitcoin.initEccLib(ecc)

export class Inscriber extends PSBTBuilder {
  network: Network

  mediaType: string
  mediaContent: string
  meta?: NestedObject
  postage: number

  address: string
  publicKey: string
  destinationAddress: string
  changeAddress: string
  inputsToSign: InputsToSign

  private ready = false

  private xKey!: string
  private commitAddress: string | null = null
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
    feeRate,
    postage,
    mediaContent,
    mediaType,
    publicKey,
    outputs = [],
    encodeMetadata = false,
    changeAddress,
    destination,
    safeMode,
    meta
  }: InscriberArgOptions) {
    const { xkey, address } = getAddressesFromPublicKey(publicKey, network, "p2tr")[0]
    super({
      address: address!,
      feeRate,
      network,
      publicKey,
      outputs,
      inscriberMode: true
    })
    if (!publicKey || !changeAddress || !destination || !mediaContent) {
      throw new Error("Invalid options provided")
    }

    this.publicKey = publicKey
    this.feeRate = feeRate
    this.mediaType = mediaType
    this.network = network
    this.changeAddress = changeAddress
    this.destinationAddress = destination
    this.mediaContent = mediaContent
    this.meta = meta
    this.postage = postage
    this.outputs = outputs
    this.safeMode = !safeMode ? "on" : safeMode
    this.encodeMetadata = encodeMetadata

    if (!xkey) {
      throw new Error("Failed to derive xKey from the provided public key")
    }

    this.xKey = xkey
    this.address = address!
    this.inputsToSign = {
      address: this.address,
      signingIndexes: []
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

    this.inputsToSign.signingIndexes.push(0) // hardcoding because there will always be one input

    if (!this.recovery) {
      this.outputs.push({
        address: this.destinationAddress,
        value: this.postage
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
      this.suitableUnspent = getDummyP2TRInput()
      this.ready = true
      await this.build()
    } else {
      this.initPSBT()
      this.suitableUnspent = null
      this.ready = false
      this.inputsToSign.signingIndexes.pop() // remove last added index
      this.outputs.pop()
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

    await this.calculateNetworkFeeUsingPreviewMode()
  }

  async isReady() {
    this.isBuilt()

    if (!this.ready) {
      try {
        await this.fetchAndSelectSuitableUnspent()
      } catch (error) {
        return false
      }
    }

    return this.ready
  }

  async fetchAndSelectSuitableUnspent() {
    this.restrictUsageInPreviewMode()
    this.isBuilt()

    const amount = this.fee + this.outputAmount
    const [utxo] = await this.retrieveSelectedUTXOs(this.commitAddress!, amount)
    this.suitableUnspent = utxo
    this.ready = true

    return this.suitableUnspent
  }
}

/**
 * @deprecated `OrdTransaction` class has been renamed to `Inscriber`
 */
export class OrdTransaction extends Inscriber {
  constructor(args: InscriberArgOptions) {
    super(args)
    console.error("DEPRECATION WARNING: 'OrdTransaction' class has been renamed to 'Inscriber'")
  }
}

export type InscriberArgOptions = Pick<GetWalletOptions, "safeMode"> & {
  network: Network
  feeRate: number
  postage: number
  mediaType: string
  mediaContent: string
  destination: string
  changeAddress: string
  meta?: NestedObject
  publicKey: string
  outputs?: Outputs
  encodeMetadata?: boolean
}

type Outputs = Array<{ address: string; value: number }>