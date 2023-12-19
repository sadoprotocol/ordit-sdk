import { BRC20TransferExecutor, JsonRpcDatasource, Ordit } from '@sadoprotocol/ordit-sdk'

const network = 'regtest'
const wallet = new Ordit({
    bip39: '<mnemonic>',
    network
})

const destWallet = new Ordit({
    bip39: '<mnemonic>',
    network
})

wallet.setDefaultAddress('taproot')
destWallet.setDefaultAddress('taproot')
const datasource = new JsonRpcDatasource({ network })
const destinationAddress = wallet.selectedAddress

async function main() {
    const tx = new BRC20TransferExecutor({
        address: wallet.selectedAddress,
        pubKey: wallet.publicKey,
        destinationAddress,
        feeRate: 2,
        network,
        tick: 'TEST',
        amount: 10
    })

    const hex = await tx.transfer()
    if(hex) {
        const signedTxHex = wallet.signPsbt(hex, { isRevealTx: true })
        const txId = await datasource.relay({ hex: signedTxHex })
        console.log({ txId })
    }    
}

main()