import { JsonRpcDatasource } from ".."
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"
import { Inscriber } from "../transactions/Inscriber"
import {
  BRC20TransferBaseOptions,
  GetBRC20BalancesOptions,
  HasEnoughBalanceOptions,
  ValidateBRC20TransferOptions
} from "./types"

export class BRC20TransferBase extends Inscriber {
  protected tick: string
  protected amount = 0

  constructor({ address, pubKey, feeRate, network, tick, amount, datasource }: BRC20TransferBaseOptions) {
    super({
      network,
      address,
      changeAddress: address,
      destinationAddress: address,
      publicKey: pubKey,
      feeRate,
      datasource,
      postage: MINIMUM_AMOUNT_IN_SATS,
      mediaType: "<temp-type>", // Set on payload creation
      mediaContent: "<temp-content>" // Set on payload creation
    })

    this.tick = tick
    this.amount = amount
  }

  static async validateTransferOptions({ amount, tick, datasource, network }: ValidateBRC20TransferOptions) {
    if (isNaN(amount) || amount <= 0) {
      throw new Error("Invalid amount")
    }

    datasource = datasource || new JsonRpcDatasource({ network })
    const token = await datasource.getToken({ tick })
    if (!token) {
      throw new Error("Invalid token")
    }
  }

  static async getBalances({ address, tick, datasource, network }: GetBRC20BalancesOptions) {
    datasource = datasource || new JsonRpcDatasource({ network })
    const balances = await datasource.getAddressTokens({
      address: address
    })
    const balance = balances.find((b) => b.tick === tick)

    return {
      total: balance?.total || 0,
      available: balance?.available || 0,
      transferable: balance?.transferable || 0
    }
  }

  static async hasEnoughTransferableBalance({ address, amount, tick, datasource, network }: HasEnoughBalanceOptions) {
    const { transferable } = await BRC20TransferBase.getBalances({ address, tick, datasource, network })
    return transferable >= amount
  }

  static async hasEnoughOverallBalance({ address, amount, tick, datasource, network }: HasEnoughBalanceOptions) {
    const { available } = await BRC20TransferBase.getBalances({ address, tick, datasource, network })
    return available >= amount
  }
}
