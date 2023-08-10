import { ethers } from "ethers"

import { getAddressesFromPublicKey, getDerivedNode } from "../.."
import { Network } from "../../config/types"
import { isMetaMaskInstalled } from "./utils"
export async function getAddresses({ path, network = "testnet" }: GetMetaMaskAddressesOptions) {
  if (!isMetaMaskInstalled()) {
    throw new Error("Metamask not installed.")
  }
  const provider = new ethers.BrowserProvider(window.ethereum)

  const accounts = await provider.send("eth_requestAccounts", [])

  if (!accounts || !accounts.length) {
    throw new Error("Request to get addresses was rejected by user")
  }

  const address = accounts[0]
  const msgToSign = `Generate Bitcoin addresses from ${address}?`

  const signature = await provider.send("personal_sign", [msgToSign, address])

  const seed = ethers.hexlify(ethers.getBytes(ethers.keccak256(ethers.getBytes(signature))))
  const { parent } = await getDerivedNode(seed, network, path)

  const addresses = getAddressesFromPublicKey(parent.publicKey)

  return addresses
}

export async function getDerivedNodeFromMetaMaskSignature(signature: string, path: string, network: Network) {
  const seed = ethers.hexlify(ethers.getBytes(ethers.keccak256(ethers.getBytes(signature))))
  const node = await getDerivedNode(seed, network, path)

  return node
}

export type GetMetaMaskAddressesOptions = {
  path: string
  network: Network
}
