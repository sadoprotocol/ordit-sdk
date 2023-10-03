import { Psbt } from "bitcoinjs-lib"

import { AddressFormats } from "~/addresses"
import { Network } from "~/config/types"
import { MAXIMUM_FEE } from "~/constants"
import { getNetwork, getScriptType } from "~/utils"

import { FeeEstimatorOptions } from "./types"

export class FeeEstimator {
  protected fee = 0
  protected feeRate: number
  protected network: Network
  protected psbt: Psbt
  protected witness?: Buffer[] = []
  protected virtualSize = 0
  protected weight = 0

  constructor({ feeRate, network, psbt, witness }: FeeEstimatorOptions) {
    if (feeRate < 0 || !Number.isSafeInteger(feeRate)) {
      throw new Error("Invalid feeRate")
    }

    this.feeRate = +feeRate // convert decimal to whole number that might have passed Number.isSafeInteger check due to precision loss
    this.network = network
    this.witness = witness || []
    this.psbt = psbt || new Psbt({ network: getNetwork(this.network) })
  }

  get data() {
    return {
      fee: this.fee,
      virtualSize: this.virtualSize,
      weight: this.weight
    }
  }

  private sanityCheckFee() {
    if (this.fee > MAXIMUM_FEE) {
      throw new Error("Error while calculating fees")
    }
  }

  calculateNetworkFee(): number {
    this.fee = this.calculateVirtualSize() * this.feeRate
    this.sanityCheckFee()

    return this.fee
  }

  private analyzePSBTComponents() {
    const inputs = this.psbt.data.inputs
    const outputs = this.psbt.txOutputs
    const inputTypes: AddressFormats[] = []
    const outputTypes: AddressFormats[] = []

    if (inputs.length === 0) {
      throw new Error("PSBT must have at least one input")
    }

    if (outputs.length === 0) {
      throw new Error("PSBT must have at least one output")
    }

    inputs.forEach((input) => {
      const script = input.witnessUtxo && input.witnessUtxo.script ? input.witnessUtxo.script : null

      if (!script) {
        throw new Error("Invalid script")
      }

      inputTypes.push(getScriptType(script, this.network).format)
    })

    outputs.forEach((output) => {
      outputTypes.push(getScriptType(output.script, this.network).format)
    })

    return {
      inputTypes,
      outputTypes
    }
  }

  private calculateScriptWitnessSize() {
    return this.analyzePSBTComponents().inputTypes.includes("taproot") && this.witness?.length
      ? this.witness.reduce((acc, witness) => (acc += witness.byteLength), 0) || 0
      : 0
  }

  private getBaseSize() {
    const { inputTypes, outputTypes } = this.analyzePSBTComponents()
    const witnessHeaderSize = 2
    const inputVBytes = inputTypes.reduce(
      (acc, inputType) => {
        const { input, txHeader, witness } = this.getBaseSizeByType(inputType)
        acc.txHeader = txHeader
        acc.input += input
        acc.witness += witness

        return acc
      },
      {
        input: 0,
        witness: 0,
        txHeader: 0
      }
    )
    const outputVBytes = outputTypes.reduce((acc, outputType) => {
      const { output } = this.getBaseSizeByType(outputType)
      acc += output

      return acc
    }, 0)
    const witnessSize = inputVBytes.witness + (this.witness?.length ? this.calculateScriptWitnessSize() : 0)

    return {
      baseSize: inputVBytes.input + inputVBytes.txHeader + outputVBytes,
      witnessSize: this.witness?.length ? witnessSize : witnessSize > 0 ? witnessHeaderSize + witnessSize : 0
    }
  }

  private calculateVirtualSize() {
    const { baseSize, witnessSize } = this.getBaseSize()
    this.weight = baseSize * 3 + (baseSize + witnessSize)
    this.virtualSize = Math.ceil(this.weight / 4)

    return this.virtualSize
  }

  private getBaseSizeByType(type: AddressFormats) {
    switch (type) {
      case "taproot":
        return { input: 41.5, output: 43, txHeader: 10.5, witness: 66 } // witness size is different for non-default sigHash

      case "segwit":
        return { input: 41, output: 31, txHeader: 10.5, witness: 105 }

      case "nested-segwit":
        return { input: 64, output: 32, txHeader: 10, witness: 105 }

      case "legacy":
        return { input: 148, output: 34, txHeader: 10, witness: 0 }

      default:
        throw new Error("Invalid type")
    }
  }
}
