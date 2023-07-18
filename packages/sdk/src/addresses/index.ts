import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory, { BIP32Interface } from "bip32";

import { Network } from "../config/types";
import { getWalletKeys } from "../keys";
import { createTransaction, getDerivationPath, getNetwork, toXOnly } from "../utils";
import { AddressFormats, addressFormats, addressNameToType, AddressTypes, addressTypeToName } from "./formats";

export function getAddressFormat(address: string, network: Network) {
  let format = {
    address,
    format: "unknown"
  };

  const addressTypes = addressFormats[network];
  const addressTypesList = Object.keys(addressTypes);

  for (let i = 0; i < addressTypesList.length; i++) {
    const addressType = addressTypesList[i] as AddressTypes;
    const addressTypeReg = addressTypes[addressType];
    const addressName = addressTypeToName[addressType];

    if (addressTypeReg.test(address)) {
      format = {
        address,
        format: addressName
      };
    }
  }

  return format;
}

export function getAddressType(address: string, network: Network): AddressTypes {
  const addressFormat = getAddressFormat(address, network).format;
  return addressNameToType[addressFormat as AddressFormats];
}

export function getAddressesFromPublicKey(
  pubKey: string | Buffer,
  network: Network = "testnet",
  format: AddressTypes | "all" = "all"
) {
  if (!Buffer.isBuffer(pubKey)) {
    pubKey = Buffer.from(pubKey, "hex");
  }
  const bip32 = BIP32Factory(ecc);
  const networkObj = getNetwork(network);
  const chainCode = Buffer.alloc(32).fill(1);

  const addresses: Address[] = [];

  let childNodeXOnlyPubkey = pubKey;

  const keys = bip32.fromPublicKey(pubKey, chainCode, networkObj);

  childNodeXOnlyPubkey = keys.publicKey.subarray(1, 33);

  if (format === "all") {
    const addressTypesList = Object.keys(addressTypeToName) as AddressTypes[];

    addressTypesList.forEach((addrType) => {
      if (addrType === "p2tr") {
        const paymentObj = createTransaction(childNodeXOnlyPubkey, addrType, network);

        addresses.push({
          address: paymentObj.address,
          xkey: childNodeXOnlyPubkey.toString("hex"),
          format: addressTypeToName[addrType],
          pub: keys.publicKey.toString("hex")
        });
      } else {
        const paymentObj = createTransaction(keys.publicKey, addrType, network);

        addresses.push({
          address: paymentObj.address,
          format: addressTypeToName[addrType],
          pub: keys.publicKey.toString("hex")
        });
      }
    });
  } else {
    const key = format === "p2tr" ? childNodeXOnlyPubkey : keys.publicKey;
    const paymentObj = createTransaction(key, format, network);

    addresses.push({
      address: paymentObj.address,
      format: addressTypeToName[format],
      pub: keys.publicKey.toString("hex"),
      xkey: format === "p2tr" ? childNodeXOnlyPubkey.toString("hex") : undefined
    });
  }

  return addresses;
}

export async function getAddresses({
  pubKey,
  seed,
  bip39,
  network,
  format,
  path
}: GetAddressesOptions): Promise<ReturnType<typeof getAddressesFromPublicKey>> {
  if (!(seed || bip39 || pubKey)) {
    throw new Error("Invalid options provided.");
  }

  if (seed || bip39) {
    const seedValue = seed || bip39;
    const keys = await getWalletKeys(seedValue!, network, path);

    return getAddressesFromPublicKey(keys.pub, network, format);
  }

  return getAddressesFromPublicKey(pubKey!, network, format);
}

export function getAccountDataFromHdNode({
  hdNode,
  format = "legacy",
  network = "testnet",
  account = 0,
  addressIndex = 0
}: GetAccountDataFromHdNodeOptions) {
  if (!hdNode) {
    throw new Error("Invalid options provided.");
  }

  const addressType = addressNameToType[format];

  const fullDerivationPath = getDerivationPath(format, account, addressIndex);
  const child = hdNode.derivePath(fullDerivationPath);

  const pubKey = format === "taproot" ? toXOnly(child.publicKey) : child.publicKey;
  const paymentObj = createTransaction(pubKey, addressType, network);

  const address = paymentObj.address!;

  const accountData: Account = {
    address,
    pub: child.publicKey.toString("hex"),
    priv: child.privateKey!.toString("hex"),
    format,
    type: addressType,
    derivationPath: {
      account,
      addressIndex,
      path: fullDerivationPath
    }
  };

  if (format === "taproot") {
    accountData.xkey = toXOnly(child.publicKey).toString("hex");
  }

  return accountData;
}

export function getAllAccountsFromHdNode({ hdNode, network = "testnet" }: GetAllAccountsFromHDNodeOptions) {
  const accounts: Account[] = [];
  const addressTypesList = Object.values(addressTypeToName) as AddressFormats[];

  addressTypesList.forEach((addrType) => {
    const account = getAccountDataFromHdNode({
      hdNode,
      format: addrType,
      network
    });

    accounts.push(account);
  });

  return accounts;
}

export type Address = {
  address: string | undefined;
  xkey?: string;
  format: string;
  pub: string;
};

export type Derivation = {
  account: number;
  addressIndex: number;
  path: string
}

export type Account = Address & {
  priv: string;
  type: AddressTypes;
  derivationPath: Derivation;
};

type GetAddressesOptions = {
  pubKey?: string;
  seed?: string;
  bip39?: string;
  network: Network;
  format: AddressTypes | "all";
  path: string;
};

type GetAccountDataFromHdNodeOptions = {
  hdNode: BIP32Interface;
  format?: AddressFormats;
  network?: Network;
  account?: number;
  addressIndex?: number;
};

type GetAllAccountsFromHDNodeOptions = Omit<GetAccountDataFromHdNodeOptions, "format">;

export * from "./formats";
