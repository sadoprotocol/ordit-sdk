import { Ordit } from "@sadoprotocol/ordit-sdk";

const WORDS = "<MNEMONIC PHRASE>";

async function publish() {
  // Load wallet
  const wallet = new Ordit({
    bip39: WORDS,
    network: "testnet"
  });

  //set default taproot
  wallet.setDefaultAddress("taproot");

  //publish
  const transaction = await Ordit.collection.publish({
    network: "testnet",
    feeRate: 2,
    title: "Collection Name",
    description: "Lorem ipsum something else",
    slug: "collection-name",
    creator: {
      address: wallet.selectedAddress,
      email: "your-email@example.com",
      name: "Your Name"
    },
    publishers: ["<publisher-legacy-address>"],
    inscriptions: [
      {
        iid: "el-01",
        lim: 10,
        sri: "sha256-Ujac9y464/qlFmtfLDxORaUtIDH8wrHgv8L9bpPeb28="
      },
      {
        iid: "el-02",
        lim: 2,
        sri: "sha256-zjQXDuk++5sICrObmfWqAM5EibidXd2emZoUcU2l5Pg="
      }
    ],
    url: "https://example.com",
    publicKey: wallet.publicKey,
    destination: wallet.selectedAddress,
    changeAddress: wallet.selectedAddress,
    postage: 1000,
    mediaContent: 'Collection Name', // this will be inscribed on-chain as primary content
    mediaType: "text/plain"
  });

  const depositDetails = await transaction.generateCommit();
  console.log(depositDetails);

  // confirm if deposit address has been funded
  const ready = await transaction.isReady(); //- true/false
  
  if (ready || transaction.ready) {
    // build transaction
    await transaction.build();

    // sign transaction
    const signedTx = wallet.signPsbt(transaction.toHex(), { isRevealTx: true });

    // Broadcast transaction
    const txId = await wallet.relayTx(signedTx, "testnet");
    console.log({ txId });
  }
}

async function mint() {
  // Load wallet
  const userWallet = new Ordit({
    bip39: "<MNEMONIC PHRASE>",
    network: "testnet"
  });

  const pubWallet = new Ordit({
    bip39: "<MNEMONIC PHRASE>",
    network: "testnet"
  });

  //set default taproot
  userWallet.setDefaultAddress("taproot");
  pubWallet.setDefaultAddress("legacy");

  // details of mint
  const collectionId = "94cd24aede3294ba0d6aac135a9b1701ae63ac12b1205567627246ea4091f553:0";
  const sigMsg = `${collectionId.split(":")[0]} el-01 1`; // COLLECTION_OUT INSCRIPTION_IID NONCE
  const sig = pubWallet.signMessage(sigMsg);
  
  //publish
  const transaction = await Ordit.collection.mint({
    network: "testnet",
    collectionOutpoint: collectionId,
    inscriptionIid: "el-01",
    nonce: 1,
    publisherIndex: 0,
    signature: sig,
    publicKey: userWallet.publicKey,
    destination: userWallet.selectedAddress,
    changeAddress: userWallet.selectedAddress,
    postage: 1000,
    feeRate: 2,
    mediaContent: 'Sample content',
    mediaType: "text/plain",
    outs: [{address: 'tb1pk6yxhcwzzjg9gwsumnlrh3l9q3ajxk657e7kqwmwpd8mklmnmehsrn3hu2', value: 1000}]
  });

  const depositDetails = await transaction.generateCommit();
  console.log(depositDetails);

  // confirm if deposit address has been funded
  const ready = await transaction.isReady(); //- true/false

  if (ready || transaction.ready) {
    // build transaction
    await transaction.build();

    // sign transaction
    const psbtHex = transaction.toHex();
    const signedTx = userWallet.signPsbt(psbtHex, { isRevealTx: true });
    // Broadcast transaction
    const txId = await userWallet.relayTx(signedTx, "testnet");
    console.log({ txId });
  }
}

publish();
mint();
