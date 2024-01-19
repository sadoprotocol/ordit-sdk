declare interface Window {
  unisat: Unisat
  satsConnect: any
  ethereum: MetaMask
}

type Unisat = {
  getNetwork: () => Promise<UnisatNetwork>
  switchNetwork: (targetNetwork: UnisatNetwork) => Promise<void>
  requestAccounts: () => Promise<string[]>
  getAccounts: () => Promise<string[]>
  getPublicKey: () => Promise<string>
  signPsbt: (hex: string, { autoFinalized }: Record<string, boolean>) => Promise<string>
  signMessage: (message: string, type: MessageSignatureTypes) => Promise<string>
}

type MetaMask = {
  isMetaMask: boolean
  request: (options: { method: string; params?: any }) => Promise<any>
}

declare module "buffer-reverse" {
  export = (_: Buffer): Buffer => {}
}

declare module "cbor-js" {
  function encode(object: NestedObject): ArrayBuffer
  function decode(data: ArrayBuffer): NestedObject
}
