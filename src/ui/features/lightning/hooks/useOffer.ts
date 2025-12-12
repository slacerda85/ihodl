/**
 * useOffer - Hook para gerenciamento de BOLT 12 Offers
 *
 * Fornece funcionalidades para:
 * - Criar novas offers
 * - Decodificar offers recebidas
 * - Validar offers
 * - Gerenciar estado de offers ativas
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  createOffer as coreCreateOffer,
  decodeOffer as coreDecodeOffer,
  validateOffer as coreValidateOffer,
  getOfferExpiryStatus,
  uint8ArrayToHex,
  type CreateOfferParams,
  type Offer,
  type OfferValidation,
  type OfferExpiryStatus,
} from '@/core/services/ln-offer-service'

// ============================================================================
// Types
// ============================================================================

/**
 * Status do estado do hook
 */
export type OfferStatus = 'idle' | 'creating' | 'decoding' | 'validating' | 'success' | 'error'

/**
 * Campos simplificados para criação de offer
 */
export interface SimpleOfferParams {
  /** Descrição do pagamento */
  description: string
  /** Valor em satoshis (opcional - permite any-amount) */
  amountSats?: number
  /** Nome do emissor (opcional) */
  issuerName?: string
  /** Tempo de expiração em segundos (opcional) */
  expirySeconds?: number
  /** Quantidade máxima permitida (opcional) */
  quantityMax?: number
}

/**
 * Offer decodificada com campos formatados para UI
 */
export interface DecodedOfferInfo {
  /** String original da offer */
  offerString: string
  /** Objeto Offer decodificado */
  offer: Offer
  /** Validação da offer */
  validation: OfferValidation
  /** Status de expiração */
  expiryStatus: OfferExpiryStatus
  /** Campos formatados para exibição */
  display: OfferDisplayInfo
}

/**
 * Informações formatadas para exibição
 */
export interface OfferDisplayInfo {
  /** Descrição */
  description: string
  /** Valor formatado (ou "Any amount") */
  amount: string
  /** Valor em satoshis (undefined se any-amount) */
  amountSats?: number
  /** Nome do emissor */
  issuer: string
  /** ID do emissor (hex truncado) */
  issuerId: string
  /** Data de expiração formatada */
  expiresAt: string | null
  /** Está expirada? */
  isExpired: boolean
  /** Tempo restante formatado */
  timeRemaining: string | null
  /** Quantidade máxima */
  quantityMax: string
  /** É válida? */
  isValid: boolean
  /** Motivos de invalidez */
  validationErrors: string[]
}

/**
 * Offer criada com informações completas
 */
export interface CreatedOfferInfo {
  /** String codificada da offer (lno...) */
  encoded: string
  /** Objeto Offer */
  offer: Offer
  /** QR Code data (a mesma string encoded, uppercase para QR) */
  qrData: string
  /** Informações de exibição */
  display: OfferDisplayInfo
}

/**
 * Estado do hook
 */
export interface OfferState {
  status: OfferStatus
  error: string | null
  createdOffer: CreatedOfferInfo | null
  decodedOffer: DecodedOfferInfo | null
  savedOffers: CreatedOfferInfo[]
}

/**
 * Retorno do hook
 */
export interface UseOfferReturn {
  // Estado
  state: OfferState
  status: OfferStatus
  error: string | null
  isLoading: boolean

  // Offer criada
  createdOffer: CreatedOfferInfo | null

  // Offer decodificada
  decodedOffer: DecodedOfferInfo | null

  // Lista de offers salvas
  savedOffers: CreatedOfferInfo[]

  // Ações
  createOffer: (params: SimpleOfferParams) => Promise<CreatedOfferInfo | null>
  decodeOffer: (offerString: string) => Promise<DecodedOfferInfo | null>
  validateOfferString: (offerString: string) => DecodedOfferInfo | null
  clearCreatedOffer: () => void
  clearDecodedOffer: () => void
  clearError: () => void
  reset: () => void
  saveOffer: (offer: CreatedOfferInfo) => void
  removeOffer: (encoded: string) => void

