export interface MetaParams {
  collectionGenesis: string
  iid: string
  publisher: string
  nonce: number
  receiverAddress: string
  signature?: string
}

export function buildMeta({ collectionGenesis, iid, publisher, nonce, receiverAddress, signature }: MetaParams) {
  return {
    p: "vord",
    v: 1,
    ty: "insc",
    col: collectionGenesis,
    iid,
    publ: publisher,
    nonce: nonce,
    minter: receiverAddress,
    sig: signature
  }
}
