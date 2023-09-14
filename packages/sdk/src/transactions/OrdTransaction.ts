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
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
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

  private witnessScripts: Record<"inscription" | "recovery", Buffer | null> = {
    inscription: null,
    recovery: null
  }
  private taprootTree!: [Tapleaf, Tapleaf]

  constructor({
    feeRate,
    postage,
    mediaType = "text/plain;charset=utf-8",
    network = "testnet",
    publicKey,
    outs = [],
    encodeMetadata = false,
    ...otherOptions
  }: OrdTransactionOptions) {
    const { xkey, address } = getAddressesFromPublicKey(publicKey, network, "p2tr")[0]
    super({
      address: address!,
      feeRate,
      network,
      publicKey,
      outputs: outs,
      inscriberMode: true
    })
    if (!publicKey || !otherOptions.changeAddress || !otherOptions.destination || !otherOptions.mediaContent) {
      throw new Error("Invalid options provided")
    }

    this.publicKey = publicKey
    this.feeRate = feeRate
    this.mediaType = mediaType
    this.network = network
    this.changeAddress = otherOptions.changeAddress
    this.destinationAddress = otherOptions.destination
    this.mediaContent = otherOptions.mediaContent
    this.meta = otherOptions.meta
    this.postage = postage
    this.outputs = outs
    this.safeMode = !otherOptions.safeMode ? "on" : otherOptions.safeMode
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

  get outs() {
    return this.outputs
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

    this.changeAmount = this.suitableUnspent.sats - this.fee - this.outputAmount - this.postage
    if (this.changeAmount > MINIMUM_AMOUNT_IN_SATS) {
      await this.addChangeOutput()
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
      this.suitableUnspent = getDummyP2TRInput()
      this.ready = true
      await this.build()
    } else {
      this.initPSBT()
      this.suitableUnspent = null
      this.ready = false
      this.inputsToSign.signingIndexes.pop() // remove last added index
      this.outputs.pop()
    }
  }

  async generateCommit() {
    this.buildTaprootTree()
    this.payment = bitcoin.payments.p2tr({
      internalPubkey: Buffer.from(this.xKey, "hex"),
      network: getNetwork(this.network),
      scriptTree: this.taprootTree,
      redeem: this.getInscriptionRedeemScript()
    })
    this.witnesses = this.payment.witness

    await this.preview()
    this.calculateNetworkFee()
    await this.preview({ activate: false })

    this.commitAddress = this.payment.address!
    return {
      address: this.payment.address!,
      revealFee: this.fee + this.outputAmount
    }
  }

  async recover() {
    this.buildTaprootTree()

    const payment = createTransaction(Buffer.from(this.xKey, "hex"), "p2tr", this.network, {
      scriptTree: this.taprootTree,
      redeem: this.getRecoveryRedeemScript()
    })

    await this.preview()
    this.calculateNetworkFee()
    await this.preview({ activate: false })

    this.payment = payment
    this.recovery = true
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
  constructor(args: OrdTransactionOptions) {
    super(args)
    console.error("DEPRECATION WARNING: 'OrdTransaction' class has been renamed to 'Inscriber'")
  }
}

export type OrdTransactionOptions = Pick<GetWalletOptions, "safeMode"> & {
  feeRate: number
  postage: number
  mediaType: string
  mediaContent: string
  destination: string
  changeAddress: string
  meta?: NestedObject
  network: Network
  publicKey: string
  outs?: Outputs
  encodeMetadata?: boolean
}

type Outputs = Array<{ address: string; value: number }>
