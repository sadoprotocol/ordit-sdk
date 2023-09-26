import * as ecc from "@bitcoinerlab/secp256k1"
import BIP32Factory, { BIP32Interface } from "bip32"
import { mnemonicToSeedSync } from "bip39"
import * as bitcoin from "bitcoinjs-lib"
import { isTaprootInput } from "bitcoinjs-lib/src/psbt/bip371"
import { sign } from "bitcoinjs-message"
import ECPairFactory, { ECPairInterface } from "ecpair"

import {
  Account,
  AddressFormats,
  addressNameToType,
  getAccountDataFromHdNode,
  getAddressesFromPublicKey,
  getAllAccountsFromHdNode,
  getNetwork,
  mintFromCollection,
  publishCollection,
  tweakSigner
} from ".."
import { Network } from "../config/types"

bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)
const bip32 = BIP32Factory(ecc)

export class Ordit {
  #network: Network = "testnet"
  //   #config;
  #initialized = false
  #keyPair: ECPairInterface | BIP32Interface
  #hdNode: BIP32Interface | null = null
  publicKey: string
  allAddresses: ReturnType<typeof getAddressesFromPublicKey> | ReturnType<typeof getAllAccountsFromHdNode> = []
  selectedAddressType: AddressFormats | undefined
  selectedAddress: string | undefined

  constructor({ wif, seed, privateKey, bip39, network = "testnet", type = "legacy" }: WalletOptions) {
    this.#network = network
    const networkObj = getNetwork(network)
    const format = addressNameToType[type]

    if (wif) {
      const keyPair = ECPair.fromWIF(wif, networkObj)
      this.#keyPair = keyPair

      this.publicKey = keyPair.publicKey.toString("hex")

      const accounts = getAddressesFromPublicKey(keyPair.publicKey, network, format)
      this.#initialize(accounts)
    } else if (privateKey) {
      const pkBuffer = Buffer.from(privateKey, "hex")
      const keyPair = ECPair.fromPrivateKey(pkBuffer, { network: networkObj })
      this.#keyPair = keyPair

      this.publicKey = keyPair.publicKey.toString("hex")

      const accounts = getAddressesFromPublicKey(keyPair.publicKey, network, format)
      this.#initialize(accounts)
    } else if (seed) {
      const seedBuffer = Buffer.from(seed, "hex")
      const hdNode = bip32.fromSeed(seedBuffer, networkObj)

      this.#hdNode = hdNode

      const accounts = getAllAccountsFromHdNode({ hdNode, network })

      const pkBuf = Buffer.from(accounts[0].priv, "hex")
      this.#keyPair = ECPair.fromPrivateKey(pkBuf, { network: networkObj })

      this.publicKey = this.#keyPair.publicKey.toString("hex")

      this.#initialize(accounts)
    } else if (bip39) {
      const seedBuffer = mnemonicToSeedSync(bip39)
      const hdNode = bip32.fromSeed(seedBuffer, networkObj)

      this.#hdNode = hdNode

      const accounts = getAllAccountsFromHdNode({ hdNode, network })
      this.#keyPair = accounts[0].child

      this.publicKey = this.#keyPair.publicKey.toString("hex")

      this.#initialize(accounts)
    } else {
      throw new Error("Invalid options provided.")
    }
  }

  get network() {
    return this.#network
  }

  set network(value: Network) {
    this.#network = value
  }

  getAddressByType(type: AddressFormats) {
    if (!this.#initialized || !this.allAddresses.length) {
      throw new Error("Wallet not fully initialized.")
    }
    const result = this.allAddresses.filter((address) => address.format === type)

    if (!result) {
      throw new Error(`Address of type ${type} not found in the instance.`)
    }

    return result
  }

  getAllAddresses() {
    if (!this.#keyPair) {
      throw new Error("Keypair not found")
    }

    return this.allAddresses
  }

  setDefaultAddress(type: AddressFormats, index = 0) {
    if (this.selectedAddressType === type) return

    const result = this.getAddressByType(type) as Account[]
    const addressToSelect = result[index]

    if (!addressToSelect) throw new Error("Address not found. Please add an address with the type and try again.")

    this.selectedAddress = addressToSelect.address
    this.publicKey = addressToSelect.pub
    this.selectedAddressType = type

    if (addressToSelect.child) {
      this.#keyPair = addressToSelect.child
    }
  }

