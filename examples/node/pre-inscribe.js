import {
  JsonRpcDatasource,
  Ordit,
  bulkMintFromCollection,
  PSBTBuilder,
  PreInscriber,
  decodePSBT,
  UTXOManager
} from "@sadoprotocol/ordit-sdk"

const MNEMONIC_SELLER = "<mnemonic>"
const MNEMONIC_BUYER = "<mnemonic>"
const network = "regtest"
const chain = "bitcoin"
const datasource = new JsonRpcDatasource({ network })

// init wallet
const sellerWallet = new Ordit({
  bip39: MNEMONIC_SELLER,
  network,
  chain
})
sellerWallet.setDefaultAddress("segwit", { addressIndex: 0, accountIndex: 0 })

const buyerWallet = new Ordit({
  bip39: MNEMONIC_BUYER,
  network,
  chain
})
buyerWallet.setDefaultAddress("taproot", { addressIndex: 0, accountIndex: 3 })
const buyerWalletTaprootAddress = buyerWallet.selectedAddress
buyerWallet.setDefaultAddress("segwit", { addressIndex: 0, accountIndex: 3 })

// image/png
const pngImage =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABVQTFRFJCQk3NjMAAAAqJiWbmNjMjExDw4Op1iMBgAAAXNJREFUeNrslwuShCAMROkhev8jjyThjxiL2XVrayKloubRhIDqXovm/iJgdzPjRwioABDzEUBE7tjCTvcFgPTpEUAOcwCS1QB/H4AS4L0vAEPbd74BLnxABvhgpQJpu2pc0YgbSoBBQbzFTV8CKFsPMCgoQpg60ShoYtAOo/rSCNAMwxAw7YIJMAuiBUDUS/hdBSnZ1NcCqOaCjJIOttTuKYBDkTFanQPqROKGG8BgNp4p8ClhU9Zmf38aA18TTqzy74IImdYzA2YxuG29ggUAFgHrXWAjow0BIZGc0egsE1cALGIB8C+6gMe7EAGQZaxcDm8pgPrFZSwti7Ears9ikACoPgVcWqFwkQdZQfasAJdB1BjEd0HfhW8q/1gqy8v1UQVfwBCADVuYABufh5kQqzYAXzoYXA63LZxx9ZYCLlmLlB7AK8GJggBQLS4BxGEOkHZVvcRAO2METEehBXxqGK3WAV75n9T6w5scnv/5fgswAO3WEmd/piDfAAAAAElFTkSuQmCC"
const ordzaarPassType = "image/png"

// used for minting initial inscriptions
async function inscribeBulk() {
  // map and create 20 inscriptions
  const inscriptionsToMint = new Array(100).fill(0).map((_, i) => ({
    mediaContent: pngImage,
    mediaType: ordzaarPassType,
    postage: 600,
    nonce: i,
    receiverAddress: sellerWallet.selectedAddress,
    iid: i.toString(),
    signature: "sig"
  }))

  // new inscription tx
  const transaction = await bulkMintFromCollection({
    address: serverWallet.selectedAddress,
    publicKey: serverWallet.publicKey,
    publisherAddress: serverWallet.selectedAddress,
    collectionGenesis: "df91a6386fb9b55bd754d6ec49e97e1be4c80ac49e4242ff773634e4c23cc427",
    changeAddress: sellerWallet.selectedAddress,
    feeRate: 10,
    outputs: [],
    network,
    datasource,
    taptreeVersion: "3",
    inscriptions: inscriptionsToMint
  })

  // generate deposit address and fee for inscription
  const revealed = await transaction.generateCommit()
  console.log(revealed) // deposit revealFee to address

  // confirm if deposit address has been funded
  const ready = await transaction.isReady()

  if (ready || transaction.ready) {
    // build transaction
    await transaction.build()

    // sign transaction
    const signedTxHex = serverWallet.signPsbt(transaction.toHex(), { isRevealTx: true })

    // Broadcast transaction
    const tx = await datasource.relay({ hex: signedTxHex })
    console.log(tx)
  }
}

async function preinscribe() {
  const psbt1 = await PreInscriber.createInscriptionPSBT({
    inscriptionId: "dec9881438b8c30423fe6e81ef008a328e2393f53d23873aac5b824acd701edci12",
    sellerPublicKey: sellerWallet.publicKey,
    sellerAddress: sellerWallet.selectedAddress,
    receivePaymentAddress: sellerWallet.selectedAddress,
    inscriptionPrice: 1000,
    datasource,
    network,
    chain
  })
  const psbt2 = await PreInscriber.createInscriptionPSBT({
    inscriptionId: "dec9881438b8c30423fe6e81ef008a328e2393f53d23873aac5b824acd701edci13",
    sellerPublicKey: sellerWallet.publicKey,
    sellerAddress: sellerWallet.selectedAddress,
    receivePaymentAddress: sellerWallet.selectedAddress,
    inscriptionPrice: 1000,
    datasource,
    network,
    chain
  })
  const signedPsbtHex1 = sellerWallet.signPsbt(psbt1.base64, { finalize: false, extractTx: false, isRevealTx: true })
  const signedPsbt = decodePSBT({ hex: signedPsbtHex1 })
  const signedPsbtHex2 = sellerWallet.signPsbt(psbt2.base64, { finalize: false, extractTx: false, isRevealTx: true })
  const signedPsbt2 = decodePSBT({ hex: signedPsbtHex2 })

  const extraOutputs = [{ address: buyerWalletTaprootAddress, value: 999 }]

  // include multiple signed psbt at the same txs
  const bulkMint = new PreInscriber({
    buyerAddress: buyerWallet.selectedAddress,
    datasource,
    feeRate: 3,
    network,
    publicKey: buyerWallet.publicKey,
    inscriptionB64Psbts: [signedPsbt.toBase64(), signedPsbt2.toBase64()],
    extraOutputs,
    receiveAddress: buyerWalletTaprootAddress
  })

  await bulkMint.build()
  const psbtHex = bulkMint.toBase64()
  console.dir({ psbtHex }, { depth: null })
  const signedTxHex = buyerWallet.signPsbt(bulkMint.toHex(), { finalize: true, extractTx: true, isRevealTx: false })
  console.log({ signedTxHex })

  // const txId = await datasource.relay({ hex: signedTxHex })
  // console.log({ txId })
}

async function splitUtxo() {
  const utxoManager = new UTXOManager({
    address: buyerWallet.selectedAddress,
    network,
    publicKey: buyerWallet.publicKey,
    feeRate: 3
  })
  await utxoManager.splitUTXOIntoRefundable({ n: 3 })
  const hex = utxoManager.toHex()
  const signedTxHex = buyerWallet.signPsbt(hex)
  console.log({ signedTxHex })
}

async function send() {
  const psbtBuilder = new PSBTBuilder({
    network,
    chain,
    datasource,
    feeRate: 3,
    address: sellerWallet.selectedAddress,
    publicKey: sellerWallet.publicKey,
    outputs: [
      { address: buyerWallet.selectedAddress, value: 600 },
      { address: buyerWallet.selectedAddress, value: 600 },
      { address: buyerWallet.selectedAddress, value: 600 },
      { address: buyerWallet.selectedAddress, value: 600 }
    ]
  })

  await psbtBuilder.prepare()

  const signedHex = sellerWallet.signPsbt(psbtBuilder.toHex())
  console.log({ signedHex })
}

// Utils functions

// inscribeBulk()
// splitUtxo()
// send()

// main function
preinscribe()
