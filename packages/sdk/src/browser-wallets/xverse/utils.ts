export function isXverseInstalled() {
  if (typeof window.BitcoinProvider !== "undefined") {
    return true;
  }

  return false;
}

export type XverseNetwork = "Mainnet" | "Testnet";
