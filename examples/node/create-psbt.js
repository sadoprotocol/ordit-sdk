import { Ordit, ordit } from '@sadoprotocol/ordit-sdk'

async function main() {
    const psbt = await ordit.transactions.createPsbt({
        pubKey: '039ce27aa7666731648421004ba943b90b8273e23a175d9c58e3ec2e643a9b01d1',
        ins: [{
            address: 'tb1p98dv6f5jp5qr4z2dtaljvwrhq34xrr8zuaqgv4ajf36vg2mmsruqt5m3lv'
        }],
        outs: [{
            address: 'tb1qatkgzm0hsk83ysqja5nq8ecdmtwl73zwurawww',
            cardinals: 1200
        }],
        network: 'testnet'
    })

    const WORDS = "caution curtain there off know kit market gather slim april dutch sister"; // Generated HD wallet seed phrase
    const wallet = new Ordit({
        bip39: WORDS,
        network: "testnet"
    });

    wallet.setDefaultAddress('taproot')

    const signature = await wallet.signPsbt(psbt.hex, { finalized: true, tweak: true })
    const txResponse = await wallet.relayTx(signature, 'testnet')

    console.log("tx >>", txResponse)
}

main()