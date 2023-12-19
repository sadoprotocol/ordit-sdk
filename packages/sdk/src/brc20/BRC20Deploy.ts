import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { Inscriber } from "../transactions/Inscriber"
import { BRC20DeployOptions, BRC20DeployPayloadAttributes } from "./types"

export class BRC20Deploy extends Inscriber {
  private tick: string
  private supply: number
  private limit?: number
  private decimals?: number

  constructor({
    address,
    pubKey,
    destinationAddress,
    feeRate,
    network,
    tick,
    supply,
    limit,
    decimals
  }: BRC20DeployOptions) {
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
    this.supply = supply
    this.limit = limit
    this.decimals = decimals
  }

  private async validateDeployOptions() {
    if (this.decimals && (this.decimals < 0 || this.decimals > 18)) {
      throw new Error("Invalid decimals")
    }

    if (this.limit && this.limit <= 0) {
      throw new Error("Invalid limit")
    }

    if (this.supply <= 0) {
      throw new Error("Invalid supply")
    }

    if (this.tick.length < 4) {
      throw new Error("Invalid tick")
    }

    try {
      const token = await this.datasource.getToken({ tick: this.tick })
      if (token) {
        throw new Error("Token already exists")
      }
    } catch (error) {
      if (error.message !== "Token not found") {
        throw error
      }
    }

    this.generatePayload()
  }

  private generatePayload() {
    const payload: BRC20DeployPayloadAttributes = {
      p: "brc-20",
      op: "deploy",
      tick: this.tick,
      max: this.supply.toString(),
      lim: this.limit?.toString(),
      dec: this.decimals?.toString()
    }

    this.media = {
      content: JSON.stringify(payload),
      type: "text/plain;charset=utf-8"
    }
  }

  async reveal() {
    await this.validateDeployOptions()

    // generate deposit address and fee for inscription
    const { address, revealFee: amount } = await this.generateCommit()

    return { address, amount }
  }

  async deploy() {
    await this.validateDeployOptions()
    await this.generateCommit()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }

  async recoverFunds() {
    await this.validateDeployOptions()
    await this.recover()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }
}
