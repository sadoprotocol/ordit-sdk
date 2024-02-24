export enum RarityEnum {
  COMMON = "common",
  UNCOMMON = "uncommon",
  RARE = "rare",
  EPIC = "epic",
  LEGENDARY = "legendary",
  MYTHIC = "mythic"
}

export type Rarity = `${RarityEnum}`

export interface Ordinal {
  number: number
  decimal: string
  degree: string
  name: string
  height: number
  cycle: number
  epoch: number
  period: number
  offset: number
  rarity: Rarity
  output: string
  start: number
  size: number
}

export interface Inscription {
  id: string
  outpoint: string
  owner: string
  genesis: string
  fee: number
  height: number
  number: number
  sat: number
  timestamp: number
  mediaType: string
  mediaSize: number
  mediaContent: string
  meta?: Record<string, any>
  value?: number // postage
}

export interface InscriptionID {
  txid: string,
  index: number
}

export enum InscriptionFieldTag {
  Body = 0,
  ContentType = 1,
  Pointer = 2,
  Parent = 3,
  Metadata = 5,
  Metaprotocol = 7,
  ContentEncoding = 9,
  Delegate = 11
}

export interface InputsToSign {
  address: string
  signingIndexes: number[]
  sigHash?: number
}
