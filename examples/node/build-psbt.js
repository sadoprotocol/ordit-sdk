import { Ordit } from '@sadoprotocol/ordit-sdk'
import { OrditApi, PSBTBuilder } from '@sadoprotocol/ordit-sdk'

const wallet = new Ordit({
    bip39: '<mnemonic>',
    network: 'testnet'
})
wallet.setDefaultAddress('taproot')

async function buildPSBT() {
    const psbt = new PSBTBuilder({
        address: 'tb1p98dv6f5jp5qr4z2dtaljvwrhq34xrr8zuaqgv4ajf36vg2mmsruqt5m3lv',
        feeRate: 2,
        network: 'testnet',
        publicKey: '039ce27aa7666731648421004ba943b90b8273e23a175d9c58e3ec2e643a9b01d1',
        outputs: [{
            address: 'mwwTsmPhVcJzbW6dCeLVYoJQMraW1EeeuN',
            cardinals: 1455
        }]
    })

    await psbt.prepare()

    const hex = psbt.build().toHex()
    const signature = wallet.signPsbt(hex)
    const txId = await OrditApi.relayTx({ hex: signature, network: 'testnet' })

    console.log({ txId })
}

buildPSBT()