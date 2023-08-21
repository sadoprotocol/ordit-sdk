import { networks, Psbt } from "bitcoinjs-lib"

import {
  addressTypeToName,
  calculateTxFee,
  convertSatoshisToBTC,
  generateTxUniqueIdentifier,
  getAddressType,
  getNetwork,
  OrditApi
} from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { InputType, processInput } from "."
import { Output, UTXOLimited } from "./types"

interface PSBTBuilderOptions {
  address: string
  feeRate: number
  network: Network
  outputs: Output[]
  publicKey: string
}

export class PSBTBuilder {
  private nativeNetwork: networks.Network

  address: string
  changeAmount = 0
  changeOutputIndex = -1
  fee = 0
  feeRate: number
  inputs: InputType[] = []
  inputAmount = 0
  outputs: Output[] = []
  outputAmount = 0
  network: Network
  noMoreUTXOS = false
  psbt: Psbt
  publicKey: string
  rbf = true
  utxos: UTXOLimited[] = []
  usedUTXOs: string[] = []
  witnessScripts: Buffer[] = []

  constructor({ address, feeRate, network, publicKey, outputs }: PSBTBuilderOptions) {
    this.address = address
    this.network = network
    this.outputs = outputs
    this.feeRate = feeRate
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
    for (const [index, input] of this.inputs.entries()) {
      this.psbt.addInput(input)
      this.psbt.setInputSequence(index, this.rbf ? 0xfffffffd : 0xffffffff)

      input.witnessUtxo?.script && this.witnessScripts.push(input.witnessUtxo.script)
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
      cardinals: this.changeAmount
    }
  }

  private async addChangeOutput() {
    await this.isNegativeChange()
    if (this.changeAmount < MINIMUM_AMOUNT_IN_SATS) return

    if (this.changeOutputIndex > -1) {
      return this.adjustChangeOutput()
    }

    this.outputs.push({
      address: this.address,
      cardinals: this.changeAmount
    })

    this.changeOutputIndex = this.outputs.length - 1

    this.calculateNetworkFee()
    this.calculateChangeAmount()
  }

  private calculateOutputAmount() {
    this.outputAmount = this.outputs.reduce((acc, curr) => (acc += curr.cardinals), 0)

    this.validateOutputAmount()
  }

  private async calculateChangeAmount() {
    this.changeAmount = this.inputAmount - this.outputAmount - this.fee

    await this.addChangeOutput()
  }

  private async isNegativeChange() {
    if (this.changeAmount > 0) return

    await this.prepare()
    if (this.noMoreUTXOS) {
      throw new Error(`Insufficient balance. Decrease the output amount by ${this.changeAmount * -1} sats`)
    }
  }

  private calculateNetworkFee() {
    this.fee = calculateTxFee({
      totalInputs: this.inputs.length,
      totalOutputs: this.outputs.length,
      satsPerByte: this.feeRate,
      type: addressTypeToName[getAddressType(this.address, this.network)],
      additional: {
        witnessScripts: this.witnessScripts
      }
    })

    return this.fee
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

      this.usedUTXOs.push(generateTxUniqueIdentifier(utxo.txid, utxo.n))

      promises.push(promise)
    }

    const response = await Promise.all(promises)
    for (const input of response) {
      if (this.usedUTXOs.includes(generateTxUniqueIdentifier(input.hash, input.index))) continue

      input.witnessUtxo?.script && this.witnessScripts.push(input.witnessUtxo.script)
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

    // calculate network fee
    this.calculateNetworkFee()

    // calculate change amount
    await this.calculateChangeAmount()

    this.calculateOutputAmount()
  }

  build() {
    this.addInputs()
    this.outputs.forEach((output) =>
      this.psbt.addOutput({
        address: output.address,
        value: output.cardinals
      })
    )

    this.psbt.setMaximumFeeRate(this.feeRate)

    return this
  }
}
