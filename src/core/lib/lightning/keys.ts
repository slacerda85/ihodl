/**
 * LNPBP-46: Derivação de Chaves Lightning
 *
 * Implementa derivação determinística de chaves para Lightning Network
 * seguindo o padrão LNPBP-46 (purpose 9735).
 *
 * Hierarquia de derivação:
 * m/9735'/chain'/level'/...
 *
 * Levels:
 * - 0': Node keys (assinatura de invoices/canais)
 * - 1': Channel keys (basepoints para canais)
 * - 2': Funding wallet (transações de funding)
 */

import { deriveChildKey, createPublicKey } from '../key'
import { LIGHTNING_PURPOSE, LIGHTNING_COIN_TYPE } from '@/core/models/lightning/client'

// ==========================================
// CONSTANTES
// ==========================================

/**
 * Tipos de moeda suportados
 */
export enum CoinType {
  Bitcoin = 0x80000000, // 0' hardened
}

/**
 * Níveis de derivação de nó
 */
export enum NodeIndex {
  NODE = 0x80000000, // 0' - Chave de nó
  CHANNEL = 0x80000001, // 1' - Chaves de canal
  FUNDING_WALLET = 0x80000002, // 2' - Carteira de funding
}

/**
 * Versões Lightning suportadas
 */
export enum LnVersion {
  BOLT = 0, // BOLT padrão
}

// ==========================================
// FUNÇÕES DE DERIVAÇÃO
// ==========================================

/**
 * Deriva chave Lightning usando LNPBP-46 path m'/9735'/0'/0'/0/index
 * LNPBP-46 define purpose 9735 para Lightning Network
 *
 * @param masterKey - Chave mestra estendida (64 bytes)
 * @param index - Índice da chave a derivar
 * @returns Chave derivada (64 bytes: privkey + chaincode)
 */
export function deriveLightningKey(masterKey: Uint8Array, index: number): Uint8Array {
  // m'/9735'/0'/0' (extended lightning key / chain / node account)
  let key = masterKey
  key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose' (hardened)
  key = deriveChildKey(key, LIGHTNING_COIN_TYPE + 0x80000000) // coinType' (hardened)
  key = deriveChildKey(key, 0x80000000) // account' (hardened)

  // /0/index (não-hardened para derivação pública)
  key = deriveChildKey(key, 0) // change
  key = deriveChildKey(key, index) // addressIndex

  return key
}

/**
 * Deriva a chave estendida Lightning (m/9735'/)
 * Chave raiz para todas as derivações Lightning (LNPBP-46)
 *
 * @param masterKey - Chave mestra estendida (64 bytes)
 * @returns Chave estendida Lightning (64 bytes)
 */
export function getExtendedLightningKey(masterKey: Uint8Array): Uint8Array {
  let key = masterKey
  key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose'
  return key
}

/**
 * Deriva chave de nó (m/9735'/chain'/0'/nodeIndex')
 * Chave específica para um nó Lightning (assinatura de invoices/canais)
 *
 * Path: m/9735'/0'/0'/0' (nó 0)
 *
 * @param masterKey - Chave mestra estendida (64 bytes)
 * @param nodeIndex - Índice do nó (padrão 0)
 * @returns Chave estendida do nó (64 bytes)
 */
export function getNodeKey(masterKey: Uint8Array, nodeIndex: number = 0): Uint8Array {
  let key = getExtendedLightningKey(masterKey)
  key = deriveChildKey(key, CoinType.Bitcoin) // chain'
  key = deriveChildKey(key, NodeIndex.NODE) // 0' (node level)
  key = deriveChildKey(key, nodeIndex + 0x80000000) // nodeIndex'
  return key
}

/**
 * Deriva basepoints para um canal (m/9735'/chain'/1'/lnVer'/channel'/basepoint)
 * Gera todas as chaves base necessárias para um canal Lightning (BOLT #2)
 *
 * Basepoints são usados para:
 * - funding: Assinatura da transação de funding
 * - payment: Chaves de pagamento do canal
 * - delayed: Chaves para timelocks
 * - revocation: Chaves de revogação
 * - perCommitment: Chaves por estado de compromisso
 * - htlc: Chaves para HTLCs
 * - ptlc: Chaves para PTLCs (futuro)
 *
 * @param masterKey - Chave mestra estendida (64 bytes)
 * @param channelId - ID do canal (string hex)
 * @param lnVer - Versão Lightning (padrão BOLT)
 * @returns Objeto com todas as basepoints
 */
