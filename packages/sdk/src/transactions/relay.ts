import { OrditApi } from "../api"
import { Network } from "../config/types"

export async function relayTransaction(hex: string, network: Network, maxFeeRate?: number) {
  return OrditApi.relayTx({ hex, network, maxFeeRate })
}
