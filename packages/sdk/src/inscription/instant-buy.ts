import * as bitcoin from "bitcoinjs-lib"

import {
  AddressFormats,
  addressNameToType,
  AddressTypes,
  calculateTxFee,
  getAddressesFromPublicKey,
  getNetwork,
  InputType,
  OrditApi,
  processInput
} from ".."
import { Network } from "../config/types"
import { MINIMUM_AMOUNT_IN_SATS } from "../constants"

export async function generateSellerPsbt({
  inscriptionOutPoint,
  price,
  receiveAddress,
  publicKey,
  pubKeyType,
  network = "testnet"
}: GenerateSellerInstantBuyPsbtOptions) {
  const {
    inputs: [input],
    outputs: [output]
  } = await getSellerInputsOutputs({
    inscriptionOutPoint,
    price,
    receiveAddress,
    publicKey,
    pubKeyType,
    network
  })

  const networkObj = getNetwork(network)
  const psbt = new bitcoin.Psbt({ network: networkObj })

  psbt.addInput(input)
  psbt.addOutput(output)

  return psbt
}

export async function generateBuyerPsbt({
  publicKey,
  pubKeyType,
  feeRate = 10,
  network = "testnet",
  sellerPsbt,
  inscriptionOutPoint
}: GenerateBuyerInstantBuyPsbtOptions) {
  const networkObj = getNetwork(network)
  const format = addressNameToType[pubKeyType]
  const address = getAddressesFromPublicKey(publicKey, network, format)[0]
  let postage = 10000 // default postage
  let ordOutNumber = 0
  // get postage from outpoint

  try {
    const [ordTxId, ordOut] = inscriptionOutPoint.split(":")
    if (!ordTxId || !ordOut) {
      throw new Error("Invalid outpoint.")
    }

    ordOutNumber = parseInt(ordOut)
    const { tx } = await OrditApi.fetchTx({ txId: ordTxId, network })
    if (!tx) {
      throw new Error("Failed to get raw transaction for id: " + ordTxId)
    }

    const output = tx && tx.vout[ordOutNumber]

    if (!output) {
      throw new Error("Outpoint not found.")
    }

    postage = parseInt((output.value * 1e8).toString())
  } catch (error) {
    throw new Error(error.message)
  }

  const { totalUTXOs, spendableUTXOs } = await OrditApi.fetchUnspentUTXOs({ address: address.address!, network })
  if (!totalUTXOs) {
    throw new Error("No UTXOs found.")
  }

  const psbt = new bitcoin.Psbt({ network: networkObj })

  // find refundableUTXOs utxos
  const refundableUTXOs = spendableUTXOs.reduce((acc, cur) => {
    if (cur.sats >= MINIMUM_AMOUNT_IN_SATS) {
      acc.push(cur)
    }
    return acc
  }, [])

  if (refundableUTXOs.length < 2 || !spendableUTXOs.length) {
    throw new Error("No suitable UTXOs found.")
  }

  let totalInput = 0

  const witnessScripts: Buffer[] = []
  const usedUTXOTxIds: string[] = []
  for (const [i] of Array.from({ length: 2 }).entries()) {
    const refundableUTXO = refundableUTXOs[i]
    if (usedUTXOTxIds.includes(refundableUTXO.txid)) continue

    const input = await processInput({ utxo: refundableUTXO, pubKey: publicKey, network })

    usedUTXOTxIds.push(input.hash)
    psbt.addInput(input)
    totalInput += refundableUTXO.sats
  }

  // Add refundable output
  psbt.addOutput({
    address: address.address!,
    value: refundableUTXOs[0].sats + refundableUTXOs[1].sats
  })

  // Add ordinal output
  psbt.addOutput({
    address: address.address!,
    value: postage
  })

  // seller psbt merge

  const decodedSellerPsbt = bitcoin.Psbt.fromHex(sellerPsbt, { network: networkObj })
  // inputs
  ;(psbt.data.globalMap.unsignedTx as any).tx.ins[2] = (decodedSellerPsbt.data.globalMap.unsignedTx as any).tx.ins[0]
  psbt.data.inputs[2] = decodedSellerPsbt.data.inputs[0]
  // outputs
  ;(psbt.data.globalMap.unsignedTx as any).tx.outs[2] = (decodedSellerPsbt.data.globalMap.unsignedTx as any).tx.outs[0]
  psbt.data.outputs[2] = decodedSellerPsbt.data.outputs[0]

  for (const utxo of spendableUTXOs) {
    if (usedUTXOTxIds.includes(utxo.txid)) continue

    const input = await processInput({ utxo, pubKey: publicKey, network })
    input.witnessUtxo?.script && witnessScripts.push(input.witnessUtxo?.script)

    usedUTXOTxIds.push(input.hash)

    psbt.addInput(input)
    totalInput += utxo.sats
  }

  const fee = calculateTxFee({
    totalInputs: psbt.txInputs.length,
    totalOutputs: psbt.txOutputs.length,
    satsPerByte: feeRate,
    type: pubKeyType,
    additional: { witnessScripts }
  })

  const totalOutput = psbt.txOutputs.reduce((partialSum: number, a: any) => partialSum + a.value, 0)

  const changeValue = totalInput - totalOutput - fee
  if (changeValue < 0) {
    throw new Error("Insufficient funds to buy this inscription")
  }

  if (changeValue > 580) {
    psbt.addOutput({
      address: address.address!,
      value: changeValue
    })
  }

  return psbt
}

