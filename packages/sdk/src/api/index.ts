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
}

export type FetchOptions = {
  data: any;
  network: Network;
};
