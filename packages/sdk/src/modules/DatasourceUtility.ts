import { decodeObject, Inscription } from ".."
import { GetUnspentsResponse } from "../api/types"
import { UTXO } from "../transactions/types"

interface SegregateUTXOsBySpendStatusArgOptions {
  utxos: UTXO[]
}

export default class DatasourceUtility {
  static transformInscriptions(inscriptions?: Inscription[]) {
    if (!inscriptions) return []

    return inscriptions.map((inscription) => {
      inscription.meta = inscription.meta ? decodeObject(inscription.meta) : inscription.meta
      return inscription
    })
  }

  static segregateUTXOsBySpendStatus({ utxos }: SegregateUTXOsBySpendStatusArgOptions): GetUnspentsResponse {
    const { spendableUTXOs, unspendableUTXOs } = utxos.reduce(
      (acc, utxo) => {
        !utxo.safeToSpend ? acc.unspendableUTXOs.push(utxo) : acc.spendableUTXOs.push(utxo)
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
