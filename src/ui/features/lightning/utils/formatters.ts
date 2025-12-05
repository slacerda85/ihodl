/**
 * Funções de formatação para valores Lightning
 */

import type { Millisatoshis, Satoshis } from '../types'

/**
 * Converte millisatoshis para satoshis
 */
export function msatToSat(msat: Millisatoshis): Satoshis {
  return msat / 1000n
}

/**
 * Converte satoshis para millisatoshis
 */
export function satToMsat(sat: Satoshis): Millisatoshis {
  return sat * 1000n
}

/**
 * Formata millisatoshis para exibição
 */
export function formatMsat(msat?: Millisatoshis): string {
  if (!msat || msat === 0n) return '0 sats'

  const sats = msatToSat(msat)

  if (sats >= 100_000_000n) {
    const btc = Number(sats) / 100_000_000
    return `${btc.toFixed(8)} BTC`
  }

  if (sats >= 1_000_000n) {
    const mBtc = Number(sats) / 100_000
    return `${mBtc.toFixed(5)} mBTC`
  }

  return `${sats.toString()} sats`
}

/**
 * Formata satoshis para exibição
 */
export function formatSats(sats?: Satoshis): string {
  if (!sats || sats === 0n) return '0 sats'

  if (sats >= 100_000_000n) {
    const btc = Number(sats) / 100_000_000
    return `${btc.toFixed(8)} BTC`
  }

  if (sats >= 1_000_000n) {
    const mBtc = Number(sats) / 100_000
    return `${mBtc.toFixed(5)} mBTC`
  }

  return `${sats.toString()} sats`
}

/**
 * Formata um payment hash para exibição (truncado)
 */
export function formatPaymentHash(hash: string, length = 8): string {
  if (hash.length <= length * 2) return hash
  return `${hash.substring(0, length)}...${hash.substring(hash.length - length)}`
}

/**
 * Formata timestamp para data legível
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

/**
 * Formata duração em segundos para texto legível
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

/**
 * Calcula tempo restante até expiração
 */
export function getTimeUntilExpiry(expiresAt: number): {
  expired: boolean
  remaining: number
  formatted: string
} {
  const now = Date.now()
  const remaining = Math.max(0, expiresAt - now)
  const expired = remaining === 0

  return {
    expired,
    remaining,
    formatted: expired ? 'Expired' : formatDuration(Math.floor(remaining / 1000)),
  }
}
