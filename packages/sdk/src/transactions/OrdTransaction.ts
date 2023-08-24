import * as ecc from "@bitcoinerlab/secp256k1"
import * as bitcoin from "bitcoinjs-lib"
import { Tapleaf } from "bitcoinjs-lib/src/types"

import {
  buildWitnessScript,
  calculateTxFee,
  convertSatoshisToBTC,
  createTransaction,
  encodeObject,
  getAddressesFromPublicKey,
  getNetwork,
  GetWalletOptions,
  OnOffUnion,
  OrditApi
} from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { NestedObject } from "../utils/types"

bitcoin.initEccLib(ecc)

export class OrdTransaction {
  publicKey: string
  feeRate: number
  postage: number
  mediaType: string
  mediaContent: string
  destinationAddress: string
  changeAddress: string
  meta?: NestedObject
  network: Network
  psbt: bitcoin.Psbt | null = null
  ready = false
  #xKey: string
  #feeForWitnessData: number | null = null
  #commitAddress: string | null = null
  #inscribePayTx: ReturnType<typeof createTransaction> | null = null
  #suitableUnspent: any = null
  #recovery = false
  #outs: Outputs = []
  #safeMode: OnOffUnion
  #encodeMetadata: boolean
  #enableRBF: boolean

  constructor({
    feeRate = 10,
    postage = 10000,
    mediaType = "text/plain;charset=utf-8",
    network = "testnet",
    publicKey,
    outs = [],
    encodeMetadata = false,
    enableRBF = true,
    ...otherOptions
  }: OrdTransactionOptions) {
    if (!publicKey || !otherOptions.changeAddress || !otherOptions.destination || !otherOptions.mediaContent) {
      throw new Error("Invalid options provided.")
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
    this.#outs = outs
    this.#safeMode = !otherOptions.safeMode ? "on" : otherOptions.safeMode
    this.#encodeMetadata = encodeMetadata
    this.#enableRBF = enableRBF

    const xKey = getAddressesFromPublicKey(publicKey, network, "p2tr")[0].xkey

    if (!xKey) {
      throw new Error("Failed to derive xKey from the provided public key.")
    }

    this.#xKey = xKey
  }

  get outs() {
    return this.#outs
  }

  build() {
    if (!this.#suitableUnspent || !this.#inscribePayTx) {
      throw new Error("Failed to build PSBT. Transaction not ready.")
    }

    let fees = this.#feeForWitnessData!

    if (this.#recovery) {
      fees = calculateTxFee({
        totalInputs: 1,
        totalOutputs: 1, // change output
        satsPerByte: this.feeRate,
        type: "taproot" // hardcoding because recovery is only supported by Taproot txs
      })
    }

    const customOutsAmount = this.#outs.reduce((acc, cur) => {
      return acc + cur.value
    }, 0)
    const change = this.#suitableUnspent.sats - fees - customOutsAmount - this.postage

    const networkObj = getNetwork(this.network)

    const psbt = new bitcoin.Psbt({ network: networkObj })

    psbt.addInput({
      sequence: this.#enableRBF ? 0xfffffffd : 0xffffffff,
      hash: this.#suitableUnspent.txid,
      index: parseInt(this.#suitableUnspent.n),
      tapInternalKey: Buffer.from(this.#xKey, "hex"),
      witnessUtxo: {
        script: this.#inscribePayTx.output!,
        value: parseInt(this.#suitableUnspent.sats)
      },
      tapLeafScript: [
        {
          leafVersion: this.#inscribePayTx.redeemVersion!,
          script: this.#inscribePayTx.redeem!.output!,
          controlBlock: this.#inscribePayTx.witness![this.#inscribePayTx.witness!.length - 1]
        }
      ]
    })

    if (!this.#recovery) {
      psbt.addOutput({
        address: this.destinationAddress,
        value: this.postage
      })

      this.#outs.forEach((out) => {
        psbt.addOutput(out)
      })
    }

    if (change > MINIMUM_AMOUNT_IN_SATS) {
      let changeAddress = this.#inscribePayTx.address
      if (this.changeAddress) {
        changeAddress = this.changeAddress
      }

      psbt.addOutput({
        address: changeAddress!,
        value: change
      })
    }

    this.psbt = psbt
  }

  toPsbt() {
    if (!this.psbt) {
      throw new Error("No PSBT found. Please build first.")
    }

    return this.psbt
  }

  toHex() {
    if (!this.psbt) {
      throw new Error("No PSBT found. Please build first.")
    }

    return this.psbt.toHex()
  }

