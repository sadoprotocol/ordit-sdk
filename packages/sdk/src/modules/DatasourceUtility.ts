import { decodeObject, Inscription } from ".."
import { UTXO } from "../transactions/types"

interface SegregateUTXOsBySpendStatusArgOptions {
  utxos: UTXO[]
  decodeMetadata?: boolean
}

export default class DatasourceUtility {
  static transformInscriptions(inscriptions?: Inscription[]) {
    if (!inscriptions) return []

    return inscriptions.map((inscription) => {
      inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
      return inscription
    })
  }

  static segregateUTXOsBySpendStatus({ utxos, decodeMetadata }: SegregateUTXOsBySpendStatusArgOptions) {
    const { spendableUTXOs, unspendableUTXOs } = utxos.reduce(
      (acc, utxo) => {
        if (utxo.inscriptions?.length && !utxo.safeToSpend) {
          utxo.inscriptions = decodeMetadata ? this.transformInscriptions(utxo.inscriptions) : utxo.inscriptions

          acc.unspendableUTXOs.push(utxo)
        } else {
          acc.spendableUTXOs.push(utxo)
        }

        return acc
      },
      {
        spendableUTXOs: [],
        unspendableUTXOs: []
      } as Record<string, UTXO[]>
    )

    return {
      totalUTXOs: utxos.length,
      spendableUTXOs,
      unspendableUTXOs
    }
  }
}
