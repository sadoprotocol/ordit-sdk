import { networks, Psbt } from "bitcoinjs-lib"
import reverseBuffer from "buffer-reverse"

import { convertSatoshisToBTC, generateTxUniqueIdentifier, getNetwork, OrditApi } from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import FeeEstimator from "../fee/FeeEstimator"
import { InputType, processInput } from "."
import { Output, UTXOLimited } from "./types"

interface PSBTBuilderOptions {
  address: string
  changeAddress?: string
  feeRate: number
  network: Network
  outputs: Output[]
  publicKey: string
}

export class PSBTBuilder extends FeeEstimator {
  private nativeNetwork: networks.Network

  address: string
  changeAddress?: string
  changeAmount = 0
  changeOutputIndex = -1
  inputs: InputType[] = []
  inputAmount = 0
  outputs: Output[] = []
  network: Network
  noMoreUTXOS = false
  psbt: Psbt
  publicKey: string
  rbf = true
  utxos: UTXOLimited[] = []
  usedUTXOs: string[] = []

  constructor({ address, changeAddress, feeRate, network, publicKey, outputs }: PSBTBuilderOptions) {
    super({
      feeRate,
      network
    })
    this.address = address
    this.changeAddress = changeAddress
    this.network = network
    this.outputs = outputs
    this.nativeNetwork = getNetwork(network)
    this.publicKey = publicKey

    this.psbt = new Psbt({ network: this.nativeNetwork })
  }

  toHex() {
    return this.psbt.toHex()
  }

  toBase64() {
    return this.psbt.toBase64()
  }

  enableRBF() {
    this.rbf = true
    this.addInputs()
  }

  disableRBF() {
    this.rbf = false
    this.addInputs()
  }

  private async addInputs() {
    const existingInputHashes = this.psbt.txInputs.map((input) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const hash = reverseBuffer(input.hash) as Buffer

      return generateTxUniqueIdentifier(hash.toString("hex"), input.index)
    })

    for (const [index, input] of this.inputs.entries()) {
      if (existingInputHashes.includes(generateTxUniqueIdentifier(input.hash, input.index))) continue

      this.psbt.addInput(input)
      this.psbt.setInputSequence(index, this.rbf ? 0xfffffffd : 0xffffffff)
    }
  }

  private validateOutputAmount() {
    if (this.outputAmount < MINIMUM_AMOUNT_IN_SATS) {
      throw new Error(`Output amount too low. Minimum output amount needs to be ${MINIMUM_AMOUNT_IN_SATS} sats`)
    }
  }

  private adjustChangeOutput() {
    const changeOutput = this.outputs[this.changeOutputIndex]
    this.outputs[this.changeOutputIndex] = {
      ...changeOutput,
      value: this.changeAmount
    }
  }

  private removeOutputsByIndex(indexes: number[] = []) {
    this.outputs = this.outputs.filter((_, index) => !indexes.includes(index))
  }

  private async addChangeOutput() {
    await this.isNegativeChange()

    if (this.changeAmount < MINIMUM_AMOUNT_IN_SATS) {
      this.changeOutputIndex > -1 && this.removeOutputsByIndex([this.changeOutputIndex])
      return
    }

    if (this.changeOutputIndex > -1) {
      return this.adjustChangeOutput()
    }

    this.outputs.push({
      address: this.changeAddress || this.address,
      value: this.changeAmount
    })

    this.changeOutputIndex = this.outputs.length - 1

    this.calculateChangeAmount()
  }

  private calculateOutputAmount() {
    return this.outputAmount
  }

  protected get outputAmount() {
    const outputAmount = Math.floor(this.outputs.reduce((acc, curr) => (acc += curr.value), 0))
    this.validateOutputAmount()

    return outputAmount
  }

  private async calculateChangeAmount() {
    this.changeAmount = Math.floor(this.inputAmount - this.outputAmount - this.fee)
    await this.addChangeOutput()
  }

  private async isNegativeChange() {
    if (this.changeAmount >= 0) return

    await this.prepare()
    if (this.noMoreUTXOS) {
      throw new Error(`Insufficient balance. Decrease the output amount by ${this.changeAmount * -1} sats`)
    }
  }

  private getReservedUTXOs() {
    return this.utxos.map((utxo) => generateTxUniqueIdentifier(utxo.txid, utxo.n))
  }

  private async retrieveUTXOs() {
    const amount = this.changeAmount < 0 ? this.changeAmount * -1 : this.outputAmount
    const utxos = await OrditApi.fetchSpendables({
      address: this.address,
      value: convertSatoshisToBTC(amount),
      network: this.network,
      filter: this.getReservedUTXOs()
    })

    this.noMoreUTXOS = utxos.length === 0

    this.utxos.push(...utxos)
  }

  private async prepareInputs() {
    const promises: Promise<InputType>[] = []

    for (const utxo of this.utxos) {
      if (this.usedUTXOs.includes(generateTxUniqueIdentifier(utxo.txid, utxo.n))) continue

      this.inputAmount += utxo.sats
      const promise = processInput({
        utxo,
        pubKey: this.publicKey,
        network: this.network
      }) // TODO: add sigHashType

      promises.push(promise)
    }

    const response = await Promise.all(promises)
    for (const input of response) {
      if (this.usedUTXOs.includes(generateTxUniqueIdentifier(input.hash, input.index))) continue
      this.usedUTXOs.push(generateTxUniqueIdentifier(input.hash, input.index))
    }

    this.inputs = this.inputs.concat(response)

    return this.inputs
  }

  async prepare() {
    // calculate output amount
    this.calculateOutputAmount()

    // fetch UTXOs to spend
    await this.retrieveUTXOs()
    await this.prepareInputs()

    await this.calculateChangeAmount()

    await this.build()

    await this.calculateChangeAmount()
    this.calculateOutputAmount()

    await this.build()
  }

  private async build() {
    this.psbt = new Psbt({ network: getNetwork(this.network) }) // create tx from scratch

    this.addInputs()
    this.outputs.forEach((output) =>
      this.psbt.addOutput({
        address: output.address,
        value: output.value
      })
    )

    this.psbt.setMaximumFeeRate(this.feeRate)
    this.calculateNetworkFee()

    return this
  }
}