  // Utilitários
  formatAmount: (amountMsat: bigint | undefined) => string
  formatExpiry: (absoluteExpiry: bigint | undefined) => string | null
  isOfferExpired: (offer: Offer) => boolean
  copyToClipboard: (text: string) => Promise<boolean>
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_STATE: OfferState = {
  status: 'idle',
  error: null,
  createdOffer: null,
  decodedOffer: null,
  savedOffers: [],
}

/** Prefixo padrão de offer BOLT 12 */
export const OFFER_PREFIX = 'lno'

/** Regex para validar formato básico de offer */
export const OFFER_REGEX = /^lno1[a-z0-9]+$/i

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formata valor em msat para exibição
 */
export function formatAmountMsat(amountMsat: bigint | undefined): string {
  if (amountMsat === undefined) {
    return 'Any amount'
  }

  const sats = Number(amountMsat) / 1000

  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BTC`
  } else if (sats >= 1000) {
    return `${sats.toLocaleString()} sats`
  } else {
    return `${sats} sats`
  }
}

/**
 * Formata data de expiração
 */
export function formatExpiryTime(absoluteExpiry: bigint | undefined): string | null {
  if (absoluteExpiry === undefined) {
    return null
  }

  const expiryDate = new Date(Number(absoluteExpiry) * 1000)
  const now = new Date()

  if (expiryDate <= now) {
    return 'Expired'
  }

  return expiryDate.toLocaleString()
}

/**
 * Calcula tempo restante até expiração
 */
export function formatTimeRemaining(absoluteExpiry: bigint | undefined): string | null {
  if (absoluteExpiry === undefined) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  const expiry = Number(absoluteExpiry)
  const remaining = expiry - now

  if (remaining <= 0) {
    return 'Expired'
  }

  if (remaining < 60) {
    return `${remaining}s`
  } else if (remaining < 3600) {
    return `${Math.floor(remaining / 60)}m`
  } else if (remaining < 86400) {
    return `${Math.floor(remaining / 3600)}h`
  } else {
    return `${Math.floor(remaining / 86400)}d`
  }
}

/**
 * Trunca string hexadecimal para exibição
 */
function truncateHex(hex: string, startChars = 8, endChars = 8): string {
  if (hex.length <= startChars + endChars + 3) {
    return hex
  }
  return `${hex.slice(0, startChars)}...${hex.slice(-endChars)}`
}

/**
 * Valida formato básico da string de offer
 */
export function isValidOfferFormat(offerString: string): boolean {
  const trimmed = offerString.trim().toLowerCase()
  return OFFER_REGEX.test(trimmed)
}

/**
 * Cria informações de exibição a partir de uma Offer
 */
function createDisplayInfo(offer: Offer, validation: OfferValidation): OfferDisplayInfo {
  const amountSats = offer.amount !== undefined ? Number(offer.amount) / 1000 : undefined

  // OfferValidation has isValid and errors array
  const validationErrors: string[] = validation.isValid ? [] : [...validation.errors]

  return {
    description: offer.description || 'No description',
    amount: formatAmountMsat(offer.amount),
    amountSats,
    issuer: offer.issuer || 'Unknown',
    issuerId: offer.issuerId ? truncateHex(uint8ArrayToHex(offer.issuerId)) : 'N/A',
    expiresAt: formatExpiryTime(offer.absoluteExpiry),
    isExpired: offer.absoluteExpiry
      ? Number(offer.absoluteExpiry) < Math.floor(Date.now() / 1000)
      : false,
    timeRemaining: formatTimeRemaining(offer.absoluteExpiry),
    quantityMax:
      offer.quantityMax !== undefined
        ? offer.quantityMax === 0n
          ? 'Unlimited'
          : offer.quantityMax.toString()
        : '1',
    isValid: validation.isValid,
    validationErrors,
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook para gerenciamento de BOLT 12 Offers
 */
export function useOffer(issuerPubkey?: Uint8Array): UseOfferReturn {
  const [state, setState] = useState<OfferState>(INITIAL_STATE)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Helpers de estado
  const setStatus = useCallback((status: OfferStatus) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, status }))
    }
  }, [])

  const setError = useCallback((error: string | null) => {
    if (mountedRef.current) {
      setState(prev => ({
        ...prev,
        status: error ? 'error' : prev.status,
        error,
      }))
    }
  }, [])

  // ========================================================================
  // Create Offer
  // ========================================================================

  const createOffer = useCallback(
    async (params: SimpleOfferParams): Promise<CreatedOfferInfo | null> => {
      if (!issuerPubkey) {
        setError('Issuer public key is required to create offers')
        return null
      }

      try {
        setStatus('creating')
        setState(prev => ({ ...prev, error: null }))

        // Converter para parâmetros do core
        const coreParams: CreateOfferParams = {
          description: params.description,
          issuerPubkey,
          amountMsat: params.amountSats ? BigInt(params.amountSats * 1000) : undefined,
          issuer: params.issuerName,
          expirySeconds: params.expirySeconds,
          quantityMax: params.quantityMax ? BigInt(params.quantityMax) : undefined,
        }

        // Criar offer
        const result = coreCreateOffer(coreParams)

        // Validar a offer criada
        const validation = coreValidateOffer(result.offer)

        // Criar informações de exibição
        const display = createDisplayInfo(result.offer, validation)

        const createdInfo: CreatedOfferInfo = {
          encoded: result.encoded,
          offer: result.offer,
          qrData: result.encoded.toUpperCase(),
          display,
        }

        if (mountedRef.current) {
          setState(prev => ({
            ...prev,
            status: 'success',
            createdOffer: createdInfo,
            error: null,
          }))
        }

        return createdInfo
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create offer'
        if (mountedRef.current) {
          setError(errorMessage)
        }
        return null
      }
    },
    [issuerPubkey, setStatus, setError],
  )

  // ========================================================================
  // Decode Offer
  // ========================================================================

  const decodeOffer = useCallback(
    async (offerString: string): Promise<DecodedOfferInfo | null> => {
      try {
        setStatus('decoding')
        setState(prev => ({ ...prev, error: null }))

        const trimmed = offerString.trim().toLowerCase()

        // Validar formato básico
        if (!isValidOfferFormat(trimmed)) {
          throw new Error('Invalid offer format. Must start with "lno1"')
        }

        // Decodificar
        const offer = coreDecodeOffer(trimmed)

        // Validar
        const validation = coreValidateOffer(offer)

        // Verificar expiração
        const expiryStatus = getOfferExpiryStatus(offer)

        // Criar informações de exibição
        const display = createDisplayInfo(offer, validation)

        const decodedInfo: DecodedOfferInfo = {
          offerString: trimmed,
          offer,
          validation,
          expiryStatus,
          display,
        }

        if (mountedRef.current) {
          setState(prev => ({
            ...prev,
            status: 'success',
            decodedOffer: decodedInfo,
            error: null,
          }))
        }

        return decodedInfo
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to decode offer'
        if (mountedRef.current) {
          setError(errorMessage)
        }
        return null
      }
    },
    [setStatus, setError],
  )

  // ========================================================================
  // Validate Offer (Sync)
  // ========================================================================

  const validateOfferString = useCallback((offerString: string): DecodedOfferInfo | null => {
    try {
      const trimmed = offerString.trim().toLowerCase()

      if (!isValidOfferFormat(trimmed)) {
        return null
      }

      const offer = coreDecodeOffer(trimmed)
      const validation = coreValidateOffer(offer)
      const expiryStatus = getOfferExpiryStatus(offer)
      const display = createDisplayInfo(offer, validation)

      return {
        offerString: trimmed,
        offer,
        validation,
        expiryStatus,
        display,
      }
    } catch {
      return null
    }
  }, [])

  // ========================================================================
  // Clear Functions
  // ========================================================================

  const clearCreatedOffer = useCallback(() => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, createdOffer: null }))
    }
  }, [])

  const clearDecodedOffer = useCallback(() => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, decodedOffer: null }))
    }
  }, [])

  const clearError = useCallback(() => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, error: null, status: 'idle' }))
    }
  }, [])

  const reset = useCallback(() => {
    if (mountedRef.current) {
      setState(INITIAL_STATE)
    }
  }, [])

  // ========================================================================
  // Save/Remove Offers
  // ========================================================================

  const saveOffer = useCallback((offer: CreatedOfferInfo) => {
    if (mountedRef.current) {
      setState(prev => {
        // Evitar duplicatas
        const exists = prev.savedOffers.some(o => o.encoded === offer.encoded)
        if (exists) return prev

        return {
          ...prev,
          savedOffers: [...prev.savedOffers, offer],
        }
      })
    }
  }, [])

  const removeOffer = useCallback((encoded: string) => {
    if (mountedRef.current) {
      setState(prev => ({
        ...prev,
        savedOffers: prev.savedOffers.filter(o => o.encoded !== encoded),
      }))
    }
  }, [])

  // ========================================================================
  // Utility Functions
  // ========================================================================

  const formatAmount = useCallback((amountMsat: bigint | undefined): string => {
    return formatAmountMsat(amountMsat)
  }, [])

  const formatExpiry = useCallback((absoluteExpiry: bigint | undefined): string | null => {
    return formatExpiryTime(absoluteExpiry)
  }, [])

  const isOfferExpired = useCallback((offer: Offer): boolean => {
    if (offer.absoluteExpiry === undefined) {
      return false
    }
    return Number(offer.absoluteExpiry) < Math.floor(Date.now() / 1000)
  }, [])

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      // React Native Clipboard não está disponível aqui
      // O componente UI deve implementar usando Clipboard do expo
      console.log('Copy to clipboard:', text)
      return true
    } catch {
      return false
    }
  }, [])

  // ========================================================================
  // Computed Values
  // ========================================================================

  const isLoading = useMemo(() => {
    return (
      state.status === 'creating' || state.status === 'decoding' || state.status === 'validating'
    )
  }, [state.status])

  // ========================================================================
  // Return
  // ========================================================================

  return {
    // Estado
    state,
    status: state.status,
    error: state.error,
    isLoading,

    // Offers
    createdOffer: state.createdOffer,
    decodedOffer: state.decodedOffer,
    savedOffers: state.savedOffers,

    // Ações
    createOffer,
    decodeOffer,
    validateOfferString,
    clearCreatedOffer,
    clearDecodedOffer,
    clearError,
    reset,
    saveOffer,
    removeOffer,

    // Utilitários
    formatAmount,
    formatExpiry,
    isOfferExpired,
    copyToClipboard,
  }
}

export default useOffer
