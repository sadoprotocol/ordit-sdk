export function isXverseInstalled() {
  if (typeof window.BitcoinProvider !== "undefined") {
    return true
  }

  return false
}

export function fromXOnlyToFullPubkey(xOnly: string) {
  return `03${xOnly}` // prepend y-coord/tie-breaker to x-only
}

export type XverseNetwork = "Mainnet" | "Testnet"
