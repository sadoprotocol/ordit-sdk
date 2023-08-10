export function isMetaMaskInstalled() {
  if (typeof window.ethereum !== "undefined" && window.ethereum.isMetaMask) {
    return true
  }

  return false
}
