import { PSBTBuilderOptions } from "~/psbt-builder/types"

export type UTXOManagerOptions = Pick<
  PSBTBuilderOptions,
  "address" | "network" | "publicKey" | "feeRate" | "datasource"
>
