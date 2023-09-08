import { Ordit } from '@sadoprotocol/ordit-sdk'
import { OrditApi, PSBTBuilder } from '@sadoprotocol/ordit-sdk'

const wallet = new Ordit({
    bip39: '<mnemonic>',
    network: 'testnet'
})
wallet.setDefaultAddress('taproot')

async function buildPSBT() {
    const psbt = new PSBTBuilder({
        address: wallet.selectedAddress,
        feeRate: 2,
        network: 'testnet',
        publicKey: wallet.publicKey,
        outputs: [{
            address: 'mwwTsmPhVcJzbW6dCeLVYoJQMraW1EeeuN',
            cardinals: 600
        }]
    })

    await psbt.prepare()

    const hex = psbt.build().toHex()
    const signature = wallet.signPsbt(hex)
    const txId = await OrditApi.relayTx({ hex: signature, network: 'testnet' })

    console.log({ txId })
}

buildPSBT()