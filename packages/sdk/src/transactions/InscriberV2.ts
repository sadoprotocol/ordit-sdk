import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"
import { Taptree } from "bitcoinjs-lib/src/types"

import {
  BaseDatasource,
  buildRecoverWitnessScript,
  buildWitnessScript,
  buildWitnessScriptV2,
  createTransaction,
  EnvelopeOpts,
  getDummyP2TRInput,
  getNetwork,
  TaptreeVersion
} from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { PSBTBuilder } from "./PSBTBuilder"
import { SkipStrictSatsCheckOptions, UTXOLimited } from "./types"

bitcoin.initEccLib(ecc)

export class InscriberV2 extends PSBTBuilder {
  protected taptreeVersion?: TaptreeVersion = "3"

  private ready = false
  private commitAddress: string | null = null
  private payment: bitcoin.payments.Payment | null = null
  private suitableUnspent: UTXOLimited | null = null
  private recovery = false
  private recoverAmount = 0
  private previewMode = false
  private isStandard = true
  readonly metaInscriptions: EnvelopeOpts[]
  readonly inscriptions: EnvelopeOpts[]

  private witnessScripts: Record<
    "recovery" | "inscriptions" | "metaInscriptions" | "inscriptionLegacy" | "metaInscriptionLegacy",
    Buffer | null
  > = {
    inscriptions: null,
    metaInscriptions: null,
    inscriptionLegacy: null,
    metaInscriptionLegacy: null,
    recovery: null
  }
  private taprootTree!: Taptree

  constructor({
    network,
    changeAddress,
    address,
    publicKey,
    feeRate,
    outputs = [],
    taptreeVersion,
    datasource,
    metaInscriptions,
    inscriptions,
    isStandard
  }: InscriberV2ArgOptions) {
    super({
      address,
      changeAddress,
      feeRate,
      network,
      publicKey,
      outputs,
      autoAdjustment: false,
      datasource
    })
    if (!publicKey || !changeAddress || !feeRate || !network) {
      throw new OrditSDKError("Invalid options provided")
    }
    this.taptreeVersion = taptreeVersion
    this.metaInscriptions = metaInscriptions ?? []
    this.inscriptions = inscriptions ?? []
    this.isStandard = isStandard ?? true
  }

  get data() {
    return {
      fee: this.fee,
      virtualSize: this.virtualSize,
      weight: this.weight,
      changeAmount: this.changeAmount,
      inputAmount: this.inputAmount,
      outputAmount: this.outputAmount
    }
  }

  async build() {
    if (!this.suitableUnspent || !this.payment) {
      throw new OrditSDKError("Failed to build PSBT. Transaction not ready")
    }

    if ((this.taptreeVersion === "2" || this.taptreeVersion === "1") && this.inscriptions.length > 1) {
      throw new OrditSDKError("Only 1 inscription is allowed for taptree version 1 and 2")
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
        ...this.inscriptions.map((inscription) => ({
          address: inscription.receiverAddress,
          value: inscription.postage
        }))
      ].concat(this.outputs)
    }

    if (this.recovery) {
      this.recoverAmount = this.suitableUnspent.sats - this.fee
      // when in recovery mode, there will only be 1 output
      this.outputs = [
        {
          address: this.changeAddress || this.address,
          value: this.recoverAmount
        }
      ]
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
      inscriptions: buildWitnessScriptV2({
        xkey: this.xKey,
        envelopes: this.inscriptions
      }),
      metaInscriptions: buildWitnessScriptV2({
        xkey: this.xKey,
        envelopes: this.metaInscriptions
      }),
      inscriptionLegacy: buildWitnessScript({
        mediaContent: this.inscriptions[0].mediaContent!,
        mediaType: this.inscriptions[0].mediaType!,
        meta: false,
        xkey: this.xKey
      }),
      metaInscriptionLegacy: buildWitnessScript({
        mediaContent: this.inscriptions[0].mediaContent!,
        mediaType: this.inscriptions[0].mediaType!,
        meta: JSON.parse(this.metaInscriptions[0].mediaContent!),
        xkey: this.xKey
      }),
      recovery: buildRecoverWitnessScript(this.xKey)
    }
  }

  buildTaprootTree() {
    this.buildWitness()
    switch (this.taptreeVersion) {
      case "3":
        // v3 allows for multiple/single inscription minting (without meta) and remains unique based on the meta (OIP-2 specs)
        this.taprootTree = [
          [{ output: this.witnessScripts.recovery! }, { output: this.witnessScripts.metaInscriptions! }],
          { output: this.witnessScripts.inscriptions! }
        ]
        break
      case "2":
        // v2 allows for inscription only minting (without meta) and remains unique based on the meta (OIP-2 specs)
        this.taprootTree = [
          [{ output: this.witnessScripts.recovery! }, { output: this.witnessScripts.metaInscriptionLegacy! }],
          { output: this.witnessScripts.inscriptionLegacy! }
        ]
        break
      case "1":
        // v1 allows for inscription (with meta) and recovery minting (OIP-2 specs)
        this.taprootTree = [
          { output: this.witnessScripts.metaInscriptionLegacy! },
          { output: this.witnessScripts.recovery! }
        ]
        break
      default:
        throw new OrditSDKError("Invalid taptreeVersion provided")
    }
  }

  getReedemScript(): bitcoin.payments.Payment["redeem"] {
    switch (this.taptreeVersion) {
      case "3":
        return {
          output: this.witnessScripts.inscriptions!,
          redeemVersion: 192
        }
      case "2":
        return {
          output: this.witnessScripts.inscriptionLegacy!,
          redeemVersion: 192
        }
      case "1":
        return {
          output: this.witnessScripts.metaInscriptionLegacy!,
          redeemVersion: 192
        }
      default:
        throw new OrditSDKError("Invalid taptreeVersion provided")
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
      // revert inscription outputs
      this.outputs = this.outputs.slice(this.inscriptions.length)
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
      redeem: this.getReedemScript()
    })
    this.witness = this.payment.witness

    await this.calculateNetworkFeeUsingPreviewMode()

    if (this.isStandard) {
      // max weight of a tx is 400,000 WU https://github.com/bitcoin/bitcoin/blob/d908877c4774c2456eed09167a5f382758e4a8a6/src/policy/policy.h#L26-L27
      if (this.weight > 400_000) {
        throw new OrditSDKError("Transaction exceeds maximum weight")
      }
    }

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

export type InscriberV2ArgOptions = {
  network: Network
  address: string
  publicKey: string
  feeRate: number
  changeAddress: string
  metaInscriptions: EnvelopeOpts[]
  inscriptions: EnvelopeOpts[]
  taptreeVersion?: TaptreeVersion
  outputs?: Outputs
  datasource?: BaseDatasource
  isStandard?: boolean
}

type Outputs = Array<{ address: string; value: number }>
