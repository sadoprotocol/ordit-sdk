import { JsonRpcDatasource } from '@sadoprotocol/ordit-sdk'
import { Ordit, InstantTradeBuyerTxBuilder, InstantTradeSellerTxBuilder } from '@sadoprotocol/ordit-sdk'

const BUYER_MNEMONIC = `<12-WORDS-PHRASE>`
const SELLER_MNEMONIC = `<12-WORDS-PHRASE>`
const network = "testnet"

// Initialise seller wallet
const sellerWallet = new Ordit({
    bip39: SELLER_MNEMONIC,
    network
})
sellerWallet.setDefaultAddress('nested-segwit') // Switch to address that owns inscription

// Initialise buyer wallet
const buyerWallet = new Ordit({
    bip39: BUYER_MNEMONIC,
    network
})

// Switch to address that has enough BTC to cover the sell price + network fees
buyerWallet.setDefaultAddress('taproot') 

const datasource = new JsonRpcDatasource({ network })

async function createSellOrder() {
    // replace w/ inscription outputpoint you'd like to sell, price, and address to receive sell proceeds
    const instantTrade = new InstantTradeSellerTxBuilder({
        network,
        address: sellerWallet.selectedAddress,
        publicKey: sellerWallet.publicKey,
        inscriptionOutpoint: '58434bd163e5b87c871e5b17c316a3cf141e0e10c3979f0b5ed2530d1d274040:1', 
    })
    instantTrade.setPrice(1234)
    await instantTrade.build()

    const sellerPSBT = instantTrade.toHex()
    const signedSellerPSBT = sellerWallet.signPsbt(sellerPSBT, { finalize: false, extractTx: false })

    return signedSellerPSBT;
}

async function createBuyOrder({ sellerPSBT }) {    
    const instantTrade = new InstantTradeBuyerTxBuilder({
        network,
        address: buyerWallet.selectedAddress,
        publicKey: buyerWallet.publicKey,
        sellerPSBT,
        feeRate: 2, // set correct rate to prevent tx from getting stuck in mempool
    })
    await instantTrade.build()

    const buyerPSBT = instantTrade.toHex()
    const signedTxHex = buyerWallet.signPsbt(buyerPSBT)
    const txId = await datasource.relay({ hex: signedTxHex })

    return txId
}

async function main() {
    const signedSellerPSBT = await createSellOrder()
    const txId = await createBuyOrder({ sellerPSBT: signedSellerPSBT })

    console.log({ txId })
}

;(async() => {
    await main()
})()