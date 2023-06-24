import { sign, verify } from "bitcoinjs-message";

import { getDerivedNode } from "../keys";
import { createTransaction, getNetwork } from "../utils";
import { GetWalletOptions } from "../wallet";

export async function signMessage(options: SignMessageOptions) {
  const network = getNetwork(options.network);
  options.format = "core";

  if (!options.message || !(options.bip39 || options.seed)) {
    throw new Error("Invalid options provided.");
  }

  const seedValue = options.bip39 || options.seed;

  try {
    const { parent } = await getDerivedNode(seedValue!, options.network, options.path);
    //   const wif = parent.toWIF();
    //   const keyPair = EcPair.fromWIF(wif);
    const { address } = createTransaction(parent.publicKey, "p2pkh", network);

    const signature = sign(options.message, parent.privateKey!);

    return {
      hex: signature.toString("hex"),
      base64: signature.toString("base64"),
      address
    };
  } catch (error) {
    throw new Error("Unable to sign message.");
  }
}

export function verifyMessage(options: VerifyMessageOptions) {
  return verify(options.message, options.address, options.signature);
}

export type SignMessageOptions = Omit<GetWalletOptions, "pubKey" | "format"> & {
  message: string;
  format: "core";
};

export type VerifyMessageOptions = {
  address: string;
  message: string;
  signature: string;
};
