import { JsonRpcDatasource } from "@sadoprotocol/ordit-sdk";
import { Ordit } from "@sadoprotocol/ordit-sdk";
import { UTXOManager } from "@sadoprotocol/ordit-sdk";

const network  = 'testnet'
const wallet = new Ordit({
  bip39: '<mnemonic>',
  network
})
wallet.setDefaultAddress('taproot')

async function main() {
  const datasource = new JsonRpcDatasource({ network })
  const utxoManager = new UTXOManager({
    address: wallet.selectedAddress,
    network,
    publicKey: wallet.publicKey,
    feeRate: 3
  })

  await utxoManager.splitUTXOForInstantTrade()
  const hex = utxoManager.toHex()
  const signedTxHex = wallet.signPsbt(hex)
  const txId = await datasource.relay({ hex: signedTxHex })
  console.log({ txId })
}

main()