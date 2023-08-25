import { mintFromCollection, Ordit, OrdTransaction } from "@sadoprotocol/ordit-sdk"

const MNEMONIC = "<MNEMONIC>"

async function main() {
  // init wallet
  const wallet = new Ordit({
    bip39: MNEMONIC,
    network: "testnet"
  })
  wallet.setDefaultAddress("taproot")

  const mediaFromIpfs = await fetch(
    "https://content.sado.space/ipfs/bafkreiebrfkw6k4tjnafqwsvega635hh7q7vsqrcxyxkmtmo4463wipfme",
    {
      responseType: "arraybuffer"
    }
  )

  const mediaArrayBuffer = await mediaFromIpfs.arrayBuffer()
  const mediaBuffer = Buffer.from(mediaArrayBuffer, "binary")
  const mediaBufferString = mediaBuffer.toString("base64")

  const feeRate = 10
  const postage = 1000
  const assetPrice = 1000

  // new inscription tx
  const transaction = await mintFromCollection({
    publicKey: wallet.publicKey,
    postage,
    feeRate,
    mediaContent: mediaBufferString,
    mediaType: "image/png",
    destination: wallet.selectedAddress,
    changeAddress: wallet.selectedAddress,
    nonce: 9,
    collectionOutpoint: `1db64c2d3e6dd9cecb16b3a184fdf112c8c180f33b8eb3d2b08b7f1ab10d0ed3:0`,
    inscriptionIid: "catonly #1",
    publisherIndex: 0,
    signature: "G5Z5V0AdgKSRAB7HNF0TcDo8EwtGRRXAE8JG7Pdrqaj2S2rS+f4muV1zPbcfauw3RGlYYkKo00OmLCEtVuGv7o0=",
    outs: [{ address: wallet.selectedAddress, value: assetPrice }],
    network: "testnet"
  })

  const estimatedFeeFn = OrdTransaction.estimateRevealFee({
    contentSize: mediaBuffer.length,
    contentType: "image/png",
    meta: transaction.meta,
    feeRate
  })

  console.log({ estimatedFeeFn })

  // generate deposit address and fee for inscription
  const revealed = transaction.generateCommit()
  console.log(revealed) // deposit revealFee to address

  console.log({ difference: revealed.revealFee - postage - assetPrice - estimatedFeeFn })

  //
  // // confirm if deposit address has been funded
  // const ready = await transaction.isReady();
  //
  // if (ready || transaction.ready) {
  //     // build transaction
  //     transaction.build();
  //
  //     // sign transaction
  //     const signature = wallet.signPsbt(transaction.toHex(), { isRevealTx: true });
  //
  //     // Broadcast transaction
  //     const tx = await wallet.relayTx(signature, "testnet");
  //     console.log(tx);
  // }
}

main()
