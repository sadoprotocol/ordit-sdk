import { Psbt } from "bitcoinjs-lib"
import * as bitcoin from "bitcoinjs-lib"
import reverseBuffer from "buffer-reverse"

import { BaseDatasource, decodePSBT, getNetwork, getScriptType, Output, processInput } from ".."
import { Chain, Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { InjectableInput, InjectableOutput, PSBTBuilder } from "./PSBTBuilder"

interface DecodeInscriptionPSBTsResponse {
  inscriptionPsbts: Psbt[]
  inscriptionOutpoints: string[]
  inscriptionOutputs: Output[]
}

interface CreateInscriptionPSBTParams {
  inscriptionId: string
  sellerPublicKey: string
  sellerAddress: string
  receivePaymentAddress: string
  inscriptionPrice: number
  escrowPublicKey: string
  datasource: BaseDatasource
  network: Network
  chain: Chain
}

export class PreInscriber extends PSBTBuilder {
  private readonly receiveAddress: string
  private readonly inscriptionPsbts: Psbt[]
  private readonly inscriptionOutpoints: string[]
  private readonly extraOutputs?: Output[]

  private inscriptionOutputs: Output[] = []

  constructor({
    buyerAddress,
    datasource,
    feeRate,
    network,
    publicKey,
    inscriptionB64Psbts,
    extraOutputs,
    receiveAddress
  }: {
    buyerAddress: string
    datasource?: BaseDatasource
    feeRate: number
    network: any
    publicKey: any
    inscriptionB64Psbts: string[] // signed inscription psbt from the seller/creator
    extraOutputs?: Output[] // additional outputs to be included in the final transaction
    receiveAddress: string
  }) {
    super({
      address: buyerAddress,
      publicKey,
      datasource,
      feeRate,
      network,
      outputs: [],
      autoAdjustment: true,
      instantTradeMode: true
    })

    this.address = buyerAddress
    this.receiveAddress = receiveAddress
    this.extraOutputs = extraOutputs

    // decode all base64 inscription psbts
    const decodedPsbts = this.decodeInscriptionPSBTSs(inscriptionB64Psbts)
    this.inscriptionPsbts = decodedPsbts.inscriptionPsbts
    this.inscriptionOutpoints = decodedPsbts.inscriptionOutpoints
    this.inscriptionOutputs = decodedPsbts.inscriptionOutputs

    this.rbf = false
  }

  private decodeInscriptionPSBTSs(inscriptionB64Strings: string[]): DecodeInscriptionPSBTsResponse {
    const inscriptionPsbts = inscriptionB64Strings.map((b64) => decodePSBT({ base64: b64 }))
    const inscriptionOutpoints = inscriptionPsbts.map((psbt) => {
      return `${reverseBuffer(psbt.txInputs[0].hash).toString("hex")}:${psbt.txInputs[0].index}`
    })
    const inscriptionOutputs: Output[] = []

    // sanity checks
    inscriptionPsbts.forEach((psbt) => {
      const [input] = psbt.data.inputs

      if (!input.witnessUtxo) {
        throw new OrditSDKError("invalid seller psbt")
      }
      const data = getScriptType(input.witnessUtxo.script, this.network)
      const sellerAddress = data.payload && data.payload.address ? data.payload.address : undefined
      if (!sellerAddress) {
        throw new OrditSDKError("invalid seller address in psbt")
      }

      // add postage to the inscription outputs
      inscriptionOutputs.push({
        address: this.receiveAddress, // bind to receive address
        value: input.witnessUtxo.value
      })
    })

    return { inscriptionPsbts, inscriptionOutpoints, inscriptionOutputs }
  }

  private createInjectableInputsAndOutputs(inscriptionPsbts: Psbt[]) {
    const injectableInputs: InjectableInput[] = []
    const injectableOutputs: InjectableOutput[] = []

    // injection starts from 1 + number of inscriptions (1st output is for refundable utxos, 2nd onwards for inscriptions, then the psbts outputs)
    const injectionIndex = this.inscriptionPsbts.length + 1

    inscriptionPsbts.forEach((psbt, index) => {
      // add injectable input
      const hash = reverseBuffer(psbt.txInputs[0].hash).toString("hex")
      const inputIndex = psbt.txInputs[0].index
      injectableInputs.push({
        standardInput: {
          ...psbt.data.inputs[0], // assumption: only 1 inputs in each psbt
          hash,
          index: inputIndex
        },
        txInput: (psbt.data.globalMap.unsignedTx as any).tx.ins[0],
        sats: psbt.data.inputs[0].witnessUtxo!.value,
        injectionIndex: injectionIndex + index
      } as InjectableInput)

      // add injectable output
      injectableOutputs.push({
        standardOutput: psbt.data.outputs[0], // assumption: only 1 outputs in each psbt
        txOutput: (psbt.data.globalMap.unsignedTx as any).tx.outs[0],
        sats: (psbt.data.globalMap.unsignedTx as any).tx.outs[0].value,
        injectionIndex: injectionIndex + index
      })
    })

    return { injectableInputs, injectableOutputs }
  }

  async getRefundableUtxos(address: string, n = 2) {
    const utxos = (
      await this.datasource.getUnspents({
        address: address,
        type: "spendable",
        sort: "asc" // sort by ascending order to use low amount utxos as refundable utxos
      })
    ).spendableUTXOs.filter((utxo) => utxo.sats >= MINIMUM_AMOUNT_IN_SATS)

    // n refundables utxos
    if (utxos.length < n) {
      throw new OrditSDKError("Not enough refundable UTXOs found")
    }

    // add refundable utxos. PSBTBuilder will add more utxo to fund the txs
    return utxos.slice(0, n)
  }

  async validateInscriptions(inscriptionOutpoints: string[]) {
    // warn: might need to batch this call if there are many inscriptions
    await Promise.all(
      inscriptionOutpoints.map(async (outpoint) => {
        const res = await this.datasource.getInscriptions({ outpoint })
        if (res.length === 0) {
          throw new OrditSDKError(`Inscription no longer available for trade. Outpoint: ${outpoint}`)
        }
        return res
      })
    )

    return true
  }

  async build() {
    // check if inscriptions in seller psbt are valid
    await this.validateInscriptions(this.inscriptionOutpoints)

    // check if buyer has atleast (inscriptions + 1) refundable utxos (min sat utxo)
    // First inscription requires 2 refundable utxos, next inscription adds 1 more refundable utxo and so on
    const refundableUtxos = await this.getRefundableUtxos(this.address, this.inscriptionPsbts.length + 1)
    this.utxos = [...refundableUtxos]

    // ADD combined refundable utxo amount as 1st output
    this.outputs = [
      {
        address: this.address,
        value: refundableUtxos.reduce((acc, curr) => (acc += curr.sats), 0)
      }
    ]

    // ADD inscription output as 2nd output onwards
    this.inscriptionOutputs.forEach((output) => {
      this.outputs.push(output)
    })

    // ADD extra outputs if any
    if (this.extraOutputs) {
      this.outputs.push(...this.extraOutputs)
    }

    const injectables = this.createInjectableInputsAndOutputs(this.inscriptionPsbts)
    this.injectableInputs = injectables.injectableInputs
    this.injectableOutputs = injectables.injectableOutputs

    await this.prepare()
  }

  /**
   * Create a PSBT for the inscription, to be signed by the seller and used to create the final transaction
   * @param inscriptionId
   * @param sellerPublicKey
   * @param sellerAddress
   * @param receivePaymentAddress
   * @param inscriptionPrice
   * @param datasource
   * @param network
   * @param chain
   */
  static async createInscriptionPSBT({
    inscriptionId,
    sellerPublicKey,
    sellerAddress,
    receivePaymentAddress,
    inscriptionPrice,
    datasource,
    network,
    chain
  }: CreateInscriptionPSBTParams) {
    const inscriptionUtxo = await datasource.getInscriptionUTXO({
      id: inscriptionId
    })

    // validate inscriptionUtxo
    if (!inscriptionUtxo) {
      throw new OrditSDKError(`Inscription ${inscriptionId} not found`)
    }
    if (inscriptionUtxo.scriptPubKey.address !== sellerAddress) {
      throw new OrditSDKError(`Inscription ${inscriptionId} does not belong to seller`)
    }

    const input = await processInput({
      utxo: inscriptionUtxo,
      pubKey: sellerPublicKey,
      network: network,
      sighashType: bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY,
      datasource: datasource
    })

    // send payment to seller address
    const output = { address: receivePaymentAddress, value: inscriptionPrice }

    const psbt = new Psbt({ network: getNetwork(chain === "fractal-bitcoin" ? "mainnet" : network) })
    psbt.addInput(input)
    psbt.addOutput(output)

    return {
      hex: psbt.toHex(),
      base64: psbt.toBase64()
    }
  }
}
