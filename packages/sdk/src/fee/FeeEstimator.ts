import { Psbt } from "bitcoinjs-lib"

import { AddressFormats, getNetwork, getScriptType, isFloat } from ".."
import { Network } from "../config/types"
import { MAXIMUM_FEE } from "../constants"
import { FeeEstimatorOptions } from "./types"

export default class FeeEstimator {
  feeRate: number
  network: Network
  psbt!: Psbt
  witnesses?: Buffer[] = []
  fee = 0

  private virtualSize = 0
  private weight = 0

  constructor({ feeRate, network, psbt, witnesses }: FeeEstimatorOptions) {
    if (feeRate < 0 || isFloat(feeRate)) {
      throw new Error("Invalid feeRate")
    }

    this.feeRate = feeRate
    this.network = network
    this.witnesses = witnesses || []
    this.psbt = psbt || new Psbt({ network: getNetwork(this.network) })
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

      inputTypes.push(getScriptType(script, this.network))
    })

    outputs.forEach((output) => {
      outputTypes.push(getScriptType(output.script, this.network))
    })

    return {
      inputTypes,
      outputTypes
    }
  }

  private calculateScriptWitnessSize() {
    return this.analyzePSBTComponents().inputTypes.includes("taproot") && this.witnesses?.length
      ? this.witnesses.reduce((acc, witness) => (acc += witness.byteLength), 0) || 0
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
    const witnessSize = this.witnesses?.length ? this.calculateScriptWitnessSize() : inputVBytes.witness

    return {
      baseSize: inputVBytes.input + inputVBytes.txHeader + outputVBytes,
      witnessSize: this.witnesses?.length
        ? witnessSize
        : witnessSize > 0
        ? witnessHeaderSize + witnessSize * inputTypes.length
        : 0
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
        return { input: 41, output: 43, txHeader: 10, witness: 66 } // witness size is different for non-default sigHash

      case "segwit":
        return { input: 41, output: 31, txHeader: 10.5, witness: 105 }

      case "nested-segwit":
        return { input: 64, output: 32, txHeader: 10, witness: 105 }

      case "legacy":
        return { input: 149, output: 34, txHeader: 10, witness: 0 }

      default:
        throw new Error("Invalid type")
    }
  }
}
