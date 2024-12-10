/* eslint-disable @typescript-eslint/no-extra-semi */
import { networks, Psbt, Transaction } from "bitcoinjs-lib"

import {
  BaseDatasource,
  convertSatoshisToBTC,
  generateTxUniqueIdentifier,
  getNetwork,
  InputsToSign,
  INSTANT_BUY_SELLER_INPUT_INDEX,
  JsonRpcDatasource,
  toXOnly
} from ".."
import { Chain, Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import FeeEstimator from "../fee/FeeEstimator"
import { OrditSDKError } from "../utils/errors"
import { InputType, processInput } from "."
import { Output, UTXOLimited } from "./types"

export interface PSBTBuilderOptions {
  address: string
  changeAddress?: string
  feeRate: number
  network: Network
  outputs: Output[]
  inputs?: InputType[]
  publicKey: string
  autoAdjustment?: boolean
  instantTradeMode?: boolean
  datasource?: BaseDatasource
  chain?: Chain
}

export type InjectableInput = {
  injectionIndex: number
  txInput: any
  sats: number
  standardInput: InputType
}

export interface InjectableOutput {
  injectionIndex: number
  txOutput: any
  sats: number
  standardOutput: any
}

export class PSBTBuilder extends FeeEstimator {
  protected address: string
  protected changeAddress?: string
  protected changeAmount = 0
  protected datasource: BaseDatasource
  protected injectableInputs: InjectableInput[] = []
  protected injectableOutputs: InjectableOutput[] = []
  protected inputAmount = 0
  protected inputs: InputType[] = []
  protected outputAmount = 0
  protected outputs: Output[] = []
  protected psbt: Psbt
  protected publicKey: string
  protected rbf = true
  protected utxos: UTXOLimited[] = []
  protected usedUTXOs: string[] = []

  private autoAdjustment: boolean
  private instantTradeMode: boolean
  private nativeNetwork: networks.Network
  private noMoreUTXOS = false

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

  constructor({
    address,
    changeAddress,
    datasource,
    feeRate,
    network,
    publicKey,
    outputs,
    inputs,
    autoAdjustment = true,
    instantTradeMode = false,
    chain = "bitcoin"
  }: PSBTBuilderOptions) {
    super({
      feeRate,
      network,
      chain
    })
    this.chain = chain
    this.address = address
    this.changeAddress = changeAddress
    this.datasource = datasource || new JsonRpcDatasource({ chain: this.chain, network: this.network })
    this.outputs = outputs
    this.nativeNetwork = getNetwork(this.chain === "fractal-bitcoin" ? "mainnet" : network)
    this.publicKey = publicKey

    this.autoAdjustment = autoAdjustment
    this.instantTradeMode = instantTradeMode

    this.psbt = new Psbt({ network: this.nativeNetwork })
    this.inputs = inputs || []
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

  get xKey() {
    return toXOnly(Buffer.from(this.publicKey, "hex")).toString("hex")
  }

  get inputsToSign() {
    const instantTradeSellerFlow = this.instantTradeMode && !this.autoAdjustment
    return this.psbt.txInputs.reduce(
      (acc, _, index) => {
        if (!this.instantTradeMode || (this.instantTradeMode && index !== INSTANT_BUY_SELLER_INPUT_INDEX)) {
          acc.signingIndexes = acc.signingIndexes.concat(index)
        }

        if (instantTradeSellerFlow) {
          acc.sigHash = Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY
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
    this.psbt = new Psbt({ network: getNetwork(this.chain === "fractal-bitcoin" ? "mainnet" : this.network) }) // create new PSBT
    this.psbt.setMaximumFeeRate(this.feeRate)
  }

  protected getInputSequence() {
    return this.rbf ? 0xfffffffd : 0xffffffff
  }

  private injectInput(injectable: InjectableInput) {
    ;(this.psbt.data.globalMap.unsignedTx as any).tx.ins[injectable.injectionIndex] = injectable.txInput
    this.psbt.data.inputs[injectable.injectionIndex] = injectable.standardInput
  }

  private injectOutput(injectable: InjectableOutput) {
    let potentialIndex = injectable.injectionIndex

    do {
      const isReserved = !!(this.psbt.data.globalMap.unsignedTx as any).tx.outs[potentialIndex]
      if (!isReserved) {
        ;(this.psbt.data.globalMap.unsignedTx as any).tx.outs[potentialIndex] = injectable.txOutput
        this.psbt.data.outputs[potentialIndex] = injectable.standardOutput
        break
      }
    } while (potentialIndex++)
  }

  private addInputs() {
    const reservedIndexes = this.injectableInputs.map((input) => input.injectionIndex)

    const totalInputsLength = this.inputs.length + this.injectableInputs.length

    let inputIndex = 0
    for (let i = 0; i < totalInputsLength; i++) {
      // if current index is reserved => inject input
      if (reservedIndexes.includes(i)) {
        // insert injectable input
        const injectable = this.injectableInputs.find((o) => o.injectionIndex === i)!
        this.injectInput(injectable)
      } else {
        // else => insert next input
        const input = this.inputs[inputIndex]
        this.psbt.addInput(input)
        // set whether input is RBF or not
        this.psbt.setInputSequence(i, this.getInputSequence())
        inputIndex += 1
      }
    }
  }

  private validateOutputAmount() {
    if (this.outputAmount < MINIMUM_AMOUNT_IN_SATS) {
      throw new OrditSDKError(`Output amount too low. Minimum output amount needs to be ${MINIMUM_AMOUNT_IN_SATS} sats`)
    }
  }

  private addOutputs() {
    const reservedIndexes = this.injectableOutputs.map((o) => o.injectionIndex)

    const totalOutputLength = this.outputs.length + this.injectableOutputs.length

    let outputIndex = 0
    for (let i = 0; i < totalOutputLength; i++) {
      // if current index is reserved => inject output
      if (reservedIndexes.includes(i)) {
        // insert injectable output
        const injectable = this.injectableOutputs.find((o) => o.injectionIndex === i)!
        this.injectOutput(injectable)
      } else {
        // else => insert next output
        const output = this.outputs[outputIndex]
        this.psbt.addOutput({
          address: output.address,
          value: output.value
        })
        outputIndex += 1
      }
    }

    if (this.changeAmount >= MINIMUM_AMOUNT_IN_SATS) {
      this.psbt.addOutput({
        address: this.changeAddress || this.address,
        value: this.changeAmount
      })
    }
  }

  private calculateOutputAmount() {
    this.outputAmount = Math.floor(
      this.outputs.reduce((acc, curr) => (acc += curr.value), 0) +
        this.injectableOutputs.reduce((acc, curr) => (acc += curr.sats), 0)
    )

    this.validateOutputAmount()
  }

  private async calculateChangeAmount() {
    if (!this.autoAdjustment) return

    this.changeAmount = Math.floor(this.inputAmount - this.outputAmount - this.fee)

    await this.isNegativeChange()
  }

  private async isNegativeChange() {
    if (this.changeAmount >= 0) return

    await this.prepare()
    if (this.noMoreUTXOS) {
      throw new OrditSDKError(`Insufficient balance. Decrease the output amount by ${this.changeAmount * -1} sats`)
    }
  }

  private getRetrievedUTXOsValue() {
    return (
      this.utxos.reduce((acc, utxo) => (acc += utxo.sats), 0) +
      this.inputs.reduce((acc, curr) => (acc += curr.witnessUtxo?.value ?? 0), 0)
    )
  }

  private getReservedUTXOs() {
    return this.utxos.map((utxo) => generateTxUniqueIdentifier(utxo.txid, utxo.n))
  }

  private async retrieveUTXOs(address?: string, amount?: number) {
    if (!this.autoAdjustment && !address) return

    const retrievedUTXOsValue = this.getRetrievedUTXOsValue()

    const amountToRequest =
      amount && amount > 0
        ? amount
        : this.changeAmount < 0
          ? this.changeAmount * -1
          : this.outputAmount - retrievedUTXOsValue

    if ((amount && retrievedUTXOsValue >= amount) || amountToRequest <= 0) return

    const utxos = await this.datasource.getSpendables({
      address: address || this.address,
      value: convertSatoshisToBTC(amountToRequest),
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
    if (!this.autoAdjustment) return

    const promises: Promise<InputType>[] = []

    for (const utxo of this.utxos) {
      if (this.usedUTXOs.includes(generateTxUniqueIdentifier(utxo.txid, utxo.n))) continue

      this.inputAmount += utxo.sats
      const promise = processInput({
        utxo,
        pubKey: this.publicKey,
        network: this.network,
        datasource: this.datasource
      }) // TODO: add sigHashType

      promises.push(promise)
    }

    const response = await Promise.all(promises)

    this.inputAmount += this.injectableInputs.reduce((acc, curr) => (acc += curr.sats), 0)
    this.inputAmount += this.inputs.reduce((acc, curr) => (acc += curr.witnessUtxo?.value ?? 0), 0)
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