export async function generateRefundableUTXOs({
  publicKey,
  pubKeyType,
  feeRate,
  count = 2,
  destination,
  network = "testnet",
  enableRBF = true
}: GenerateRefundableUTXOsOptions) {
  const networkObj = getNetwork(network)
  const format = addressNameToType[pubKeyType]
  const address = getAddressesFromPublicKey(publicKey, network, format)[0]
  const finalCount =
    destination && destination.length ? destination.reduce((acc, curr) => (acc += curr.count), 0) : count

  if (!finalCount) {
    throw new Error("count or destination should be more than 2")
  }

  const { totalUTXOs, spendableUTXOs } = await OrditApi.fetchUnspentUTXOs({ address: address.address!, network })
  if (!totalUTXOs) {
    throw new Error("No UTXOs found.")
  }

  const utxo = spendableUTXOs.sort((a, b) => b.sats - a.sats)[0] // Largest UTXO
  const psbt = new bitcoin.Psbt({ network: networkObj })
  const witnessScripts: Buffer[] = []
  const input = await processInput({ utxo, pubKey: publicKey, network })

  input.witnessUtxo?.script && witnessScripts.push(input.witnessUtxo?.script)
  psbt.addInput(input)

  if (enableRBF) {
    psbt.setInputSequence(0, 0xfffffffd) // hardcoded index because input is just one
  }

  const fees = calculateTxFee({
    totalInputs: 1,
    totalOutputs: finalCount,
    satsPerByte: feeRate,
    type: pubKeyType,
    additional: { witnessScripts }
  })

  const remainingSats = utxo.sats - fees
  const perUTXOSats = Math.floor(remainingSats / finalCount)
  if (perUTXOSats < MINIMUM_AMOUNT_IN_SATS) {
    throw new Error(
      `Not enough sats to generate ${finalCount} UTXOs with at least ${MINIMUM_AMOUNT_IN_SATS} sats per UTXO. Try decreasing the count or deposit more BTC`
    )
  }

  destination =
    destination && destination.length
      ? destination
      : [
          {
            address: address.address!,
            count: finalCount
          }
        ]

  const receivers: { address: string; cardinals: number }[] = destination.reduce((acc, cur) => {
    const receiver = Array.from({ length: cur.count }).fill({
      address: cur.address,
      cardinals: perUTXOSats
    }) as { address: string; cardinals: number }[]

    acc.push(...receiver)

    return acc
  }, [])

  receivers.forEach((output) => {
    psbt.addOutput({
      address: output.address,
      value: output.cardinals
    })
  })

  return psbt.toHex()
}

export async function getSellerInputsOutputs({
  inscriptionOutPoint,
  price,
  receiveAddress,
  publicKey,
  pubKeyType = "taproot",
  network = "testnet"
}: GenerateSellerInstantBuyPsbtOptions) {
  const format = addressNameToType[pubKeyType]
  const [address] = getAddressesFromPublicKey(publicKey, network, format)

  const { totalUTXOs, unspendableUTXOs } = await OrditApi.fetchUnspentUTXOs({
    address: address.address!,
    network,
    type: "all"
  })
  if (!totalUTXOs) {
    throw new Error("No UTXOs found")
  }

  const utxo = unspendableUTXOs.find((utxo) => utxo.inscriptions?.find((i) => i.outpoint === inscriptionOutPoint))
  if (!utxo) {
    throw new Error("Inscription not found")
  }

  const input = await processInput({
    utxo,
    pubKey: publicKey,
    network,
    sighashType: bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY
  })

  const inputs: InputType[] = [input]
  const outputs = [{ address: receiveAddress, value: price + utxo.sats }]

  return { inputs, outputs }
}

export interface UnspentOutput {
  txId: string
  outputIndex: number
  satoshis: number
  scriptPk: string
  addressType: AddressTypes
  address: string
  ords: {
    id: string
    offset: number
  }[]
}

export interface GenerateSellerInstantBuyPsbtOptions {
  inscriptionOutPoint: string
  price: number
  receiveAddress: string
  publicKey: string
  pubKeyType?: AddressFormats
  network?: Network
}

export interface GenerateBuyerInstantBuyPsbtOptions {
  publicKey: string
  pubKeyType: AddressFormats
  network?: Network
  feeRate?: number
  inscriptionOutPoint: string
  sellerPsbt: string
}

export interface GenerateRefundableUTXOsOptions {
  count?: number
  publicKey: string
  pubKeyType: AddressFormats
  destination?: {
    address: string
    count: number
  }[]
  network?: Network
  feeRate: number
  enableRBF?: boolean
}
