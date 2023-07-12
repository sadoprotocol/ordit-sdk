import { getAddressesFromPublicKey } from "../addresses";
import { AddressTypes } from "../addresses/formats";
import { OrditApi } from "../api";
import { Network } from "../config/types";
import { getWalletKeys } from "../keys";

export async function getWallet({
  pubKey,
  seed,
  bip39,
  path,
  network = "testnet",
  format = "all"
}: GetWalletOptions): Promise<GetWalletReturnType> {
  if (!pubKey && !seed && !bip39) throw new Error("Failed to get wallet. Please provide pubKey | seed | bip39.");

  const seedValue = seed || bip39;

  if (seedValue) {
    const keys = await getWalletKeys(seedValue, network, path);

    const addresses = getAddressesFromPublicKey(keys.pub, network, format);

    return {
      counts: {
        addresses: addresses.length
      },
      keys: [keys],
      addresses
    };
  }

  const addresses = getAddressesFromPublicKey(pubKey!, network, format);

  return {
    counts: {
      addresses: addresses.length
    },
    keys: [{ pub: pubKey }],
    addresses
  };
}

export async function getWalletWithBalances(options: GetWalletOptions) {
  const wallet = (await getWallet(options)) as GetWalletWithBalances;

  const ordinals: unknown[] = [];
  const inscriptions: unknown[] = [];
  const spendables: unknown[] = [];
  const unspendables: unknown[] = [];

  wallet.counts.unspents = 0;
  wallet.counts.satoshis = 0;
  wallet.counts.cardinals = 0;
  wallet.counts.spendables = 0;
  wallet.counts.unspendables = 0;
  wallet.counts.ordinals = 0;
  wallet.counts.inscriptions = 0;

  const { addresses } = wallet;

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];

    let wallet_unspents = 0;
    let wallet_satoshis = 0;
    let wallet_cardinals = 0;
    let wallet_spendables = 0;
    let wallet_unspendables = 0;

    const unspent = await OrditApi.fetch<{ success: boolean; rdata: Array<any> }>("utxo/unspents", {
      network: options.network,
      data: {
        address: address.address,
        options: {
          txhex: true,
          notsafetospend: false,
          allowedrarity: ["common"]
        }
      }
    });

    if (unspent.success) {
      address.unspents = unspent.rdata;
      wallet_unspents += unspent.rdata.length;
    }

    for (let j = 0; j < address.unspents!.length; j++) {
      const unspentObj = address.unspents![j];
      unspentObj.pub = address.pub;
      wallet.counts.satoshis += unspentObj.sats;
      wallet_satoshis += unspentObj.sats;

      if (unspentObj.safeToSpend) {
        wallet.counts.cardinals += unspentObj.sats;
        wallet_cardinals += unspentObj.sats;

        wallet.counts.spendables++;
        wallet_spendables++;
        spendables.push(unspentObj);
      } else {
        wallet.counts.unspendables++;
        wallet_unspendables++;

        unspendables.push(unspentObj);
      }

      const _ordinals = unspentObj.ordinals;
      const _inscriptions = unspentObj.inscriptions;

      _ordinals.forEach((_ord: any, index: number) => {
        _ordinals[index].address = address;
        _ordinals[index].unspent = unspentObj.txid;

        ordinals.push(_ord);
      });

      _inscriptions.forEach((_inscription: any, index: number) => {
        _inscriptions[index].address = address;
        _inscriptions[index].unspent = unspentObj.txid;

        inscriptions.push(_inscription);
      });

      wallet.spendables = spendables;
      wallet.unspendables = unspendables;
      wallet.ordinals = ordinals;
      wallet.inscriptions = inscriptions;
      wallet.counts.ordinals = ordinals.length;
      wallet.counts.inscriptions = inscriptions.length;

      address.counts = {
        unspents: wallet_unspents,
        satoshis: wallet_satoshis,
        cardinals: wallet_cardinals,
        spendables: wallet_spendables,
        unspendables: wallet_unspendables
      };
    }
  }

  return wallet;
}

export type GetWalletOptions = {
  pubKey?: string;
  seed?: string;
  bip39?: string;
  path: string;
  network: Network;
  format: AddressTypes | "all";
};

export type GetWalletReturnType = {
  counts: {
    addresses: number;
  };
  keys: [Partial<Awaited<ReturnType<typeof getWalletKeys>>>];
  addresses: ReturnType<typeof getAddressesFromPublicKey>;
};

export type GetWalletWithBalances = GetWalletReturnType & {
  spendables: unknown[];
  unspendables: unknown[];
  ordinals: unknown[];
  inscriptions: unknown[];

  counts: {
    unspents: number;
    satoshis: number;
    cardinals: number;
    spendables: number;
    unspendables: number;
    ordinals: number;
    inscriptions: number;
  };
  addresses: Array<{
    unspents: any[];
    counts: {
      unspents: number;
      satoshis: number;
      cardinals: number;
      spendables: number;
      unspendables: number;
    };
  }>;
};
