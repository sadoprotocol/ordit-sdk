export function isXverseInstalled() {
  if (typeof window.satsConnect !== "undefined") {
    return true;
  }

  return false;
}

export type XverseNetwork = "Mainnet" | "Testnet";
