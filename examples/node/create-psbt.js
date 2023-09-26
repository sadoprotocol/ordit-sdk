import { JsonRpcDatasource } from '@sadoprotocol/ordit-sdk';
import { Ordit, ordit } from '@sadoprotocol/ordit-sdk'

const MNEMONIC = "<MNEMONIC>"; // Generated HD wallet seed phrase
const network = "testnet"
const wallet = new Ordit({
    bip39: MNEMONIC,
    network
});
wallet.setDefaultAddress('taproot')

const datasource = new JsonRpcDatasource({ network })

async function main() {
    const psbt = await ordit.transactions.createPsbt({
        pubKey: '039ce27aa7666731648421004ba943b90b8273e23a175d9c58e3ec2e643a9b01d1',
        address: 'tb1p98dv6f5jp5qr4z2dtaljvwrhq34xrr8zuaqgv4ajf36vg2mmsruqt5m3lv',
        outputs: [{
            address: 'tb1qatkgzm0hsk83ysqja5nq8ecdmtwl73zwurawww',
            value: 1200
        }],
        network,
        satsPerByte: 2,
        format: 'p2tr'
    })

    const signedTxHex = await wallet.signPsbt(psbt.hex)
    const txId = await datasource.relay({ hex: signedTxHex })

    console.log({ txId })
}

main()