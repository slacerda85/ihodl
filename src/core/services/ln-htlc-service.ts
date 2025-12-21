/**
 * Lightning HTLC Service
 * Exposição tipada do HTLCManager para a UI sem importar lib diretamente.
 */

import type { PersistedChannel } from '../repositories/lightning'

export { HTLCManager, HTLCOwner } from '../lib/lightning/htlc'
export { HtlcMonitorState, HtlcAction } from '../lib/lightning'

export type HtlcConfirmationProvider = {
  getConfirmations(txid: string): Promise<number>
}

export function extractPendingHtlcTxids(channel?: PersistedChannel | null): string[] {
  if (!channel) return []

  const explicitTxids = Array.isArray((channel as any).pendingHtlcTxids)
    ? (channel as any).pendingHtlcTxids.filter(
        (tx: unknown): tx is string => typeof tx === 'string',
      )
    : []

  const fromObjects = Array.isArray((channel as any).pendingHtlcs)
    ? (channel as any).pendingHtlcs
        .map((htlc: any) => (typeof htlc?.txid === 'string' ? htlc.txid : undefined))
        .filter((txid: string | undefined): txid is string => typeof txid === 'string')
    : []

  // Remover duplicados mantendo a ordem encontrada
  const combined = [...explicitTxids, ...fromObjects]
  const seen = new Set<string>()
  return combined.filter(txid => {
    if (seen.has(txid)) return false
    seen.add(txid)
    return true
  })
}

export async function reconcilePendingHtlcConfirmations(
  provider: HtlcConfirmationProvider,
  txids: Set<string>,
  onConfirmed?: (txid: string, confirmations: number) => void,
): Promise<Set<string>> {
  const remaining = new Set(txids)

  for (const txid of Array.from(txids)) {
    try {
      const confirmations = await provider.getConfirmations(txid)
      if (confirmations > 0) {
        onConfirmed?.(txid, confirmations)
        remaining.delete(txid)
      }
    } catch (error) {
      console.error('[ln-htlc-service] Error checking HTLC confirmation', error)
    }
  }

  return remaining
}
