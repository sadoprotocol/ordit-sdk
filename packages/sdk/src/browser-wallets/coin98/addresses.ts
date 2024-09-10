import { getAddressFormat } from "../.."
import { Network } from "../../config/types"
import { isCoin98Installed, UnisatNetwork } from "./utils"

export async function getAddresses(network: Network) {
  if (!isCoin98Installed()) {
    throw new Error("Coin98 not installed")
  }

  if (!network) {
    throw new Error("Invalid options provided")
  }

  let targetNetwork: UnisatNetwork = "livenet"
  const connectedNetwork = await window.coin98.bitcoin.getNetwork()

  if (network === "testnet") {
    targetNetwork = network
  }

  if (connectedNetwork !== targetNetwork) {
    await window.coin98.bitcoin.switchNetwork(targetNetwork)
  }

  const accounts = await window.coin98.bitcoin.requestAccounts()
  const publicKey = await window.coin98.bitcoin.getPublicKey()

  if (!accounts[0]) {
    return []
  }

  const formatObj = getAddressFormat(accounts[0], network)

  return [
    {
      pub: publicKey,
      address: formatObj.address,
      format: formatObj.format
    }
  ]
}
