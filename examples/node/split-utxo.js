import { JsonRpcDatasource } from "@sadoprotocol/ordit-sdk"
import { Ordit } from "@sadoprotocol/ordit-sdk"
import { UTXOManager } from "@sadoprotocol/ordit-sdk"

const MNEMONIC = "<mnemonic>"

const network = "regtest"
const wallet = new Ordit({
  bip39: MNEMONIC,
  network
})
wallet.setDefaultAddress("segwit", { addressIndex: 0, accountIndex: 0 })

async function splitUTXOIntoRefundable() {
  const datasource = new JsonRpcDatasource({ network })
  const utxoManager = new UTXOManager({
    address: wallet.selectedAddress,
    network,
    datasource,
    publicKey: wallet.publicKey,
    feeRate: 3
  })
  await utxoManager.splitUTXOIntoRefundable({ n: 3 })

  const hex = utxoManager.toHex()
  const signedTxHex = wallet.signPsbt(hex)
  console.log({ signedTxHex })
  // const txId = await datasource.relay({ hex: signedTxHex })
  // console.log({ txId })
}

splitUTXOIntoRefundable()
