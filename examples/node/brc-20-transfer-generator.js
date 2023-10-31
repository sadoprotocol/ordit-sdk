import { BRC20TransferGenerator, JsonRpcDatasource, Ordit } from '@sadoprotocol/ordit-sdk'

const network = 'regtest'
const wallet = new Ordit({
    bip39: '<mnemonic>',
    network
})
wallet.setDefaultAddress('taproot')
const datasource = new JsonRpcDatasource({ network })

async function main() {
    const tx = new BRC20TransferGenerator({
        address: wallet.selectedAddress,
        pubKey: wallet.publicKey,
        feeRate: 3,
        network,
        tick: 'TEST',
        amount: 10
    })

    const revealData = await tx.reveal()
    console.log({ revealData })

    // generate transfer inscription
    const hex = await tx.generate()

    if(hex) {
        const signedTxHex = wallet.signPsbt(hex, { isRevealTx: true })
        const txId = await datasource.relay({ hex: signedTxHex })
        console.log({ txId })
    }
}

main()