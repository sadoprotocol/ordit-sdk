import { JsonRpcDatasource } from '@sadoprotocol/ordit-sdk'
import { Ordit } from '@sadoprotocol/ordit-sdk'
import { PSBTBuilder } from '@sadoprotocol/ordit-sdk'

const network = 'testnet'
const wallet = new Ordit({
    bip39: '<mnemonic>',
    network
})
wallet.setDefaultAddress('taproot')
const datasource = new JsonRpcDatasource({ network })

async function buildPSBT() {
    const psbt = new PSBTBuilder({
        address: wallet.selectedAddress,
        feeRate: 2,
        network,
        publicKey: wallet.publicKey,
        outputs: [{
            address: 'mwwTsmPhVcJzbW6dCeLVYoJQMraW1EeeuN',
            value: 600
        }]
    })

    await psbt.prepare()

    const hex = psbt.toHex()
    const signedTxHex = wallet.signPsbt(hex)
    const txId = await datasource.relay({ hex: signedTxHex })

    console.log({ txId })
}

buildPSBT()