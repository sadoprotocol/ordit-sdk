import { BitcoinProvider } from "sats-connect"

import { Coin98 } from "./browser-wallets/coin98/types"

declare global {
  interface Window {
    unisat: Unisat
    coin98: { bitcoin: Coin98 }
    BitcoinProvider: BitcoinProvider
    ethereum: MetaMask
  }
}

type Unisat = {
  getNetwork: () => Promise<UnisatNetwork>
  switchNetwork: (targetNetwork: UnisatNetwork) => Promise<void>
  requestAccounts: () => Promise<string[]>
  getPublicKey: () => Promise<string>
  signPsbt: (hex: string, { autoFinalized }: Record<string, boolean>) => Promise<string>
  signMessage: (message: string) => Promise<string>
}

type MetaMask = {
  isMetaMask: boolean
  request: (options: { method: string; params?: any }) => Promise<any>
}

declare module "buffer-reverse" {
  export = (_: Buffer): Buffer => {}
}
