import { AddressType, getAddressInfo } from "bitcoin-address-validation"
import coinSelect from "bitcoinselect"

import { processInput, PSBTBuilder } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { UTXOManagerOptions } from "./types"

export default class UTXOManager extends PSBTBuilder {
  constructor({ address, publicKey, network, feeRate, datasource, chain = "bitcoin" }: UTXOManagerOptions) {
    if (chain !== "bitcoin" && chain !== "fractal-bitcoin") {
      throw new OrditSDKError("Invalid chain supplied")
    }

    super({
      address,
      publicKey,
      network,
      datasource,
      feeRate,
      outputs: [],
      chain,
      autoAdjustment: false // we don't want to auto adjust the outputs -> change is accounted for by coinSelect
    })
  }

  async splitUTXOIntoRefundable({ n, destinationAddress }: { n: number; destinationAddress?: string }) {
    const { totalUTXOs, spendableUTXOs } = await this.datasource.getUnspents({
      address: this.address,
      rarity: ["common", "uncommon"],
      type: "spendable",
      sort: "desc"
    })
    if (!totalUTXOs) {
      throw new OrditSDKError("No UTXOs found")
    }

    const coinSelectUTXOs = await Promise.all(
      spendableUTXOs.map(async (utxo) => {
        const input = await processInput({
          utxo,
          pubKey: this.publicKey,
          network: this.chain === "fractal-bitcoin" ? "mainnet" : this.network,
          datasource: this.datasource
        })
        return {
          ...input,
          txid: utxo.txid,
          vout: utxo.n,
          value: utxo.sats,
          isTaproot: getAddressInfo(utxo.scriptPubKey.address).type === AddressType.p2tr
        }
      })
    )

    // create array of n refundable UTXOs
    const refundableUTXOsOutput = new Array(n).fill({}).map(() => ({
      address: destinationAddress ?? this.address,
      value: MINIMUM_AMOUNT_IN_SATS
    }))

    const res = coinSelect(coinSelectUTXOs, refundableUTXOsOutput, this.feeRate)

    if (!res) {
      throw new OrditSDKError("Not enough sats to generate refundable UTXOs")
    }
    if (!res.inputs || res.inputs?.length === 0) {
      throw new OrditSDKError("Not enough sats to generate refundable UTXOs")
    }
    if (!res.outputs || res.outputs?.length === 0) {
      throw new OrditSDKError("Not enough sats to generate refundable UTXOs")
    }

    this.inputs = await Promise.all(
      res.inputs.map((input) => {
        const spendableUTXOSelected = spendableUTXOs.find((utxo) => utxo.txid === input.txid && utxo.n === input.vout)
        if (!spendableUTXOSelected) {
          throw new OrditSDKError("UTXO not found")
        }
        return processInput({
          utxo: spendableUTXOSelected,
          pubKey: this.publicKey,
          network: this.network,
          datasource: this.datasource
        })
      })
    )

    this.outputs = res.outputs.map((output) => {
      return {
        address: output.address ?? this.changeAddress ?? this.address, // address will be empty if it's a change output
        value: output.value!
      }
    })

    await this.prepare()
  }
}
