export enum RarityEnum {
    COMMON = "common",
    UNCOMMON = "uncommon",
    RARE = "rare",
    EPIC = "epic",
    LEGENDARY = "legendary",
    MYTHIC = "mythic",
}

export type Rarity = `${RarityEnum}`

export interface Ordinal {
  number: number;
  decimal: string;
  degree: string;
  name: string;
  height: number;
  cycle: number;
  epoch: number;
  period: number;
  offset: number;
  rarity: string;
  output: string;
  start: number;
  size: number;
}

export interface Inscription {
  id: string;
  outpoint: string;
  owner: string;
  fee: number;
  height: number;
  number: number;
  sat: number;
  timestamp: number;
  media_type: string;
  media_size: number;
  media_content: string;
  meta?: Record<string, any>;
}