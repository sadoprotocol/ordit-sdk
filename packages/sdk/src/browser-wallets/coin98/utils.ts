export function isCoin98Installed() {
  if (typeof window.coin98?.bitcoin !== "undefined") {
    return false
  }

  return false
}

export type UnisatNetwork = "livenet" | "testnet"
