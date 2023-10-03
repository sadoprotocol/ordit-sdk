export const apiConfig = {
  version: "0.0.0.10",
  apis: {
    mainnet: {
      batter: "https://mainnet.ordit.io/",
      orderbook: "1H4vvBnr62YWQmvNSt8Z4pDw3Vcv1n5xz7",
      ipfs: "http://ipfs-gateway.ordit.io/"
    },
    regtest: {
      batter: "https://regtest.ordit.io/",
      orderbook: "bcrt1q2ys7qws8g072dqe3psp92pqz93ac6wmztexkh5",
      ipfs: "http://ipfs-gateway.ordit.io/"
    },
    testnet: {
      batter: "https://testnet.ordit.io/",
      orderbook: "tb1qfnw26753j7kqu3q099sd48htvtk5wm4e0enmru",
      ipfs: "http://ipfs-gateway.ordit.io/"
    }
  }
}

export type * from "./types"
