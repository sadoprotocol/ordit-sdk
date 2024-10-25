import {
  BaseDatasource,
  EnvelopeOpts,
  GetWalletOptions,
  Inscriber,
  InscriberV2,
  JsonRpcDatasource,
  TaptreeVersion,
  verifyMessage
} from ".."
import { Chain, Network } from "../config/types"
import { MAXIMUM_ROYALTY_PERCENTAGE } from "../constants"
import { OrditSDKError } from "../utils/errors"
import { buildMeta } from "./meta"

export async function publishCollection({
  title,
  description,
  url,
  slug,
  creator,
  royalty,
  publishers,
  inscriptions,
  chain = "bitcoin",
  network,
  ...options
}: PublishCollectionOptions) {
  if (chain !== "bitcoin" && chain !== "fractal-bitcoin") {
    throw new OrditSDKError("Invalid chain supplied.")
  }

  if (!validateInscriptions(inscriptions)) {
    throw new OrditSDKError("Invalid inscriptions supplied.")
  }

  if (royalty) {
    // 0 = 0%, 0.1 = 10%
    if (isNaN(royalty.pct) || royalty.pct < 0 || royalty.pct > MAXIMUM_ROYALTY_PERCENTAGE) {
      throw new OrditSDKError("Invalid royalty %")
    }

    royalty.pct = +new Intl.NumberFormat("en", {
      maximumFractionDigits: 8,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      roundingMode: "trunc"
    }).format(royalty.pct)
  }

  const collectionMeta = {
    p: "vord", // protocol
    v: 1, // version
    ty: "col",
    title,
    desc: description,
    url,
    slug,
    creator,
    royalty,
    publ: publishers,
    insc: inscriptions
  }

  return new Inscriber({ ...options, meta: collectionMeta, network, chain })
}

export async function mintFromCollection({ chain = "bitcoin", ...options }: MintFromCollectionOptions) {
  if (!options.collectionInscriptionId || !options.inscriptionIid || !options.destinationAddress) {
    throw new OrditSDKError("Invalid options supplied.")
  }

  if (chain !== "bitcoin" && chain !== "fractal-bitcoin") {
    throw new OrditSDKError("Invalid chain supplied.")
  }

  const datasource = options.datasource || new JsonRpcDatasource({ network: options.network, chain })
  const collection = await datasource.getInscription({ id: options.collectionInscriptionId })
  if (!collection) {
    throw new OrditSDKError("Invalid collection")
  }

  const colMeta = collection.meta
  let validInscription = false

  for (let i = 0; i < colMeta?.insc.length; i++) {
    if (
      colMeta?.insc[i].iid == options.inscriptionIid &&
      colMeta.publ[options.publisherIndex] &&
      options.nonce < colMeta.insc[i].lim
    ) {
      validInscription = true
    }
  }

  if (!validInscription) {
    throw new OrditSDKError("Invalid inscription iid supplied.")
  }

  const meta: any = {
    p: "vord",
    v: 1,
    ty: "insc",
    col: collection.genesis,
    iid: options.inscriptionIid,
    publ: colMeta?.publ[options.publisherIndex],
    nonce: options.nonce,
    minter: options.includeMintAddress ? options.destinationAddress : undefined,
    traits: options.traits
  }

  const message = `${collection.genesis} ${options.inscriptionIid} ${options.nonce}`
  const validSignature = verifyMessage({ address: meta.publ, message: message, signature: options.signature })

  if (!validSignature) {
    throw new OrditSDKError("Invalid signature supplied.")
  }

  meta.sig = options.signature

  return new Inscriber({ ...options, meta })
}

