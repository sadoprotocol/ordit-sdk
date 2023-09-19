import { Psbt } from "bitcoinjs-lib"
import reverseBuffer from "buffer-reverse"

import {
  decodePSBT,
  generateTxUniqueIdentifier,
  getScriptType,
  INSTANT_BUY_SELLER_INPUT_INDEX,
  OrditApi,
  processInput
} from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { InjectableInput } from "../transactions/PSBTBuilder"
import { Output } from "../transactions/types"
import InstantTradeBuilder, { InstantTradeBuilderArgOptions } from "./InstantTradeBuilder"

interface InstantTradeBuyerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  feeRate: number
  sellerPSBT: string
  receiveAddress?: string
}

export default class InstantTradeBuyerTxBuilder extends InstantTradeBuilder {
  receiveAddress?: string
  sellerPSBT!: Psbt
  sellerAddress?: string

  constructor({
    address,
    network,
    publicKey,
    receiveAddress,
    sellerPSBT,
    feeRate
  }: InstantTradeBuyerTxBuilderArgOptions) {
    super({
      address,
      network,
      publicKey
    })

    this.feeRate = feeRate
    this.receiveAddress = receiveAddress
    this.decodeSellerPSBT(sellerPSBT)
  }

  private decodeSellerPSBT(hex: string) {
    this.sellerPSBT = decodePSBT({ hex })
    this.inscriptionOutpoint = generateTxUniqueIdentifier(
      reverseBuffer(this.sellerPSBT.txInputs[0].hash).toString("hex"),
      this.sellerPSBT.txInputs[0].index
    )

    const [input] = this.sellerPSBT.data.inputs
    if (!input?.witnessUtxo) {
      throw new Error("invalid seller psbt")
    }

    const data = getScriptType(input.witnessUtxo.script, this.network)
    this.sellerAddress = data.payload && data.payload.address ? data.payload.address : undefined
    if (!this.sellerAddress) {
      throw new Error("invalid seller psbt")
    }
  }

  private decodePrice() {
    this.validatePrice((this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[0].value - this.postage)
    this.setPrice((this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[0].value - this.postage)
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
        injectionIndex: INSTANT_BUY_SELLER_INPUT_INDEX
      }
    ] as unknown as InjectableInput[]
  }

  private async findUTXOs() {
    const utxos = (
      await OrditApi.fetchUnspentUTXOs({
        address: this.address,
        network: this.network,
        sort: "asc" // sort by ascending order to use low amount utxos as refundable utxos
      })
    ).spendableUTXOs.filter((utxo) => utxo.sats >= MINIMUM_AMOUNT_IN_SATS)

    // 3 = 2 refundables + (at least) 1 to cover for purchase
    if (utxos.length < 3) {
      throw new Error("No suitable UTXOs found")
    }

    // bind minimum utxos. PSBTBuilder will add more if needed
    return utxos.slice(0, 3)
  }

  async isEligible() {
    const [utxos] = await Promise.all([this.findUTXOs(), this.verifyAndFindInscriptionUTXO(this.sellerAddress)])
    const sortedUTXOs = utxos.sort((a, b) => a.sats - b.sats)
    const [refundableUTXOOne, refundableUTXOTwo, ...restUTXOs] = sortedUTXOs
    const refundables = [refundableUTXOOne, refundableUTXOTwo]
    const spendables = restUTXOs.reduce((acc, curr) => (acc += curr.sats), 0)
    const eligible = refundables.length === 2 && spendables > 0

    if (eligible) {
      this.utxos = utxos
    }

    return {
      eligible,
      refundables,
      spendables
    }
  }

  async build() {
    const { eligible } = await this.isEligible()
    if (!eligible) {
      throw new Error("Not eligible")
    }

    this.decodePrice()
    this.bindRefundableOutput()
    this.bindInscriptionOutput()
    this.mergePSBTs()

    await this.prepare()
  }

  async splitUTXOsForTrade(destinationAddress: string) {
    const { totalUTXOs, spendableUTXOs } = await OrditApi.fetchUnspentUTXOs({
      address: this.address,
      network: this.network
    })
    if (!totalUTXOs) {
      throw new Error("No UTXOs found")
    }

    const utxo = spendableUTXOs.sort((a, b) => b.sats - a.sats)[0] // Largest UTXO
    const input = await processInput({ utxo, pubKey: this.publicKey, network: this.network })
    const totalOutputs = 3
    const outputs: Output[] = []
    this.inputs = [input]

    for (let i = 0; i < totalOutputs; i++) {
      const usedAmount = outputs.reduce((acc, curr) => (acc += curr.value), 0)
      const remainingAmount = utxo.sats - usedAmount
      const amount = [0, 1].includes(i) ? MINIMUM_AMOUNT_IN_SATS : remainingAmount

      if (amount < MINIMUM_AMOUNT_IN_SATS) {
        throw new Error(
          `Not enough sats to generate ${totalOutputs} UTXOs with at least ${MINIMUM_AMOUNT_IN_SATS} sats per UTXO. Try decreasing the count or deposit more BTC`
        )
      }

      outputs.push({
        address: destinationAddress || this.address,
        value: amount
      })
    }

    await this.prepare()
  }
}
