import { BRC20Mint, JsonRpcDatasource, Ordit } from '@sadoprotocol/ordit-sdk'

const network = 'regtest'
const wallet = new Ordit({
    bip39: '<mnemonic>',
    network
})
wallet.setDefaultAddress('taproot')
const datasource = new JsonRpcDatasource({ network })

async function main() {
    const tx = new BRC20Mint({
        address: wallet.selectedAddress,
        pubKey: wallet.publicKey,
        destinationAddress: wallet.selectedAddress,
        feeRate: 2,
        network,
        tick: 'TEST',
        amount: 100
    })

    const revealData = await tx.reveal()
    console.log({ revealData })

    const hex = await tx.mint()
    if(!hex) return

    const signedTxHex = wallet.signPsbt(hex, { isRevealTx: true })
    const txId = await datasource.relay({ hex: signedTxHex })

    console.log({ txId })
}

main()