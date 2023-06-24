export function isUnisatInstalled() {
  if (typeof window.unisat !== "undefined") {
    return true;
  }

  return false;
}

export type UnisatNetwork = "livenet" | "testnet";
