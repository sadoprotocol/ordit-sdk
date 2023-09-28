import { processInput, PSBTBuilder } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { UTXOManagerOptions } from "./types"

export default class UTXOManager extends PSBTBuilder {
  constructor({ address, publicKey, network, feeRate, datasource }: UTXOManagerOptions) {
    super({
      address,
      publicKey,
      network,
      datasource,
      feeRate,
      outputs: []
    })
  }

  async splitUTXOForInstantTrade(destinationAddress: string) {
    const { totalUTXOs, spendableUTXOs } = await this.datasource.getUnspents({
      address: this.address
    })
    if (!totalUTXOs) {
      throw new Error("No UTXOs found")
    }

    const utxo = spendableUTXOs.sort((a, b) => b.sats - a.sats)[0] // Largest UTXO
    const input = await processInput({
      utxo,
      pubKey: this.publicKey,
      network: this.network,
      datasource: this.datasource
    })
    const totalOutputs = 2
    this.inputs = [input]

    for (let i = 0; i < totalOutputs; i++) {
      const usedAmount = this.outputs.reduce((acc, curr) => (acc += curr.value), 0)
      const remainingAmount = utxo.sats - usedAmount
      const amount = remainingAmount - MINIMUM_AMOUNT_IN_SATS
      if (amount < MINIMUM_AMOUNT_IN_SATS) {
        throw new Error(
          `Not enough sats to generate ${totalOutputs} UTXOs with at least ${MINIMUM_AMOUNT_IN_SATS} sats per UTXO. Try decreasing the count or deposit more BTC`
        )
      }

      this.outputs.push({
        address: destinationAddress || this.address,
        value: MINIMUM_AMOUNT_IN_SATS
      })
    }

    await this.prepare()
  }
}
