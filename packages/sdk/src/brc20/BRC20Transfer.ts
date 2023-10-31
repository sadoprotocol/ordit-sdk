import { generateTxUniqueIdentifier, Inscriber, Inscription, JsonRpcDatasource, processInput } from ".."
import { BRC20TransferOptions, BRC20TransferPayloadAttributes } from "./types"

export class BRC20Transfer extends Inscriber {
  private tick: string
  private amount = 0

  constructor({
    address,
    pubKey,
    destinationAddress,
    datasource,
    feeRate,
    network,
    tick,
    amount
  }: BRC20TransferOptions) {
    super({
      network,
      address,
      changeAddress: address,
      destinationAddress: destinationAddress || address,
      publicKey: pubKey,
      feeRate,
      postage: 1000,
      mediaType: "", // Set on payload creation
      mediaContent: "" // Set on payload creation
    })

    this.address
    this.datasource = datasource || new JsonRpcDatasource({ network })
    this.feeRate = feeRate
    this.network = network

    this.tick = tick
    this.amount = amount
  }

  private async validateTransferOptions() {
    if (isNaN(this.amount) || this.amount <= 0) {
      throw new Error("Invalid amount")
    }

    const token = await this.datasource.getToken({ tick: this.tick })
    if (!token) {
      throw new Error("Invalid token")
    }

    this.generatePayload()
  }

  private generatePayload() {
    const payload: BRC20TransferPayloadAttributes = {
      p: "brc-20",
      op: "transfer",
      tick: this.tick,
      amt: this.amount.toString()
    }

    return payload
  }

  private async getBalances() {
    const balances = await this.datasource.getAddressTokens({
      address: this.address
    })

    return {
      total: balances.total,
      available: balances.available,
      transferable: balances.transferable
    }
  }

  private async hasEnoughTransferableBalance() {
    const { transferable } = await this.getBalances()
    return transferable >= this.amount
  }

  private async hasEnoughOverallBalance() {
    const { available } = await this.getBalances()
    return available >= this.amount
  }

  private async findInscriptionUTXOs() {
    const [inscriptionIds, { unspendableUTXOs }] = await Promise.all([
      this.findTokenBalanceInscriptions(),
      this.datasource.getUnspents({
        address: this.address
      })
    ])

    return unspendableUTXOs.filter((utxo) => {
      return inscriptionIds.includes(generateTxUniqueIdentifier(utxo.txid, utxo.n))
    })
  }

  private async prepareInscriptionsToTransfer() {
    const utxos = await this.findInscriptionUTXOs()
    if (!utxos.length) {
      throw new Error("No token balance inscriptions found")
    }

    const promises = utxos.map((utxo) =>
      processInput({
        utxo,
        pubKey: this.publicKey,
        network: this.network,
        datasource: this.datasource
      })
    )

    this.inputs = await Promise.all(promises)
    this.outputs = utxos.map((utxo) => ({
      address: this.destinationAddress,
      value: utxo.sats
    }))
  }

  private pickBRC20Inscriptions(inscriptions: Inscription[]) {
    const filterInscriptions: Array<Inscription & { content: BRC20TransferPayloadAttributes }> = []
    for (const inscription of inscriptions) {
      const isBRC20Inscription =
        inscription.mediaType === "text/plain;charset=utf-8" &&
        inscription.mediaContent.includes("brc-20") &&
        inscription.mediaContent.includes("transfer")

      if (!isBRC20Inscription) continue

      try {
        const content = JSON.parse(inscription.mediaContent) as BRC20TransferPayloadAttributes
        if (content.amt !== this.amount.toString()) {
          filterInscriptions.push({
            ...inscription,
            content
          })
        }
      } catch (_) {
        continue
      }
    }

    // Sort inscriptions to spend highest amount transfer ticket first
    return filterInscriptions.sort((a, b) => +b.content.amt - +a.content.amt)
  }

  private async findTokenBalanceInscriptions() {
    const inscriptions = await this.datasource.getInscriptions({
      owner: this.address
    })
    const brc20Inscriptions = this.pickBRC20Inscriptions(inscriptions)

    const balanceInscriptions = []
    let total = 0
    let currentIndex = 0
    while (this.amount > total && brc20Inscriptions[currentIndex]) {
      const inscription = brc20Inscriptions[currentIndex]
      balanceInscriptions.push(inscription)
      total += +inscription.content.amt
      currentIndex++
    }

    return balanceInscriptions.map((inscription) => inscription.id)
  }

  async reveal() {
    const isOverallBalanceSufficient = await this.hasEnoughOverallBalance()
    if (isOverallBalanceSufficient) return

    await this.validateTransferOptions()

    // generate deposit address and fee for inscription
    const { address, revealFee: amount } = await this.generateCommit()

    return { address, amount }
  }

  async generate() {
    const isOverallBalanceSufficient = await this.hasEnoughOverallBalance()
    if (isOverallBalanceSufficient) return

    await this.validateTransferOptions()
    await this.generateCommit()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }

  async transfer() {
    const isTransferableBalanceSufficient = await this.hasEnoughTransferableBalance()
    if (!isTransferableBalanceSufficient) {
      throw new Error("Insufficient transferable balance")
    }

    await this.validateTransferOptions()
    await this.prepareInscriptionsToTransfer()
    await this.prepare()

    return this.toHex()
  }

  async recoverFunds() {
    await this.validateTransferOptions()
    await this.recover()

    const isReady = await this.isReady()
    if (isReady) {
      await this.build()
      return this.toHex()
    }
  }
}
