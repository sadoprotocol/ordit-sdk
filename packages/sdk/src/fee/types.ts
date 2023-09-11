import { Psbt } from "bitcoinjs-lib"

import { Network } from "../config/types"

export interface FeeEstimatorOptions {
  feeRate: number
  network: Network
  psbt?: Psbt
  witnesses?: Buffer[]
}
