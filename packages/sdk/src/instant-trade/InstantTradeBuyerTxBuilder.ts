import { Psbt } from "bitcoinjs-lib"

import { decodePSBT, INSTANT_BUY_SELLER_INPUT_INDEX, OrditApi, processInput } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { Output } from "../transactions/types"
import { InstantTradeBuilder, InstantTradeBuilderArgOptions } from "./InstantTradeBuilder"

interface InstantTradeBuyerTxBuilderArgOptions extends InstantTradeBuilderArgOptions {
  sellerPSBT: string
  receiveAddress?: string
}

export default class InstantTradeBuyerTxBuilder extends InstantTradeBuilder {
  receiveAddress?: string
  sellerPSBT!: Psbt

  constructor({
    address,
    network,
    publicKey,
    inscriptionOutpoint,
    receiveAddress,
    sellerPSBT
  }: InstantTradeBuyerTxBuilderArgOptions) {
    super({
      address,
      network,
      publicKey,
      inscriptionOutpoint
    })

    this.receiveAddress = receiveAddress
    this.decodeSellerPSBT(sellerPSBT)
  }

  private decodeSellerPSBT(hex: string) {
    this.sellerPSBT = decodePSBT({ hex })
    this.validatePrice((this.sellerPSBT.data.globalMap.unsignedTx as any).tx.outs[0].value - this.postage)
  }

  private async generateBuyerInputs() {
    this.inputs = await Promise.all(
      this.utxos.map((utxo) => processInput({ utxo, pubKey: this.publicKey, network: this.network }))
    )
  }

  private bindBuyerOwnedRefundableUTXOs() {
    for (let i = 0; i < 2; i++) {
      this.psbt.addInput(this.inputs[i])
    }
  }

  private bindRefundableOutput() {
    this.outputs = [
      {
        address: this.address,
        value: this.utxos.reduce((acc, curr, index) => (acc += [0, 1].includes(index) ? curr.sats : 0), 0)
      }
    ]
  }

  private bindStandardUTXOs() {
    this.utxos.forEach((utxo, index) => {
      if (index <= 2) return

      this.psbt.addInput(this.inputs[index])
    })
  }

  private bindInscriptionOutput() {
    this.outputs.push({
      address: this.receiveAddress || this.address,
      value: this.postage
    })
  }

  private mergePSBTs() {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;(this.psbt.data.globalMap.unsignedTx as any).tx.ins[INSTANT_BUY_SELLER_INPUT_INDEX] = (
      this.sellerPSBT.data.globalMap.unsignedTx as any
    ).tx.ins[0]
    this.psbt.data.inputs[INSTANT_BUY_SELLER_INPUT_INDEX] = this.sellerPSBT.data.inputs[0]

    // outputs
    ;(this.psbt.data.globalMap.unsignedTx as any).tx.outs[INSTANT_BUY_SELLER_INPUT_INDEX] = (
      this.sellerPSBT.data.globalMap.unsignedTx as any
    ).tx.outs[0]
    this.psbt.data.outputs[INSTANT_BUY_SELLER_INPUT_INDEX] = this.sellerPSBT.data.outputs[0]
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

    return utxos
  }

  async isEligible() {
    const [utxos] = await Promise.all([this.findUTXOs(), this.verifyAndFindInscriptionUTXO()])
    const sortedUTXOs = utxos.sort((a, b) => a.sats - b.sats)
    const [refundableUTXOOne, refundableUTXOTwo, ...restUTXOs] = sortedUTXOs
    const refundables = [refundableUTXOOne, refundableUTXOTwo]
    const spendables = restUTXOs.reduce((acc, curr) => (acc += curr.sats), 0)
    const eligible = refundables.length === 2 && spendables > 0

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

    await this.generateBuyerInputs()
    this.bindBuyerOwnedRefundableUTXOs()
    this.bindRefundableOutput()
    this.bindInscriptionOutput()
    this.mergePSBTs()
    this.bindStandardUTXOs()

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
