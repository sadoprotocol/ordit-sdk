import { Network } from "~/config/types"
import { NestedObject } from "~/utils/types"
import { OnOffUnion } from "~/wallet"

export type InscriberArgOptions = {
  network: Network
  address: string
  destinationAddress: string
  publicKey: string
  feeRate: number
  postage: number
  mediaType: string
  mediaContent: string
  changeAddress: string
  meta?: NestedObject
  outputs?: Outputs
  encodeMetadata?: boolean
  safeMode?: OnOffUnion
}

type Outputs = Array<{ address: string; value: number }>