export async function bulkMintFromCollection({
  inscriptions,
  collectionGenesis,
  publisherAddress,
  address,
  publicKey,
  feeRate,
  datasource,
  network,
  outputs,
  changeAddress,
  taptreeVersion,
  chain = "bitcoin"
}: BulkMintFromCollectionOptions) {
  if (chain !== "bitcoin" && chain !== "fractal-bitcoin") {
    throw new OrditSDKError("Invalid chain supplied.")
  }

  let currentPointer = 0

  const { metaList, inscriptionList } = inscriptions.reduce<{
    metaList: EnvelopeOpts[]
    inscriptionList: EnvelopeOpts[]
  }>(
    (acc, insc) => {
      const { nonce, mediaContent, mediaType, delegateInscriptionId, receiverAddress, postage, iid, signature } = insc

      const meta = buildMeta({
        collectionGenesis,
        iid,
        publisher: publisherAddress,
        nonce,
        receiverAddress,
        signature
      })

      const metaEnvelope: EnvelopeOpts = {
        mediaContent: JSON.stringify(meta),
        mediaType: "application/json;charset=utf-8",
        receiverAddress,
        postage
      }

      const inscriptionEnvelope: EnvelopeOpts = {
        mediaContent,
        mediaType,
        delegateInscriptionId,
        pointer: currentPointer === 0 ? undefined : currentPointer.toString(),
        receiverAddress,
        postage
      }

      currentPointer += postage

      return {
        metaList: [...acc.metaList, metaEnvelope],
        inscriptionList: [...acc.inscriptionList, inscriptionEnvelope]
      }
    },
    { metaList: [], inscriptionList: [] }
  )

  return new InscriberV2({
    address,
    chain,
    publicKey,
    feeRate,
    datasource,
    network,
    outputs,
    changeAddress,
    taptreeVersion,
    metaInscriptions: metaList,
    inscriptions: inscriptionList
  })
}

function validateInscriptions(inscriptions: CollectionInscription[] = []) {
  if (!inscriptions.length) return false

  for (const insc of inscriptions) {
    if (!insc.iid || !insc.lim) {
      return false
    }
  }

  return true
}

export type PublishCollectionOptions = Pick<GetWalletOptions, "safeMode"> & {
  address: string
  feeRate: number
  postage: number
  mediaType: string
  mediaContent: string
  destinationAddress: string
  changeAddress: string
  title: string
  description: string
  slug: string
  url: string
  publishers: Array<string>
  inscriptions: Array<CollectionInscription>
  creator: {
    name?: string
    email?: string
    address: string
  }
  royalty?: {
    address: string
    pct: number
  }
  network: Network
  publicKey: string
  outputs?: Outputs
  encodeMetadata?: boolean
  enableRBF?: boolean
  chain?: Chain
}

export type CollectionInscription = {
  iid: string
  lim: number
  sri?: string
}

export type MintFromCollectionOptions = Pick<GetWalletOptions, "safeMode"> & {
  address: string
  feeRate: number
  postage: number
  mediaType: string
  mediaContent: string
  destinationAddress: string
  changeAddress: string
  collectionInscriptionId: string
  inscriptionIid: string
  nonce: number
  publisherIndex: number
  signature: string
  network: Network
  publicKey: string
  outputs?: Outputs
  traits?: any
  encodeMetadata?: boolean
  enableRBF?: boolean
  datasource?: BaseDatasource
  // temporary flag for backward compatibility
  includeMintAddress?: boolean
  taptreeVersion?: TaptreeVersion
  chain?: Chain
}

export type BulkMintFromCollectionOptions = {
  feeRate: number
  changeAddress: string
  address: string
  publicKey: string
  network: Network
  inscriptions: InscriptionsToMint[]
  outputs?: Outputs
  enableRBF?: boolean
  datasource?: BaseDatasource
  taptreeVersion?: TaptreeVersion
  collectionGenesis: string
  publisherAddress: string
  chain?: Chain
}

export type InscriptionsToMint = {
  nonce: number
  mediaContent?: string
  mediaType?: string
  delegateInscriptionId?: string
  receiverAddress: string
  postage: number
  iid: string
  signature?: string // deprecated only used for backward compatibility
}

type Outputs = Array<{ address: string; value: number }>
