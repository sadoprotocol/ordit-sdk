import { bulkMintFromCollection, InscriberV2, JsonRpcDatasource } from "@sadoprotocol/ordit-sdk"
import { Inscriber, Ordit } from "@sadoprotocol/ordit-sdk"

const MNEMONIC = "<mnemonic>"
const network = "testnet"
const datasource = new JsonRpcDatasource({ network })

async function main() {
  // init wallet
  const serverWallet = new Ordit({
    bip39: MNEMONIC,
    network
  })

  serverWallet.setDefaultAddress("taproot")

  const ordinalReceiverAddress = "<address>"
  const paymentRefundAddress = "<address>"

  // new inscription tx
  const transaction = await bulkMintFromCollection({
    address: serverWallet.selectedAddress,
    publicKey: serverWallet.publicKey,
    publisherAddress: serverWallet.selectedAddress,
    collectionGenesis: "df91a6386fb9b55bd754d6ec49e97e1be4c80ac49e4242ff773634e4c23cc427",
    changeAddress: paymentRefundAddress,
    feeRate: 10,
    outputs: [{ address: ordinalReceiverAddress, value: 999 }],
    network,
    datasource,
    taptreeVersion: "3",
    inscriptions: [
      {
        mediaContent: "Hello World",
        mediaType: "text/plain",
        postage: 1000,
        nonce: 0,
        receiverAddress: ordinalReceiverAddress,
        iid: "testhello",
        signature: "sig"
      }
    ]
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

main()
