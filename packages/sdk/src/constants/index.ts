// amount lower than this is considered as dust value
// and majority of the miners don't pick txs w/ the following output value or lower
export const MINIMUM_AMOUNT_IN_SATS = 600

// Fee calculated by the fee estimator cannot be greater than 0.05 BTC in any case
export const MAXIMUM_FEE = 5000000

// Input from seller PSBT when unwrapped & merged,
// is placed on the 2nd index in instant-buy-sell flow
export const INSTANT_BUY_SELLER_INPUT_INDEX = 2
