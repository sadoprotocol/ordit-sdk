import { Ordit } from "@sadoprotocol/ordit-sdk"; //import Ordit
import { base64_encode } from "./utils";

const WORDS = "<MNEMONIC WORDS>"; // Generated HD wallet seed phrase
const IMG_BASE64 = base64_encode("./azuki-small-compressed.png"); // relative path to image

async function main() {
  // Load wallet
  const wallet = new Ordit({
    bip39: WORDS,
    network: "mainnet"
  });

  // new ordinal transaction
  const transaction = Ordit.inscription.new({
    publicKey: wallet.taprootPublicKey,
    changeAddress: wallet.selectedAddress,
    destination: wallet.selectedAddress,
    mediaContent: IMG_BASE64,
    mediaType: "image/png",
    feeRate: 15,
    meta: {
      title: "Elemental",
      desc: "Azuki Elementals are a collection of 20,000 characters within the four domains of the Garden.",
      slug: "elemental",
      traits: [
        {
          traitType: "Hair",
          value: "Electrified Long - Black"
        },
        {
          traitType: "Offhand",
          value: "Elemental Blade - Lightning"
        },
        {
          traitType: "Eyes",
          value: "Enticing"
        },
        {
          traitType: "Type",
          value: "Blue"
        }
      ],
      creator: {
        name: "TheArtist",
        email: "artist@example.org",
        address: wallet.selectedAddress
      }
    },
    network: "mainnet",
    postage: 1500
  });

  //   //   Get deposit address and fee for inscription
  const depositDetails = transaction.generateCommit();
  console.log(depositDetails);
  //   // {
  //   //   address: "<DEPOSIT_ADDRESS>",
  //   //   revealFee: 23456,
  //   // }

  //   // confirm if deposit address has been funded
  const ready = await transaction.isReady(); //- true/false

  if (ready || transaction.ready) {
    // build transaction
    transaction.build();

    // sign transaction
    const psbtHex = transaction.toHex();
    const sig = wallet.signPsbt(psbtHex);
    // console.log(JSON.stringify(sig, null, 2))
    // Broadcast transaction
    const submittedTx = await wallet.relayTx(sig.hex, "mainnet");
    console.log(submittedTx);
    //{"txid": "<TX_ID>"}
  }
}

main();
