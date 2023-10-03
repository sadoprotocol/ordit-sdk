import { GetUnspentsResponse } from "~/api/types"
import { Inscription } from "~/inscription"
import { UTXO } from "~/transactions/types"
import { decodeObject } from "~/utils"

interface SegregateUTXOsBySpendStatusArgOptions {
  utxos: UTXO[]
}

export class DatasourceUtility {
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
