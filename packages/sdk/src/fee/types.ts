import { Psbt } from "bitcoinjs-lib"

import { Chain, Network } from "../config/types"

export interface FeeEstimatorOptions {
  feeRate: number
  network: Network
  psbt?: Psbt
  witness?: Buffer[]
  chain?: Chain
}
