import { Network } from "../config/types";
import { InscriptionsEntity, UnspentsEntity } from "./entities";
import { rpc } from "./jsonrpc";

export async function getAllInscriptions({ address, network = "testnet" }: FetchInscriptionsOptions) {
  const inscriptions: InscriptionsEntity[] = [];

  const unspents = await rpc[network].call<UnspentsEntity[]>(
    "GetUnspents",
    { address, options: { allowedrarity: ["common"] } },
    rpc.id
  );

  for (const unspent of unspents) {
    if (unspent.inscriptions && unspent.inscriptions.length) {
      inscriptions.push(...unspent.inscriptions);
    }
  }

  return inscriptions;
}

type FetchInscriptionsOptions = {
  address: string;
  network?: Network;
};
