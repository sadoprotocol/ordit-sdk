import { networks, Psbt } from "bitcoinjs-lib"

import { addressTypeToName, calculateTxFee, convertSatoshisToBTC, getAddressType, getNetwork, OrditApi } from ".."
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
  psbt: Psbt
  publicKey: string
  rbf = true
  utxos: UTXOLimited[] = []
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
    for (const [index, utxo] of this.utxos.entries()) {
      const input = await processInput({
        utxo,
        pubKey: this.publicKey,
        network: this.network
      }) // add sigHashType
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
    this.outputAmount =
      this.changeAmount < 0 ? this.changeAmount * -1 : this.outputs.reduce((acc, curr) => (acc += curr.cardinals), 0)

    this.validateOutputAmount()
  }

  private async calculateChangeAmount() {
    this.changeAmount = this.inputAmount - this.outputAmount - this.fee

    await this.addChangeOutput()
  }

  private async isNegativeChange() {
    const existingInputsCount = this.inputs.length

    if (this.changeAmount < 0) {
      this.outputAmount -= this.outputAmount + this.changeAmount
      const inputsCount = await this.prepare()

      if (existingInputsCount === inputsCount) {
        throw new Error(`Insufficient balance. Decrease the output amount by ${this.changeAmount * -1} sats`)
      }
    }
  }

  private calculateNetworkFee() {
    this.fee = calculateTxFee({
      totalInputs: this.inputs.length,
      totalOutputs: this.outputs.length,
      satsPerByte: this.feeRate,
      type: addressTypeToName[getAddressType(this.address, this.network)],
      additional: {
        witnessScripts: this.inputs
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          .map((input) => input?.witnessUtxo?.script!)
          .filter((script) => (script ? script : undefined))
      }
    })

    // console.log({ fee: this.fee }, this.inputs.length, this.outputs.length)

    return this.fee
  }

  private getReservedUTXOs() {
    return this.utxos.map((utxo) => `${utxo.txid}:${utxo.n}`)
  }

  private async retrieveUTXOs(amount: number) {
    const utxos = await OrditApi.fetchSpendables({
      address: this.address,
      value: convertSatoshisToBTC(amount),
      network: this.network,
      filter: this.getReservedUTXOs()
    })

    this.utxos.push(...utxos)
  }

  private async prepareInputs() {
    const promises = this.utxos.map((utxo) => {
      this.inputAmount += utxo.sats
      return processInput({
        utxo,
        pubKey: this.publicKey,
        network: this.network
      })
    })

    this.inputs = await Promise.all(promises)

    return this.inputs
  }

  async prepare() {
    // calculate output amount
    this.calculateOutputAmount()

    // fetch UTXOs to spend
    await this.retrieveUTXOs(this.outputAmount)
    await this.prepareInputs()

    // calculate network fee
    this.calculateNetworkFee()

    // calculate change amount
    await this.calculateChangeAmount()

    return this.inputs.length
  }
}
