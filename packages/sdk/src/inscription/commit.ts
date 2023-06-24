import { getAddresses } from "../addresses";
import { createTransaction } from "../utils";
import { GetWalletOptions } from "../wallet";
import { buildWitnessScript } from "./witness";

export async function generateCommitAddress(options: GenerateCommitAddressOptions) {
  const { satsPerByte = 10, ...rest } = options;
  const key = (await getAddresses({ ...rest, format: "p2tr" }))[0];
  const xkey = key.xkey;

  if (xkey) {
    const witnessScript = buildWitnessScript({ ...options, xkey });

    if (!witnessScript) {
      throw new Error("Failed to build witness script.");
    }

    const scriptTree = {
      output: witnessScript
    };

    const p2tr = createTransaction(Buffer.from(xkey, "hex"), "p2tr", options.network, {
      scriptTree
    });

    const fees = JSON.parse(JSON.stringify((80 + 1 * 180) * satsPerByte));
    const scriptLength = witnessScript.toString("hex").length;
    const scriptFees = (scriptLength / 10) * satsPerByte + fees;

    return {
      address: p2tr.address,
      xkey,
      format: "inscribe",
      fees: scriptFees
    };
  }
}

export type GenerateCommitAddressOptions = Omit<GetWalletOptions, "pubKey" | "format"> & {
  satsPerByte: number;
  mediaType: string;
  mediaContent: string;
  meta: any;
};