  toBase64() {
    if (!this.psbt) {
      throw new Error("No PSBT found. Please build first.")
    }

    return this.psbt.toBase64()
  }

  generateCommit() {
    const witnessScript = buildWitnessScript({
      mediaContent: this.mediaContent,
      mediaType: this.mediaType,
      meta: this.meta && this.#encodeMetadata ? encodeObject(this.meta) : this.meta,
      xkey: this.#xKey
    })
    const recoverScript = buildWitnessScript({
      mediaContent: this.mediaContent,
      mediaType: this.mediaType,
      meta: this.meta && this.#encodeMetadata ? encodeObject(this.meta) : this.meta,
      xkey: this.#xKey,
      recover: true
    })

    if (!witnessScript || !recoverScript) {
      throw new Error("Failed to build createRevealPsbt")
    }

    const scriptTree: [Tapleaf, Tapleaf] = [
      {
        output: witnessScript
      },
      {
        output: recoverScript
      }
    ]

    const redeemScript = {
      output: witnessScript,
      redeemVersion: 192
    }

    const inscribePayTx = createTransaction(Buffer.from(this.#xKey, "hex"), "p2tr", this.network, {
      scriptTree: scriptTree,
      redeem: redeemScript
    })

    // inscription tx always have 1 input and 1 output
    const fees = calculateTxFee({
      totalInputs: 1,
      totalOutputs: 1,
      satsPerByte: this.feeRate,
      type: "taproot", // hardcoding because this process is only supported by Taproot txs
      additional: { witnessScripts: inscribePayTx.witness }
    })

    const customOutsAmount = this.#outs.reduce((acc, cur) => {
      return acc + cur.value
    }, 0)

    this.#feeForWitnessData = fees
    this.#commitAddress = inscribePayTx.address!
    this.#inscribePayTx = inscribePayTx

    return {
      address: inscribePayTx.address!,
      revealFee: this.postage + fees + customOutsAmount
    }
  }

  recover() {
    if (!this.#inscribePayTx || !this.ready) {
      throw new Error("Transaction not ready.")
    }

    const witnessScript = buildWitnessScript({
      mediaContent: this.mediaContent,
      mediaType: this.mediaType,
      meta: this.meta && this.#encodeMetadata ? encodeObject(this.meta) : this.meta,
      xkey: this.#xKey
    })
    const recoverScript = buildWitnessScript({
      mediaContent: this.mediaContent,
      mediaType: this.mediaType,
      meta: this.meta && this.#encodeMetadata ? encodeObject(this.meta) : this.meta,
      xkey: this.#xKey,
      recover: true
    })

    if (!witnessScript || !recoverScript) {
      throw new Error("Failed to build createRevealPsbt")
    }

    const scriptTree: [Tapleaf, Tapleaf] = [
      {
        output: witnessScript
      },
      {
        output: recoverScript
      }
    ]

    const redeemScript = {
      output: recoverScript,
      redeemVersion: 192
    }

    const inscribePayTx = createTransaction(Buffer.from(this.#xKey, "hex"), "p2tr", this.network, {
      scriptTree: scriptTree,
      redeem: redeemScript
    })

    this.#inscribePayTx = inscribePayTx
    this.#recovery = true
  }

  async isReady() {
    if (!this.#commitAddress || !this.#feeForWitnessData) {
      throw new Error("No commit address found. Please generate a commit address.")
    }

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
    if (!this.#commitAddress || !this.#feeForWitnessData) {
      throw new Error("No commit address found. Please generate a commit address.")
    }

    const outAmount = this.#outs.reduce((acc, cur) => (acc += cur.value), 0)
    const amount = this.postage + this.#feeForWitnessData! + outAmount

    const utxos = await OrditApi.fetchSpendables({
      address: this.#commitAddress,
      value: convertSatoshisToBTC(amount),
      network: this.network,
      type: this.#safeMode === "on" ? "spendable" : "all"
    })

    const suitableUTXO = utxos.find((utxo) => utxo.sats >= amount)
    if (!suitableUTXO) {
      throw new Error("No suitable unspent found for reveal.")
    }

    this.#suitableUnspent = suitableUTXO
    this.ready = true

    return suitableUTXO
  }
}

export type OrdTransactionOptions = Pick<GetWalletOptions, "safeMode"> & {
  feeRate?: number
  postage?: number
  mediaType?: string
  mediaContent: string
  destination: string
  changeAddress: string
  meta?: NestedObject
  network?: Network
  publicKey: string
  outs?: Outputs
  encodeMetadata?: boolean
  enableRBF?: boolean
}

type Outputs = Array<{ address: string; value: number }>
