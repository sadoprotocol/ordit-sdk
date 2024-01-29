import { RequireAtLeastOne } from "../../utils/types"
import { UnisatNetwork } from "../unisat"

interface Coin98SignPSBTOptions {
  autoFinalized?: boolean
  toSignInputs?: Array<
    RequireAtLeastOne<{
      address?: string
      publicKey?: string
    }> & {
      index: number
      sigHashTypes?: number[]
    }
  >
}

export interface Coin98 {
  requestAccounts: () => Promise<string[]>
  getAccounts: () => Promise<string>
  getNetwork: () => Promise<UnisatNetwork>
  getPublicKey: () => Promise<string>
  signMessage: (message: string) => Promise<string>
  signPsbt: (hex: string, { autoFinalized = true, toSignInputs }: Coin98SignPSBTOptions) => Promise<string>
  switchNetwork: (network: UnisatNetwork) => Promise<void>
}
