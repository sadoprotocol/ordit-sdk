import { JsonRpcDatasource } from "@sadoprotocol/ordit-sdk";
import { Inscriber, Ordit } from "@sadoprotocol/ordit-sdk"

const MNEMONIC = "<mnemonic>"
const network = "testnet"
const datasource = new JsonRpcDatasource({ network })

async function main() {
  // init wallet
  const wallet = new Ordit({
    bip39: MNEMONIC,
    network
  });

  wallet.setDefaultAddress('taproot')

  // new inscription tx
  const transaction = new Inscriber({
    network,
    address: wallet.selectedAddress,
    publicKey: wallet.publicKey,
    changeAddress: wallet.selectedAddress,
    destination: wallet.selectedAddress,
    mediaContent: 'Hello World',
    mediaType: "text/plain",
    feeRate: 3,
    meta: { // Flexible object: Record<string, any>
      title: "Example title",
      desc: "Lorem ipsum",
      slug: "cool-digital-artifact",
      creator: {
        name: "Your Name",
        email: "artist@example.org",
        address: wallet.selectedAddress
      }
    },
    postage: 1500 // base value of the inscription in sats
  })

  transaction.withParent({
    txid: '17541f6adf6eb160d52bc6eb0a3546c7c1d2adfe607b1a3cddc72cc0619526ad',
    index: 0
  })
  
  // generate deposit address and fee for inscription
  const revealed = await transaction.generateCommit();
  console.log(revealed) // deposit revealFee to address

  // confirm if deposit address has been funded
  const ready = await transaction.isReady();

  if (ready || transaction.ready) {
    // build transaction
    await transaction.build();

    // sign transaction
    const signedTxHex = wallet.signPsbt(transaction.toHex(), { isRevealTx: true });

    // Broadcast transaction
    const tx = await datasource.relay({ hex: signedTxHex });
    console.log(tx);
  }
}

main();
