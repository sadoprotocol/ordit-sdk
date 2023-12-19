import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { Inscriber } from "../transactions/Inscriber"
import { BRC20MintOptions, BRC20MintPayloadAttributes } from "./types"

export class BRC20Mint extends Inscriber {
  private tick: string
  private amount = 0

  constructor({ address, pubKey, destinationAddress, feeRate, network, tick, amount }: BRC20MintOptions) {
    super({
      network,
      address,
      changeAddress: address,
      destinationAddress: destinationAddress || address,
      publicKey: pubKey,
      feeRate,
      postage: MINIMUM_AMOUNT_IN_SATS,
      mediaType: "<temp-type>", // Set on payload creation
      mediaContent: "<temp-content>" // Set on payload creation
    })

    this.tick = tick
    this.amount = amount
  }

  private async validateMintOptions() {
    if (isNaN(this.amount) || this.amount <= 0) {
      throw new Error("Invalid amount")
    }

    const token = await this.datasource.getToken({ tick: this.tick })
    if (!token) {
      throw new Error("Invalid token")
    }

    const availableSupply = +token.max - +token.amount
    if (availableSupply < this.amount) {
      throw new Error(`Amount exceeds available supply of ${availableSupply} tokens`)
    }

    if (this.amount > token.limit) {
      throw new Error(`Amount exceeds limit of ${token.limit} tokens per tx`)
    }

    this.generatePayload()
  }

  private generatePayload() {
    const payload: BRC20MintPayloadAttributes = {
      p: "brc-20",
      op: "mint",
      tick: this.tick,
      amt: this.amount.toString()
    }

    this.media = {
      content: JSON.stringify(payload),
      type: "text/plain;charset=utf-8"
    }
  }

  async reveal() {
    await this.validateMintOptions()

    // generate deposit address and fee for inscription
    const { address, revealFee: amount } = await this.generateCommit()

    return { address, amount }
  }

  async mint() {
    await this.validateMintOptions()
    await this.generateCommit()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }

  async recoverFunds() {
    await this.validateMintOptions()
    await this.recover()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }
}
