import { OrditApi, Ordit } from '@sadoprotocol/ordit-sdk'

const BUYER_MNEMONIC = `<12-WORDS-PHRASE>`
const SELLER_MNEMONIC = `<12-WORDS-PHRASE>`

// Initialise seller wallet
const sellerWallet = new Ordit({
    bip39: SELLER_MNEMONIC,
    network: 'testnet'
})
sellerWallet.setDefaultAddress('taproot') // Switch to address that owns inscription

// Initialise buyer wallet
const buyerWallet = new Ordit({
    bip39: BUYER_MNEMONIC,
    network: 'testnet'
})

// Switch to address that has enough BTC to cover the sell price + network fees
buyerWallet.setDefaultAddress('taproot') 

async function createSellOrder() {
    // replace w/ inscription outputpoint you'd like to sell, price, and address to receive sell proceeds
    const { hex: sellerPSBT } = await Ordit.instantBuy.generateSellerPsbt({
        inscriptionOutPoint: '8d4a576aecb33b809c208d672a43fd6b175478d9454df4455ed0a2dc7eb7cbf6:0', 
        price: 4000, // Total sale proceeds will be price + inscription output value (4000 + 2000 = 6000 sats)
        receiveAddress: sellerWallet.selectedAddress,
        pubKeyType: sellerWallet.selectedAddressType,
        publicKey: sellerWallet.publicKey,
        network: 'testnet'
    })

    const signedSellerPSBT = sellerWallet.signPsbt(sellerPSBT, { finalize: false, extractTx: false })

    return signedSellerPSBT // hex
}

async function createBuyOrder({ sellerPSBT }) {    
    await checkForExistingRefundableUTXOs(buyerWallet.selectedAddress)

    const { hex: buyerPSBT } = await Ordit.instantBuy.generateBuyerPsbt({
        sellerPsbt: sellerPSBT,
        publicKey: buyerWallet.publicKey,
        pubKeyType: buyerWallet.selectedAddressType,
        feeRate: 10, // set correct rate to prevent tx from getting stuck in mempool
        network: 'testnet',
        inscriptionOutPoint: '0f3891f61b944c31fb48b0d9e770dc9e66a4b49097027be53b078be67aca72d4:0'
    })
    
    const signature = buyerWallet.signPsbt(buyerPSBT)
    const tx = await buyerWallet.relayTx(signature, 'testnet')

    return tx
}

async function checkForExistingRefundableUTXOs(address) {
    const response = await OrditApi.fetch('/utxo/unspents', {
        data: {
            address: address,
            options: {
                txhex: true,
                notsafetospend: false,
                allowedrarity: ["common"]
            }
        },
        network: 'testnet'
    })

    const utxos = response.rdata
    const filteredUTXOs = utxos
        .filter(utxo => utxo.safeToSpend && !utxo.inscriptions.length && utxo.sats > 600 && utxo.sats <= 1000)
        .sort((a, b) => a.sats - b.sats) // Sort by lowest value utxo to highest such that we spend only the ones that are lowest

    if(filteredUTXOs.length < 2) {
        throw new Error("Not enough UTXOs in 600-1000 sats range. Use Ordit.instantBuy.generateDummyUtxos() to generate dummy utxos.")
    }
}

async function main() {
    const signedSellerPSBT = await createSellOrder()
    const tx = await createBuyOrder({ sellerPSBT: signedSellerPSBT })

    console.log(tx) // 6dc768015dda40c3752bfc011077ae9b1445d0c9cb5b385fda6ee26dab6cb267
}

;(async() => {
    await main()
})()