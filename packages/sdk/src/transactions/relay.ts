import { OrditApi } from "../api";
import { Network } from "../config/types";

export async function relayTransaction(hex: string, network: Network) {
  const txResponse = await OrditApi.fetch<{ success: boolean; rdata: string }>("utxo/relay", {
    data: { hex },
    network: network
  });

  if (txResponse.success && txResponse.rdata) {
    return txResponse.rdata;
  }

  throw new Error("Failed to relay transaction.");
}
