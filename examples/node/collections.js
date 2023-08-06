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

  const depositDetails = transaction.generateCommit();
  console.log(depositDetails);

  //   // confirm if deposit address has been funded
  const ready = await transaction.isReady(); //- true/false

  if (ready || transaction.ready) {
    // build transaction
    transaction.build();

    // sign transaction
    const psbtHex = transaction.toHex();
    const sig = wallet.signPsbt(psbtHex, { isRevealTx: true });
    // console.log(JSON.stringify(sig, null, 2))
    // Broadcast transaction
    const submittedTx = await wallet.relayTx(sig, "testnet");
    console.log(submittedTx);
    //{"txid": "<TX_ID>"}
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
  // pubWallet.setDefaultAddress("taproot");

  // details of mint
  const col = "04a0d2c4215607f2a16a5a458d0bd8e0528de0b7990bd9d52659d7d5c6263a54:0";
  const sigMsg = `${col} el-01 1`; // COLLECTION_OUT INSCRIPTION_IID NONCE
  const sig = pubWallet.signMessage(sigMsg);

  pubWallet.setDefaultAddress("taproot");
  //publish
  const transaction = await Ordit.collection.mint({
    collectionOutpoint: col,
    inscriptionIid: "el-01",
    nonce: 1,
    publisherIndex: 0,
    signature: sig,
    publicKey: userWallet.publicKey,
    destination: userWallet.selectedAddress,
    changeAddress: userWallet.selectedAddress,
    postage: 1000,
    mediaContent: IMG_BASE64,
    mediaType: "image/png",
    outs: [{address: 'tb1pk6yxhcwzzjg9gwsumnlrh3l9q3ajxk657e7kqwmwpd8mklmnmehsrn3hu2', value: 1000}]
  });

  const depositDetails = transaction.generateCommit();
  console.log(depositDetails);

  //   // confirm if deposit address has been funded
  const ready = await transaction.isReady(); //- true/false

  if (ready || transaction.ready) {
    // build transaction
    transaction.build();

    // sign transaction
    const psbtHex = transaction.toHex();
    const sig = userWallet.signPsbt(psbtHex, { isRevealTx: true });
    // console.log(JSON.stringify(sig, null, 2))
    // Broadcast transaction
    const submittedTx = await userWallet.relayTx(sig, "testnet");
    console.log(submittedTx);
    //{"txid": "<TX_ID>"}
  }
}

publish();
mint();
