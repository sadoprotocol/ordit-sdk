import { BRC20Deploy, JsonRpcDatasource, Ordit } from '@sadoprotocol/ordit-sdk'

const network = 'regtest'
const wallet = new Ordit({
    bip39: '<mnemonic>',
    network
})
wallet.setDefaultAddress('taproot')
const datasource = new JsonRpcDatasource({ network })

async function main() {
    const tx = new BRC20Deploy({
        address: wallet.selectedAddress,
        pubKey: wallet.publicKey,
        destinationAddress: wallet.selectedAddress,
        feeRate: 2,
        network: 'regtest',
        tick: 'TEST',
        supply: 1000000000,
        limit: 100,
    })

    const revealData = await tx.reveal()
    console.log({ revealData })

    const hex = await tx.deploy()
    const signedTxHex = wallet.signPsbt(hex, { isRevealTx: true })
    const txId = await datasource.relay({ hex: signedTxHex })

    console.log({ txId })
}

main()