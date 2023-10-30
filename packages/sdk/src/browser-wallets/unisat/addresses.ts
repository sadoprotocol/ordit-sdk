import { getAddressFormat } from "../.."
import { Network } from "../../config/types"
import { isUnisatInstalled, UnisatNetwork } from "./utils"

export async function getAddresses(network: Network, readOnly?: boolean) {
  if (!isUnisatInstalled()) {
    throw new Error("Unisat not installed.")
  }

  if (!network) {
    throw new Error("Invalid options provided.")
  }

  let targetNetwork: UnisatNetwork = "livenet"
  const connectedNetwork = await window.unisat.getNetwork()

  if (network === "testnet") {
    targetNetwork = network
  }

  if (connectedNetwork !== targetNetwork) {
    await window.unisat.switchNetwork(targetNetwork)
  }

  const accounts = readOnly ? await window.unisat.getAccounts() : await window.unisat.requestAccounts()
  const publicKey = await window.unisat.getPublicKey()

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
