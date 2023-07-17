import { fetch as _fetch } from "cross-fetch";

import { apiConfig } from "../config";
import { Network } from "../config/types";

export class OrditApi {
  static readonly #config = apiConfig;
  #network: Network = "testnet";

  constructor(network: Network) {
    this.#network = network;
  }

  static async fetch<T>(uri: string, options: FetchOptions): Promise<T> {
    const fullUri = this.#config.apis[options.network].batter + uri;

    try {
      const response = await _fetch(fullUri, {
        method: "POST",
        body: JSON.stringify(options.data),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });
      const data = await response.json();

      return data;
    } catch (error: any) {
      throw new Error(error);
    }
  }

  static async fetchAllInscriptions({ address, network = "testnet" }: FetchInscriptionsOptions) {
    if (!address) {
      throw new Error("Invalid options provided.");
    }

    const fullUri = `${this.#config.apis[network].batter}/utxo/unspents`;
    const payload = {
      address,
      options: {
        txhex: true,
        notsafetospend: false,
        allowedrarity: ["common"]
      }
    };

    try {
      const response = await _fetch(fullUri, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });

      const data: UTXO = await response.json();

      if (data && data.success && data.rdata && data.rdata.length) {
        const inscriptions: InscriptionsEntity[] = [];

        data.rdata.forEach((utxo: RdataEntity) => {
          if (utxo.inscriptions && utxo.inscriptions.length) {
            inscriptions.push(...utxo.inscriptions);
          }
        });

        return inscriptions;
      } else {
        throw new Error("No data found.");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async fetchInscriptionDetails({ outpoint, network = "testnet" }: FetchInscriptionDetailsOptions) {
    if (!outpoint) {
      throw new Error("Invalid options provided.");
    }

    const fullUri = `${this.#config.apis[network].batter}/utxo/inscriptions/${outpoint}`;

    try {
      const response = await _fetch(fullUri);

      const data: InscriptionDetailsEntity = await response.json();

      return data;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
}

export type FetchOptions = {
  data: any;
  network: Network;
};

export type FetchInscriptionsOptions = {
  address: string;
  network?: Network;
};

export type FetchInscriptionDetailsOptions = {
  outpoint: string;
  network?: Network;
};

export interface UTXO {
  success: boolean;
  message: string;
  rdata?: RdataEntity[] | null;
}
export interface RdataEntity {
  n: number;
  txHash: string;
  blockHash: string;
  blockN: number;
  sats: number;
  scriptPubKey: ScriptPubKey;
  txid: string;
  value: number;
  ordinals?: OrdinalsEntity[] | null;
  inscriptions?: InscriptionsEntity[] | null;
  safeToSpend: boolean;
  confirmation: number;
}
export interface ScriptPubKey {
  asm: string;
  desc: string;
  hex: string;
  address: string;
  type: string;
}
export interface OrdinalsEntity {
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
export interface InscriptionsEntity {
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
  meta?: Record<string,any>
}

export interface InscriptionDetailsEntity {
  success: boolean;
  message: string;
  rdata?: InscriptionsEntity[] | null;
}
