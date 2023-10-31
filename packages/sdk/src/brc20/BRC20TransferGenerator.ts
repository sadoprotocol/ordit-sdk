import { BRC20TransferBase } from "./BRC20TransferBase"
import { BRC20TransferOptions, BRC20TransferPayloadAttributes } from "./types"

export class BRC20TransferGenerator extends BRC20TransferBase {
  constructor({
    address,
    pubKey,
    datasource,
    destinationAddress,
    feeRate,
    network,
    tick,
    amount
  }: BRC20TransferOptions) {
    super({ address, pubKey, datasource, destinationAddress, feeRate, network, tick, amount })
  }

  private async validateTransferOptions() {
    BRC20TransferBase.validateTransferOptions({
      amount: this.amount,
      tick: this.tick,
      datasource: this.datasource,
      network: this.network
    })

    this.generatePayload()
  }

  private generatePayload() {
    const payload: BRC20TransferPayloadAttributes = {
      p: "brc-20",
      op: "transfer",
      tick: this.tick,
      amt: this.amount.toString()
    }

    this.content = {
      content: JSON.stringify(payload),
      type: "text/plain;charset=utf-8"
    }
  }

  async reveal() {
    const isOverallBalanceSufficient = await BRC20TransferBase.hasEnoughOverallBalance({
      address: this.address,
      amount: this.amount,
      tick: this.tick,
      datasource: this.datasource,
      network: this.network
    })
    if (!isOverallBalanceSufficient) return

    await this.validateTransferOptions()

    // generate deposit address and fee for inscription
    const { address, revealFee: amount } = await this.generateCommit()

    return { address, amount }
  }

  async generate() {
    const isOverallBalanceSufficient = await BRC20TransferBase.hasEnoughOverallBalance({
      address: this.address,
      amount: this.amount,
      tick: this.tick,
      datasource: this.datasource,
      network: this.network
    })

    if (!isOverallBalanceSufficient) return

    await this.validateTransferOptions()
    await this.generateCommit()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }

  async recoverFunds() {
    await this.validateTransferOptions()
    await this.recover()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }
}
