import { networks, Psbt } from "bitcoinjs-lib"
import reverseBuffer from "buffer-reverse"

import {
  convertSatoshisToBTC,
  generateTxUniqueIdentifier,
  getNetwork,
  InputsToSign,
  INSTANT_BUY_SELLER_INPUT_INDEX,
  OrditApi
} from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import FeeEstimator from "../fee/FeeEstimator"
import { InputType, processInput } from "."
import { Output, UTXOLimited } from "./types"

export interface PSBTBuilderOptions {
  address: string
  changeAddress?: string
  feeRate: number
  network: Network
  outputs: Output[]
  publicKey: string
  inscriberMode?: boolean
  instantTradeMode?: boolean
}

export type InjectableInput = {
  injectionIndex: number
  txInput: any
  standardInput: InputType
}

export interface InjectableOutput {
  injectionIndex: number
  txOutput: any
  sats: number
  standardOutput: any
}

export class PSBTBuilder extends FeeEstimator {
  private nativeNetwork: networks.Network
  private inscriberMode: boolean
  private instantTradeMode: boolean

  address: string
  changeAddress?: string
  changeAmount = 0
  changeOutputIndex = -1
  inputs: InputType[] = []
  injectableInputs: InjectableInput[] = []
  injectableOutputs: InjectableOutput[] = []
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

  constructor({
    address,
    changeAddress,
    feeRate,
    network,
    publicKey,
    outputs,
    inscriberMode = false,
    instantTradeMode = false
  }: PSBTBuilderOptions) {
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
    this.inscriberMode = inscriberMode
    this.instantTradeMode = instantTradeMode

    this.psbt = new Psbt({ network: this.nativeNetwork })
  }

  toPSBT() {
    return this.psbt
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

  get inputsToSign() {
    return this.psbt.txInputs.reduce(
      (acc, _, index) => {
        if (!this.instantTradeMode || (this.instantTradeMode && index !== INSTANT_BUY_SELLER_INPUT_INDEX)) {
          acc.signingIndexes = acc.signingIndexes.concat(index)
        }

        return acc
      },
      {
        address: this.address,
        signingIndexes: []
      } as InputsToSign
    )
  }

  protected initPSBT() {
    this.psbt = new Psbt({ network: getNetwork(this.network) }) // create new PSBT
    this.psbt.setMaximumFeeRate(this.feeRate)
  }

  protected getInputSequence() {
    return this.rbf ? 0xfffffffd : 0xffffffff
  }

  private injectOutput(injectable: InjectableOutput) {
    // TODO: add type
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;(this.psbt.data.globalMap.unsignedTx as any).tx.outs[injectable.injectionIndex] = injectable.txOutput
    this.psbt.data.outputs[injectable.injectionIndex] = injectable.standardOutput
  }

  private async addInputs() {
    const reservedIndexes = this.injectableInputs.map((input) => input.injectionIndex)

    for (let i = 0; i < this.inputs.length; i++) {
      const existingInputHashes = this.psbt.txInputs.map((input) => {
        const hash = reverseBuffer(input.hash) as Buffer

        return generateTxUniqueIdentifier(hash.toString("hex"), input.index)
      })

      const input = this.inputs[i]
      if (existingInputHashes.includes(generateTxUniqueIdentifier(input.hash, input.index))) continue

      this.psbt.addInput(input)
      this.psbt.setInputSequence(reservedIndexes.includes(i) ? i - 1 : i, this.getInputSequence())
    }

    this.injectableInputs.forEach((injectableInput) => {
      // eslint-disable-next-line @typescript-eslint/no-extra-semi
      ;(this.psbt.data.globalMap.unsignedTx as any).tx.ins[injectableInput.injectionIndex] = injectableInput.txInput
      this.psbt.data.inputs[injectableInput.injectionIndex] = injectableInput.standardInput
    })
  }

  private validateOutputAmount() {
    if (this.outputAmount < MINIMUM_AMOUNT_IN_SATS) {
      throw new Error(`Output amount too low. Minimum output amount needs to be ${MINIMUM_AMOUNT_IN_SATS} sats`)
    }
  }

  private addOutputs() {
    const reservedIndexes = this.injectableOutputs.map((o) => o.injectionIndex)
    const injectedIndexes: number[] = []

    this.outputs.forEach((output, index) => {
      if (reservedIndexes.includes(index)) {
        const injectable = this.injectableOutputs.find((o) => o.injectionIndex === index)!
        this.injectOutput(injectable)
        injectedIndexes.push(injectable.injectionIndex)
      }

      this.psbt.addOutput({
        address: output.address,
        value: output.value
      })
    })

    this.injectableOutputs.forEach((injectable) => {
      if (injectedIndexes.includes(injectable.injectionIndex)) return
      this.injectOutput(injectable)
    })
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

  private removeChangeOutput() {
    this.changeOutputIndex > -1 && this.removeOutputsByIndex([this.changeOutputIndex])
    this.changeOutputIndex = -1
  }

  protected async addChangeOutput() {
    await this.isNegativeChange()

    if (this.changeAmount < MINIMUM_AMOUNT_IN_SATS) {
      this.removeChangeOutput()
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
    this.outputAmount = Math.floor(this.outputs.reduce((acc, curr) => (acc += curr.value), 0))

    this.validateOutputAmount()
  }

  private async calculateChangeAmount() {
    if (this.inscriberMode || this.instantTradeMode) return

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

  private async retrieveUTXOs(address?: string, amount?: number) {
    if ((this.inscriberMode && !address) || this.instantTradeMode) return

    amount = amount && amount > 0 ? amount : this.changeAmount < 0 ? this.changeAmount * -1 : this.outputAmount

    const utxos = await OrditApi.fetchSpendables({
      address: address || this.address,
      value: convertSatoshisToBTC(amount),
      network: this.network,
      filter: this.getReservedUTXOs()
    })

    this.noMoreUTXOS = utxos.length === 0

    this.utxos.push(...utxos)
  }

  protected async retrieveSelectedUTXOs(address: string, amount: number) {
    await this.retrieveUTXOs(address, amount)
    const selectedUTXOs = this.utxos.find((utxo) => utxo.sats >= amount)
    this.utxos = selectedUTXOs ? [selectedUTXOs] : []

    return this.utxos
  }

  private async prepareInputs() {
    if (this.inscriberMode || this.instantTradeMode) return

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

    await this.process()

    await this.calculateChangeAmount()
    this.calculateOutputAmount()

    await this.process()
  }

  private async process() {
    this.initPSBT()

    this.addInputs()
    this.addOutputs()

    this.calculateNetworkFee()

    return this
  }
}