export function getChannelBasepoints(
  masterKey: Uint8Array,
  channelId: string,
  lnVer: LnVersion = LnVersion.BOLT,
): {
  funding: Uint8Array
  payment: Uint8Array
  delayed: Uint8Array
  revocation: Uint8Array
  perCommitment: Uint8Array
  htlc: Uint8Array
  ptlc: Uint8Array
} {
  const channelIndex = constructChannelIndex(channelId)
  let key = getExtendedLightningKey(masterKey)
  key = deriveChildKey(key, CoinType.Bitcoin) // chain'
  key = deriveChildKey(key, NodeIndex.CHANNEL) // 1' (channel level)
  key = deriveChildKey(key, lnVer + 0x80000000) // lnVer'
  key = deriveChildKey(key, channelIndex) // channel (hardened)

  return {
    funding: deriveChildKey(key, 0),
    payment: deriveChildKey(key, 1),
    delayed: deriveChildKey(key, 2),
    revocation: deriveChildKey(key, 3),
    perCommitment: deriveChildKey(key, 4),
    htlc: deriveChildKey(key, 5),
    ptlc: deriveChildKey(key, 6),
  }
}

/**
 * Deriva carteira de funding (m/9735'/chain'/2'/case/index)
 * Chaves para transações de funding de canais
 *
 * Cases disponíveis:
 * 0: RECEIVE - Receber funding
 * 1: CHANGE - Troco de funding
 * 2: SHUTDOWN - Encerramento de canal
 *
 * @param masterKey - Chave mestra estendida (64 bytes)
 * @param caseType - Tipo de caso (0=receive, 1=change, 2=shutdown)
 * @param index - Índice sequencial
 * @returns Chave de funding (64 bytes)
 */
export function getFundingWallet(
  masterKey: Uint8Array,
  caseType: number = 0,
  index: number = 0,
): Uint8Array {
  let key = getExtendedLightningKey(masterKey)
  key = deriveChildKey(key, CoinType.Bitcoin) // chain'
  key = deriveChildKey(key, NodeIndex.FUNDING_WALLET) // 2' (funding wallet level)
  key = deriveChildKey(key, caseType) // case
  key = deriveChildKey(key, index) // index
  return key
}

/**
 * Obtém chave pública a partir de chave estendida
 *
 * @param extendedKey - Chave estendida (64 bytes)
 * @returns Chave pública comprimida (33 bytes)
 */
export function getPublicKeyFromExtended(extendedKey: Uint8Array): Uint8Array {
  return createPublicKey(extendedKey.subarray(0, 32))
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

/**
 * Constrói índice de canal a partir do ID do canal
 * Usa hash do channelId para gerar índice único
 *
 * @param channelId - ID do canal (string)
 * @returns Índice hardened para derivação
 */
export function constructChannelIndex(channelId: string): number {
  // Usar primeiros 4 bytes do channelId como índice
  // Se channelId for hex, converter para número
  const cleanId = channelId.replace(/[^0-9a-fA-F]/g, '')
  const index = parseInt(cleanId.slice(0, 8), 16) || 0
  return (index % 0x80000000) + 0x80000000 // Garantir hardened
}

/**
 * Tipos de caso para funding wallet
 */
export enum FundingCase {
  RECEIVE = 0,
  CHANGE = 1,
  SHUTDOWN = 2,
}

/**
 * Interface para contexto de derivação de chaves
 */
export interface KeyDerivationContext {
  masterKey: Uint8Array
  network: 'mainnet' | 'testnet' | 'regtest'
  nodeIndex: number
}

/**
 * Classe helper para derivação de chaves Lightning
 */
export class LightningKeyDeriver {
  private masterKey: Uint8Array
  private nodeIndex: number

  constructor(masterKey: Uint8Array, nodeIndex: number = 0) {
    this.masterKey = masterKey
    this.nodeIndex = nodeIndex
  }

  /**
   * Deriva chave Lightning por índice
   */
  deriveLightningKey(index: number): Uint8Array {
    return deriveLightningKey(this.masterKey, index)
  }

  /**
   * Obtém chave estendida Lightning
   */
  getExtendedLightningKey(): Uint8Array {
    return getExtendedLightningKey(this.masterKey)
  }

  /**
   * Obtém chave de nó
   */
  getNodeKey(nodeIndex?: number): Uint8Array {
    return getNodeKey(this.masterKey, nodeIndex ?? this.nodeIndex)
  }

  /**
   * Obtém basepoints de canal
   */
  getChannelBasepoints(
    channelId: string,
    lnVer?: LnVersion,
  ): ReturnType<typeof getChannelBasepoints> {
    return getChannelBasepoints(this.masterKey, channelId, lnVer)
  }

  /**
   * Obtém chave de funding
   */
  getFundingWallet(caseType?: number, index?: number): Uint8Array {
    return getFundingWallet(this.masterKey, caseType, index)
  }

  /**
   * Obtém chave pública do nó
   */
  getNodePublicKey(): Uint8Array {
    const nodeKey = this.getNodeKey()
    return getPublicKeyFromExtended(nodeKey)
  }
}
