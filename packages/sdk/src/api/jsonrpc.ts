import fetch from "cross-fetch"

import { apiConfig } from "../config"

export class JsonRpc {
  constructor(readonly url: string) {}

  /**
   * Send a JSON-RPC 2.0 notification to the connected Sado compliant server.
   *
   * @param method - Method to call.
   * @param params - JSON-RPC 2.0 parameters.
   */
  notify(method: string, params?: Params): void {
    fetch(`${this.url}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params
      })
    })
  }

  async call<T>(method: string, id: Id): Promise<T>
  async call<T>(method: string, params: Params, id: Id): Promise<T>
  async call<T>(method: string, paramsOrId: Params | Id, id?: Id): Promise<T> {
    let params: Params = {}
    if (isJsonRpcId(paramsOrId)) {
      id = paramsOrId
    } else {
      params = paramsOrId
    }

    const response = await fetch(`${this.url}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id
      })
    })
    if (response.status === 200) {
      const json = await response.json()
      if (json.error) {
        const error = typeof json.error.data === "string" ? json.error.data : json.error.message
        throw new Error(error)
      }
      return json.result
    }
    throw new Error(`Internal Server Error`)
  }
}

/*
 |--------------------------------------------------------------------------------
 | RPC Clients
 |--------------------------------------------------------------------------------
 */

export const rpc = {
  get id() {
    return Math.floor(Math.random() * 100000)
  },
  mainnet: new JsonRpc(getRpcUrl(apiConfig.apis.mainnet.batter)),
  testnet: new JsonRpc(getRpcUrl(apiConfig.apis.testnet.batter)),
  signet: new JsonRpc(getRpcUrl(apiConfig.apis.signet.batter)),
  regtest: new JsonRpc(getRpcUrl(apiConfig.apis.regtest.batter))
} as const

/*
 |--------------------------------------------------------------------------------
 | Utilities
 |--------------------------------------------------------------------------------
 */

function isJsonRpcId(value: unknown): value is Id {
  return isString(value) || isInteger(value) || value === null
}

function isInteger(value: any): value is number {
  return isNumber(value) && value % 1 === 0
}

function isNumber(value: any): value is number {
  const type = typeof value
  return type === "number" && value > Number.NEGATIVE_INFINITY && value < Number.POSITIVE_INFINITY
}

function isString(value: any): value is string {
  return typeof value === "string"
}

function getRpcUrl(value: string): string {
  if (value[value.length - 1] === "/") {
    return value.substring(0, value.length - 1)
  }
  return value
}

/*
 |--------------------------------------------------------------------------------
 | Types
 |--------------------------------------------------------------------------------
 */

type Id = string | number | null

export type Params = unknown[] | Record<string, any>
