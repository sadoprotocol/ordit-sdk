import { Psbt } from "bitcoinjs-lib"
import reverseBuffer from "buffer-reverse"

import { decodePSBT, generateTxUniqueIdentifier, getScriptType, INSTANT_BUY_SELLER_INPUT_INDEX, Output } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { InjectableInput, InjectableOutput } from "../transactions/PSBTBuilder"
import { OrditSDKError } from "../utils/errors"
import InstantTradeBuilder, { InstantTradeBuilderArgOptions } from "./InstantTradeBuilder"

interface InstantTradeBuyerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  sellerPSBT: string
  receiveAddress?: string
  outputs?: Output[]
}

export default class InstantTradeBuyerTxBuilder extends InstantTradeBuilder {
  private receiveAddress?: string
  private sellerPSBT!: Psbt
  private sellerAddress?: string
  private incomingOutputs?: Output[]

  constructor({
    address,
    network,
    publicKey,
    receiveAddress,
    sellerPSBT,
    feeRate,
    datasource,
    outputs,
    chain = "bitcoin"
  }: InstantTradeBuyerTxBuilderArgOptions) {
    if (chain !== "bitcoin" && chain !== "fractal-bitcoin") {
      throw new OrditSDKError("Invalid chain supplied")
    }

    super({
      address,
      datasource,
      network,
      publicKey,
      feeRate,
      chain
    })

    this.receiveAddress = receiveAddress
    this.decodeSellerPSBT(sellerPSBT)
    this.incomingOutputs = outputs ?? []
    this.chain = chain
  }

  private decodeSellerPSBT(hex: string) {
    this.sellerPSBT = decodePSBT({ hex })
    this.inscriptionOutpoint = generateTxUniqueIdentifier(
      reverseBuffer(this.sellerPSBT.txInputs[0].hash).toString("hex"),
      this.sellerPSBT.txInputs[0].index
    )

    const [input] = this.sellerPSBT.data.inputs
    if (!input?.witnessUtxo) {
      throw new OrditSDKError("invalid seller psbt")
    }

    const _network = this.chain === "fractal-bitcoin" ? "mainnet" : this.network

    const data = getScriptType(input.witnessUtxo.script, _network)
    this.sellerAddress = data.payload && data.payload.address ? data.payload.address : undefined
    if (!this.sellerAddress) {
      throw new OrditSDKError("invalid seller psbt")
    }
  }

  private decodePrice() {
    const price = (this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[0].value - this.postage
    this.validatePrice(price)
    this.setPrice(price)
  }

  private decodeRoyalty() {
    const royaltyOutput = (this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[1]
    if (!royaltyOutput) return

    const _network = this.chain === "fractal-bitcoin" ? "mainnet" : this.network

    const scriptPayload = getScriptType(royaltyOutput.script, _network).payload
    const amount = royaltyOutput && royaltyOutput.value >= MINIMUM_AMOUNT_IN_SATS ? royaltyOutput.value : 0
    const receiver = scriptPayload ? scriptPayload.address : null

    royaltyOutput && receiver && this.setRoyalty({ amount, receiver, price: this.price + amount })
  }

  private bindRefundableOutput() {
    this.outputs = [
      {
        address: this.address,
        value: this.utxos.reduce((acc, curr, index) => (acc += [0, 1].includes(index) ? curr.sats : 0), 0)
      }
    ]
  }

  private bindInscriptionOutput() {
    this.outputs.push({
      address: this.receiveAddress || this.address,
      value: this.postage
    })
  }

  private bindIncomingOutputs() {
    if (!!this.incomingOutputs) {
      this.outputs = [...this.outputs, ...this.incomingOutputs]
    }
  }

  private mergePSBTs() {
    const hash = reverseBuffer(this.sellerPSBT.txInputs[0].hash).toString("hex")
    const index = this.sellerPSBT.txInputs[0].index
    this.injectableInputs = [
      {
        standardInput: {
          ...this.sellerPSBT.data.inputs[0],
          hash,
          index
        },
        txInput: (this.sellerPSBT.data.globalMap.unsignedTx as any).tx.ins[0],
        sats: this.sellerPSBT.data.inputs[0].witnessUtxo?.value,
        injectionIndex: INSTANT_BUY_SELLER_INPUT_INDEX
      }
    ] as InjectableInput[]

    // outputs
    this.injectableOutputs = this.sellerPSBT.data.outputs.map((standardOutput, index) => {
      return {
        standardOutput,
        txOutput: (this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[index],
        sats: (this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[index].value,
        injectionIndex: INSTANT_BUY_SELLER_INPUT_INDEX + index
      } as InjectableOutput
    })
  }

  private async findUTXOs() {
    const utxos = (
      await this.datasource.getUnspents({
        address: this.address,
        sort: "asc" // sort by ascending order to use low amount utxos as refundable utxos
      })
    ).spendableUTXOs.filter((utxo) => utxo.sats >= MINIMUM_AMOUNT_IN_SATS)

    // 3 = 2 refundables + (at least) 1 to cover for purchase
    if (utxos.length < 3) {
      throw new OrditSDKError("No suitable UTXOs found")
    }

    // bind minimum utxos. PSBTBuilder will add more if needed
    return utxos.slice(0, 2)
  }

  private async isEligible() {
    if (!this.inscriptionOutpoint) {
      throw new OrditSDKError("decode seller PSBT to check eligiblity")
    }

    const [utxos, [inscription]] = await Promise.all([
      this.findUTXOs(),
      this.datasource.getInscriptions({ outpoint: this.inscriptionOutpoint })
    ])
    if (!inscription) {
      throw new OrditSDKError("Inscription no longer available for trade")
    }
    const inscriptionUTXO = await this.datasource.getInscriptionUTXO({ id: inscription.id })
    this.postage = inscriptionUTXO.sats

    const sortedUTXOs = utxos.sort((a, b) => a.sats - b.sats)
    const [refundableUTXOOne, refundableUTXOTwo] = sortedUTXOs
    const refundables = [refundableUTXOOne, refundableUTXOTwo].reduce((acc, curr) => (acc += curr.sats), 0)
    const eligible = refundables >= MINIMUM_AMOUNT_IN_SATS * 2

    if (eligible) {
      this.utxos = utxos
    }

    return true
  }

  async build() {
    const eligible = await this.isEligible()
    if (!eligible) {
      throw new OrditSDKError("Not eligible")
    }

    this.decodePrice()
    this.decodeRoyalty()
    this.bindRefundableOutput()
    this.bindInscriptionOutput()
    this.bindIncomingOutputs()
    this.mergePSBTs()

    await this.prepare()
  }
}
