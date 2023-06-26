import { AddressPurposes, getAddress } from "sats-connect";

import { getAddressesFromPublicKey, getAddressFormat } from "../../addresses";
import { Network } from "../../config/types";
import { isXverseInstalled, XverseNetwork } from "./utils";
export async function getAddresses(options: XverseGetAddressOptions) {
  const result: Array<{
    pub: string;
    address: string;
    format: string;
    xKey?: string;
  }> = [];

  if (!isXverseInstalled()) {
    throw new Error("Xverse not installed.");
  }

  const handleOnFinish = (response: XverseOnFinishResponse, network: Network) => {
    if (!response || !response.addresses || response.addresses.length !== 2) {
      throw new Error("Invalid address format");
    }

    response.addresses.forEach((addressObj) => {
      const format = getAddressFormat(addressObj.address, network).format;

      let xKey;
      if (format === "taproot") {
        const userAddresses = getAddressesFromPublicKey(addressObj.publicKey, options.network, "p2tr");
        xKey = userAddresses[0].xkey;
      }

      result.push({
        pub: addressObj.publicKey,
        address: addressObj.address,
        format,
        xKey
      });
    });
  };

  const xVerseOptions = {
    payload: {
      purposes: ["ordinals", "payment"] as AddressPurposes[],
      message: options?.payload?.message ?? "Provide access to 2 address formats",
      network: {
        type: (options.network.charAt(0).toUpperCase() + options.network.slice(1)) as XverseNetwork
      }
    },
    onFinish: (response: XverseOnFinishResponse) => handleOnFinish(response, options.network),
    onCancel: handleOnCancel
  };

  await getAddress(xVerseOptions);

  return result;
}

function handleOnCancel() {
  throw new Error("Request canceled by user.");
}

export type XverseGetAddressOptions = {
  network: Network;
  payload?: {
    message: string;
  };
};

export type XverseOnFinishResponse = {
  addresses: Array<{
    address: string;
    publicKey: string;
    purpose: "ordinals" | "payment";
  }>;
};