  generateAddress(type: AddressFormats, account: number, addressIndex: number) {
    if (!this.#hdNode) throw new Error("No HD node found. Please reinitialize with BIP39 words or seed.")

    return getAccountDataFromHdNode({
      hdNode: this.#hdNode,
      format: type,
      network: this.#network,
      account,
      addressIndex
    })
  }

  signPsbt(value: string, { finalize = true, extractTx = true, isRevealTx = false }: SignPSBTOptions = {}) {
    const networkObj = getNetwork(this.#network)
    let psbt: bitcoin.Psbt | null = null

    if (!this.#keyPair || !this.#initialized) {
      throw new Error("Wallet not fully initialized.")
    }

    try {
      psbt = bitcoin.Psbt.fromHex(value)
    } catch (error) {
      psbt = bitcoin.Psbt.fromBase64(value)
    }

    if (!psbt || !psbt.inputCount) {
      throw new Error("Invalid PSBT provided.")
    }

    const inputsToSign: Input[] = []

    psbt.data.inputs.forEach((v, index) => {
      let script: any = null

      if (v.witnessUtxo) {
        script = v.witnessUtxo.script
      } else if (v.nonWitnessUtxo) {
        const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo)
        const output = tx.outs[psbt!.txInputs[index].index]

        script = output.script
      }
      const isSigned = v.finalScriptSig || v.finalScriptWitness
      if (script && !isSigned) {
        const address = bitcoin.address.fromOutputScript(script, networkObj)

        // TODO: improvise the below logic by accepting indexes to sign
        if (isRevealTx || (!isRevealTx && this.selectedAddress === address)) {
          inputsToSign.push({
            index,
            publicKey: this.publicKey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined
          })
        }
      }
    })

    if (!inputsToSign.length) {
      throw new Error("Cannot sign PSBT with no signable inputs.")
    }

    let psbtHasBeenSigned = false

    for (let i = 0; i < inputsToSign.length; i++) {
      const input = psbt.data.inputs[inputsToSign[i].index]
      psbtHasBeenSigned = input.finalScriptSig || input.finalScriptWitness ? true : false

      if (psbtHasBeenSigned) continue

      if (isTaprootInput(input)) {
        const tweakedSigner = tweakSigner(this.#keyPair, {
          network: networkObj
        })

        const signer =
          input.witnessUtxo?.script && input.tapInternalKey && !input.tapLeafScript ? tweakedSigner : this.#keyPair

        psbt.signInput(inputsToSign[i].index, signer, inputsToSign[i].sighashTypes)
      } else {
        psbt.signInput(inputsToSign[i].index, this.#keyPair, inputsToSign[i].sighashTypes)
      }
    }

    // TODO: check if psbt has been signed
    if (finalize) {
      psbt.finalizeAllInputs()
    }

    if (extractTx) {
      return psbt.extractTransaction().toHex()
    }

    return psbt.toHex()
  }

  signMessage(message: string) {
    const legacyWallet = this.allAddresses.find((wallet) => wallet.format === "legacy") as Account
    const signature = sign(message, legacyWallet.child.privateKey!, false)

    return signature.toString("base64")
  }

  static collection = {
    publish: publishCollection,
    mint: mintFromCollection
  }

  #initialize(addresses: Address[]) {
    this.allAddresses = addresses

    const addressFormat = addresses[0].format as AddressFormats
    this.selectedAddressType = addressFormat
    this.selectedAddress = addresses[0].address

    this.#initialized = true
  }
}

export type WalletOptions = {
  wif?: string
  seed?: string
  privateKey?: string
  bip39?: string
  network?: Network
  type?: AddressFormats
}

export type Address = ReturnType<typeof getAddressesFromPublicKey>[0]

export interface Input {
  index: number
  publicKey: string
  sighashTypes?: number[]
}

export interface SignPSBTOptions {
  extractTx?: boolean
  finalize?: boolean
  isRevealTx?: boolean
}
