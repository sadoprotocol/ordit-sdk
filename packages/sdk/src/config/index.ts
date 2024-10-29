export const apiConfig = {
  version: "0.0.0.10",
  apis: {
    bitcoin: {
      mainnet: "https://mainnet.ordit.io/",
      regtest: "https://regtest.ordit.io/",
      testnet: "https://testnet.ordit.io/",
      signet: "https://signet.ordit.io/"
    },
    "fractal-bitcoin": {
      mainnet: "https://fractal.ordit.io/",
      regtest: "https://fractal-regtest.ordit.io/",
      testnet: "https://fractal-testnet.ordit.io/",
      signet: "https://fractal-signet.ordit.io/"
    }
  }
}

// Input from seller PSBT when unwrapped & merged,
// is placed on the 2nd index in instant-buy-sell flow
export const INSTANT_BUY_SELLER_INPUT_INDEX = 2
