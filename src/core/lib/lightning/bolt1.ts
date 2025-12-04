/**
 * BOLT #1: Base Protocol
 *
 * Implementa o protocolo base de mensagens Lightning Network:
 * - Formato de mensagem Lightning
 * - TLV streams
 * - Feature bits
 * - Mensagens Init, Error, Warning, Ping, Pong
 *
 * Baseado em: https://github.com/lightning/bolts/blob/master/01-messaging.md
 */

import type {
  InitMessage,
  ErrorMessage,
  WarningMessage,
  PingMessage,
  PongMessage,
  TlvRecord,
  TlvStream,
  LightningMessage,
  ChainHash,
  ChannelId,
} from '@/core/models/lightning/base'
import { LightningMessageType, InitTlvType, MAX_MESSAGE_SIZE } from '@/core/models/lightning/base'

// ==========================================
// CONSTANTES
// ==========================================

// Feature Bits (BOLT #9)
export const FEATURE_BITS = {
  // Definidos em BOLT #9
  OPTION_DATA_LOSS_PROTECT: 0,
  OPTION_DATA_LOSS_PROTECT_REQ: 1,
  INITIAL_ROUTING_SYNC: 3,
  OPTION_UPFRONT_SHUTDOWN_SCRIPT: 4,
  OPTION_UPFRONT_SHUTDOWN_SCRIPT_REQ: 5,
  GOSSIP_QUERIES: 6,
  GOSSIP_QUERIES_REQ: 7,
  VAR_ONION_OPTIN: 8,
  VAR_ONION_OPTIN_REQ: 9,
  GOSSIP_QUERIES_EX: 10,
  GOSSIP_QUERIES_EX_REQ: 11,
  OPTION_STATIC_REMOTEKEY: 12,
  OPTION_STATIC_REMOTEKEY_REQ: 13,
  PAYMENT_SECRET: 14,
  PAYMENT_SECRET_REQ: 15,
  BASIC_MPP: 16,
  BASIC_MPP_REQ: 17,
  OPTION_SUPPORT_LARGE_CHANNEL: 18,
  OPTION_SUPPORT_LARGE_CHANNEL_REQ: 19,
  OPTION_ANCHOR_OUTPUTS: 20,
  OPTION_ANCHOR_OUTPUTS_REQ: 21,
  OPTION_ANCHORS_ZERO_FEE_HTLC_TX: 22,
  OPTION_ANCHORS_ZERO_FEE_HTLC_TX_REQ: 23,
  OPTION_SHUTDOWN_ANYSEGWIT: 26,
  OPTION_SHUTDOWN_ANYSEGWIT_REQ: 27,
  OPTION_CHANNEL_TYPE: 44,
  OPTION_CHANNEL_TYPE_REQ: 45,
  OPTION_SCID_ALIAS: 46,
  OPTION_SCID_ALIAS_REQ: 47,
  OPTION_PAYMENT_METADATA: 48,
  OPTION_PAYMENT_METADATA_REQ: 49,
  OPTION_ZEROCONF: 50,
  OPTION_ZEROCONF_REQ: 51,
  KEYSEND: 54,
  KEYSEND_REQ: 55,
  OPTION_TRAMPOLINE_ROUTING: 56,
  OPTION_TRAMPOLINE_ROUTING_REQ: 57,
} as const

// Chain hashes
export const CHAIN_HASHES = {
  MAINNET: new Uint8Array([
    0x6f, 0xe2, 0x8c, 0x0a, 0xb6, 0xf1, 0xb3, 0x72, 0xc1, 0xa6, 0xa2, 0x46, 0xae, 0x63, 0xf7, 0x4f,
    0x93, 0x1e, 0x83, 0x65, 0xe1, 0x5a, 0x08, 0x9c, 0x68, 0xd6, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]),
  TESTNET: new Uint8Array([
    0x43, 0x49, 0x7f, 0xd7, 0xf8, 0x26, 0x95, 0x71, 0x08, 0xf4, 0xa3, 0x0f, 0xd9, 0xce, 0xc3, 0xae,
    0xba, 0x79, 0x97, 0x20, 0x84, 0xe9, 0x0e, 0xad, 0x01, 0xea, 0x33, 0x09, 0x00, 0x00, 0x00, 0x00,
  ]),
  SIGNET: new Uint8Array([
    0xf6, 0x1e, 0xee, 0x3b, 0x63, 0xa3, 0x80, 0xa4, 0x77, 0xa0, 0x63, 0xaf, 0x32, 0xb2, 0xbb, 0xc9,
    0x7c, 0x9f, 0xf9, 0xf0, 0x1f, 0x2c, 0x42, 0x25, 0xe9, 0x73, 0x98, 0x81, 0x08, 0x00, 0x00, 0x00,
  ]),
  REGTEST: new Uint8Array([
    0x06, 0x22, 0x6e, 0x46, 0x11, 0x1a, 0x0b, 0x59, 0xca, 0xaf, 0x12, 0x60, 0x43, 0xeb, 0x5b, 0xbf,
    0x28, 0xc3, 0x4f, 0x3a, 0x5e, 0x33, 0x2a, 0x1f, 0xc7, 0xb2, 0xb7, 0x3c, 0xf1, 0x88, 0x91, 0x0f,
  ]),
}

// All-zero channel ID para erros globais
export const GLOBAL_ERROR_CHANNEL_ID = new Uint8Array(32)

// ==========================================
// BIGSIZE ENCODING/DECODING
// ==========================================

/**
 * Codifica valor em formato BigSize (variable length integer)
 * BOLT #1: BigSize encoding
 *
 * @param value - Valor a codificar
 * @returns Bytes codificados
 */
export function encodeBigSize(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error('BigSize cannot be negative')
  }

  if (value < 0xfdn) {
    return new Uint8Array([Number(value)])
  } else if (value <= 0xffffn) {
    const buf = new ArrayBuffer(3)
    const view = new DataView(buf)
    view.setUint8(0, 0xfd)
    view.setUint16(1, Number(value), false)
    return new Uint8Array(buf)
  } else if (value <= 0xffffffffn) {
    const buf = new ArrayBuffer(5)
    const view = new DataView(buf)
    view.setUint8(0, 0xfe)
    view.setUint32(1, Number(value), false)
    return new Uint8Array(buf)
  } else {
    const buf = new ArrayBuffer(9)
    const view = new DataView(buf)
    view.setUint8(0, 0xff)
    view.setBigUint64(1, value, false)
    return new Uint8Array(buf)
  }
}

/**
 * Decodifica BigSize
 *
 * @param data - Bytes a decodificar
 * @returns Valor decodificado e bytes lidos
 */
export function decodeBigSize(data: Uint8Array): { value: bigint; bytesRead: number } {
  if (data.length === 0) {
    throw new Error('Cannot decode BigSize: empty data')
  }

  const first = data[0]

  if (first < 0xfd) {
    return { value: BigInt(first), bytesRead: 1 }
  } else if (first === 0xfd) {
    if (data.length < 3) {
      throw new Error('Cannot decode BigSize: insufficient data for 2-byte value')
    }
    const view = new DataView(data.buffer, data.byteOffset, 3)
    const value = BigInt(view.getUint16(1, false))
    // Validar canonicidade: valor deve ser >= 0xFD
    if (value < 0xfdn) {
      throw new Error('Non-canonical BigSize encoding')
    }
    return { value, bytesRead: 3 }
  } else if (first === 0xfe) {
    if (data.length < 5) {
      throw new Error('Cannot decode BigSize: insufficient data for 4-byte value')
    }
    const view = new DataView(data.buffer, data.byteOffset, 5)
    const value = BigInt(view.getUint32(1, false))
    // Validar canonicidade: valor deve ser > 0xFFFF
    if (value <= 0xffffn) {
      throw new Error('Non-canonical BigSize encoding')
    }
    return { value, bytesRead: 5 }
  } else {
    if (data.length < 9) {
      throw new Error('Cannot decode BigSize: insufficient data for 8-byte value')
    }
    const view = new DataView(data.buffer, data.byteOffset, 9)
    const value = view.getBigUint64(1, false)
    // Validar canonicidade: valor deve ser > 0xFFFFFFFF
    if (value <= 0xffffffffn) {
      throw new Error('Non-canonical BigSize encoding')
    }
    return { value, bytesRead: 9 }
  }
}

/**
 * Valida se um BigSize está corretamente codificado (canônico)
 *
 * @param data - Bytes a validar
 * @returns true se válido
 */
export function isValidBigSize(data: Uint8Array): boolean {
  try {
    decodeBigSize(data)
    return true
  } catch {
    return false
  }
}

// ==========================================
// TLV ENCODING/DECODING
// ==========================================

/**
 * Codifica stream de TLVs em bytes
 *
 * @param tlvs - Array de TLVs
 * @returns Bytes codificados
 */
export function encodeTlvStream(tlvs: TlvStream): Uint8Array {
  // Ordenar TLVs por tipo (requisito BOLT)
  const sortedTlvs = [...tlvs].sort((a, b) => Number(a.type - b.type))

  // Verificar tipos duplicados
  for (let i = 1; i < sortedTlvs.length; i++) {
    if (sortedTlvs[i].type === sortedTlvs[i - 1].type) {
      throw new Error(`Duplicate TLV type: ${sortedTlvs[i].type}`)
    }
  }

  const parts: Uint8Array[] = []

  for (const tlv of sortedTlvs) {
    // Type (bigsize)
    const typeBytes = encodeBigSize(tlv.type)
    // Length (bigsize)
    const lengthBytes = encodeBigSize(BigInt(tlv.value.length))
    // Value
    parts.push(typeBytes, lengthBytes, tlv.value)
  }

  // Concatenar tudo
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Decodifica stream de TLVs
 *
 * @param data - Bytes do TLV stream
 * @returns Array de TLVs decodificados
 */
export function decodeTlvStream(data: Uint8Array): TlvStream {
  const tlvs: TlvStream = []
  let offset = 0
  let lastType: bigint | null = null

  while (offset < data.length) {
    const { value: type, bytesRead: typeBytes } = decodeBigSize(data.subarray(offset))
    offset += typeBytes

    // Verificar ordem estritamente crescente
    if (lastType !== null && type <= lastType) {
      throw new Error(`TLV stream not in strictly increasing order: ${type} <= ${lastType}`)
    }
    lastType = type

    const { value: length, bytesRead: lengthBytes } = decodeBigSize(data.subarray(offset))
    offset += lengthBytes

    if (offset + Number(length) > data.length) {
      throw new Error('TLV value exceeds data length')
    }

    const value = data.slice(offset, offset + Number(length))
    offset += Number(length)

    tlvs.push({ type, length, value })
  }

  return tlvs
}

/**
 * Cria um TLV record
 *
 * @param type - Tipo do TLV
 * @param value - Valor do TLV
 * @returns TLV record
 */
export function createTlvRecord(type: bigint | number, value: Uint8Array): TlvRecord {
  return {
    type: BigInt(type),
    length: BigInt(value.length),
    value,
  }
}

/**
 * Encontra um TLV por tipo no stream
 *
 * @param stream - TLV stream
 * @param type - Tipo a procurar
 * @returns TLV encontrado ou undefined
 */
export function findTlv(stream: TlvStream, type: bigint | number): TlvRecord | undefined {
  return stream.find(tlv => tlv.type === BigInt(type))
}

// ==========================================
// FEATURE BITS
// ==========================================

/**
 * Verifica se um feature bit está definido
 *
 * @param features - Array de bytes de features
 * @param bit - Número do bit
 * @returns true se o bit está definido
 */
export function hasFeature(features: Uint8Array, bit: number): boolean {
  const byteIndex = Math.floor(bit / 8)
  const bitIndex = bit % 8

  if (byteIndex >= features.length) {
    return false
  }

  // Features são armazenados em formato little-endian de bits
  const reversedByteIndex = features.length - 1 - byteIndex
  return (features[reversedByteIndex] & (1 << bitIndex)) !== 0
}

/**
 * Define um feature bit
 *
 * @param features - Array de bytes de features
 * @param bit - Número do bit a definir
 * @returns Novo array com o bit definido
 */
export function setFeature(features: Uint8Array, bit: number): Uint8Array {
  const byteIndex = Math.floor(bit / 8)
  const bitIndex = bit % 8
  const requiredLength = byteIndex + 1

  // Sempre criar um novo array com o tamanho necessário e copiar os dados
  const result = new Uint8Array(requiredLength)
  const copyLength = Math.min(features.length, requiredLength)
  result.set(features.slice(-copyLength), requiredLength - copyLength)

  const reversedByteIndex = result.length - 1 - byteIndex
  result[reversedByteIndex] |= 1 << bitIndex

  return result
}

/**
 * Remove um feature bit
 *
 * @param features - Array de bytes de features
 * @param bit - Número do bit a remover
 * @returns Novo array com o bit removido
 */
export function clearFeature(features: Uint8Array, bit: number): Uint8Array {
  const byteIndex = Math.floor(bit / 8)
  const bitIndex = bit % 8

  if (byteIndex >= features.length) {
    return features
  }

  const result = new Uint8Array(features)
  const reversedByteIndex = result.length - 1 - byteIndex
  result[reversedByteIndex] &= ~(1 << bitIndex)

  return result
}

/**
 * Negocia features entre local e remoto
 * Retorna features suportados por ambos
 *
 * @param localFeatures - Features locais
 * @param remoteFeatures - Features remotos
 * @returns Features negociados
 */
export function negotiateFeatures(
  localFeatures: Uint8Array,
  remoteFeatures: Uint8Array,
): Uint8Array {
  const maxLen = Math.max(localFeatures.length, remoteFeatures.length)
  const result = new Uint8Array(maxLen)

  // Expandir arrays para mesmo tamanho (padding à esquerda)
  const localPadded = new Uint8Array(maxLen)
  const remotePadded = new Uint8Array(maxLen)
  localPadded.set(localFeatures, maxLen - localFeatures.length)
  remotePadded.set(remoteFeatures, maxLen - remoteFeatures.length)

  // AND bit a bit
  for (let i = 0; i < maxLen; i++) {
    result[i] = localPadded[i] & remotePadded[i]
  }

  // Remover bytes zero à esquerda
  let startIndex = 0
  while (startIndex < result.length - 1 && result[startIndex] === 0) {
    startIndex++
  }

  return result.subarray(startIndex)
}

/**
 * Verifica se features são compatíveis
 * Um feature é incompatível se é "even" (obrigatório) e não suportado
 *
 * @param localFeatures - Features locais
 * @param remoteFeatures - Features remotos
 * @returns true se compatíveis
 */
export function areFeaturesCompatible(
  localFeatures: Uint8Array,
  remoteFeatures: Uint8Array,
): boolean {
  // Verificar features obrigatórios remotos
  for (let bit = 0; bit < remoteFeatures.length * 8; bit += 2) {
    // Bits pares são obrigatórios
    if (hasFeature(remoteFeatures, bit)) {
      // Verificar se temos suporte (bit par ou ímpar)
      if (!hasFeature(localFeatures, bit) && !hasFeature(localFeatures, bit + 1)) {
        return false
      }
    }
  }

  // Verificar features obrigatórios locais
  for (let bit = 0; bit < localFeatures.length * 8; bit += 2) {
    if (hasFeature(localFeatures, bit)) {
      if (!hasFeature(remoteFeatures, bit) && !hasFeature(remoteFeatures, bit + 1)) {
        return false
      }
    }
  }

  return true
}

/**
 * Cria feature vector com os features especificados
 *
 * @param featureBits - Array de bits de features a definir
 * @returns Feature vector
 */
export function createFeatureVector(featureBits: number[]): Uint8Array {
  if (featureBits.length === 0) {
    return new Uint8Array(0)
  }

  const maxBit = Math.max(...featureBits)
  const byteLength = Math.floor(maxBit / 8) + 1
  let features: Uint8Array = new Uint8Array(byteLength)

  for (const bit of featureBits) {
    features = setFeature(features, bit)
  }

  return features
}

/**
 * Lista todos os features definidos em um feature vector
 *
 * @param features - Feature vector
 * @returns Array de números dos bits definidos
 */
export function listFeatures(features: Uint8Array): number[] {
  const bits: number[] = []

  for (let bit = 0; bit < features.length * 8; bit++) {
    if (hasFeature(features, bit)) {
      bits.push(bit)
    }
  }

  return bits
}

// ==========================================
// INIT MESSAGE
// ==========================================

/**
 * Codifica mensagem Init
 *
 * @param msg - Mensagem Init
 * @returns Bytes codificados
 */
export function encodeInitMessage(msg: InitMessage): Uint8Array {
  // Calcular tamanho total
  const globalFeaturesLen = msg.globalfeatures.length
  const featuresLen = msg.features.length

  // Codificar TLVs
  const tlvBytes = encodeInitTlvs(msg.tlvs)

  // Tamanho: 2 (type) + 2 (gflen) + gflen + 2 (flen) + flen + tlvs
  const totalLen = 2 + 2 + globalFeaturesLen + 2 + featuresLen + tlvBytes.length
  const result = new Uint8Array(totalLen)
  const view = new DataView(result.buffer)

  let offset = 0

  // Type (u16)
  view.setUint16(offset, LightningMessageType.INIT, false)
  offset += 2

  // gflen (u16)
  view.setUint16(offset, globalFeaturesLen, false)
  offset += 2

  // globalfeatures
  result.set(msg.globalfeatures, offset)
  offset += globalFeaturesLen

  // flen (u16)
  view.setUint16(offset, featuresLen, false)
  offset += 2

  // features
  result.set(msg.features, offset)
  offset += featuresLen

  // TLVs
  result.set(tlvBytes, offset)

  return result
}

/**
 * Decodifica mensagem Init
 *
 * @param data - Bytes da mensagem (incluindo type)
 * @returns Mensagem Init decodificada
 */
export function decodeInitMessage(data: Uint8Array): InitMessage {
  if (data.length < 6) {
    throw new Error('Init message too short')
  }

  const view = new DataView(data.buffer, data.byteOffset)
  let offset = 0

  // Type
  const type = view.getUint16(offset, false)
  if (type !== LightningMessageType.INIT) {
    throw new Error(`Expected INIT message type, got ${type}`)
  }
  offset += 2

  // gflen
  const gflen = view.getUint16(offset, false)
  offset += 2

  if (offset + gflen > data.length) {
    throw new Error('Invalid gflen')
  }

  // globalfeatures
  const globalfeatures = data.slice(offset, offset + gflen)
  offset += gflen

  // flen
  if (offset + 2 > data.length) {
    throw new Error('Missing flen')
  }
  const flen = view.getUint16(offset, false)
  offset += 2

  if (offset + flen > data.length) {
    throw new Error('Invalid flen')
  }

  // features
  const features = data.slice(offset, offset + flen)
  offset += flen

  // TLVs (resto da mensagem)
  const tlvData = data.subarray(offset)
  const tlvs = decodeInitTlvs(tlvData)

  return {
    type: LightningMessageType.INIT,
    gflen,
    globalfeatures,
    flen,
    features,
    tlvs,
  }
}

/**
 * Codifica TLVs da mensagem Init
 */
function encodeInitTlvs(tlvs: InitMessage['tlvs']): Uint8Array {
  const records: TlvStream = []

  for (const tlv of tlvs) {
    if (tlv.type === InitTlvType.NETWORKS) {
      // Concatenar chain hashes
      const value = new Uint8Array(tlv.chains.length * 32)
      for (let i = 0; i < tlv.chains.length; i++) {
        value.set(tlv.chains[i], i * 32)
      }
      records.push(createTlvRecord(InitTlvType.NETWORKS, value))
    } else if (tlv.type === InitTlvType.REMOTE_ADDR) {
      records.push(createTlvRecord(InitTlvType.REMOTE_ADDR, tlv.data))
    }
  }

  return encodeTlvStream(records)
}

/**
 * Decodifica TLVs da mensagem Init
 */
function decodeInitTlvs(data: Uint8Array): InitMessage['tlvs'] {
  if (data.length === 0) {
    return []
  }

  const records = decodeTlvStream(data)
  const result: InitMessage['tlvs'] = []

  for (const record of records) {
    if (record.type === BigInt(InitTlvType.NETWORKS)) {
      // Decodificar chain hashes
      const chains: ChainHash[] = []
      for (let i = 0; i < record.value.length; i += 32) {
        chains.push(record.value.slice(i, i + 32))
      }
      result.push({ type: InitTlvType.NETWORKS, chains })
    } else if (record.type === BigInt(InitTlvType.REMOTE_ADDR)) {
      result.push({ type: InitTlvType.REMOTE_ADDR, data: record.value })
    }
    // Ignorar TLVs desconhecidos ímpares (odd = optional)
    // TLVs pares desconhecidos deveriam causar erro, mas por simplicidade ignoramos
  }

  return result
}

/**
 * Cria mensagem Init padrão
 *
 * @param features - Features a anunciar
 * @param chains - Chain hashes suportados (opcional)
 * @returns Mensagem Init
 */
export function createInitMessage(features: Uint8Array, chains?: ChainHash[]): InitMessage {
  const tlvs: InitMessage['tlvs'] = []

  if (chains && chains.length > 0) {
    tlvs.push({ type: InitTlvType.NETWORKS, chains })
  }

  return {
    type: LightningMessageType.INIT,
    gflen: 0,
    globalfeatures: new Uint8Array(0),
    flen: features.length,
    features,
    tlvs,
  }
}

// ==========================================
// ERROR MESSAGE
// ==========================================

/**
 * Codifica mensagem Error
 *
 * @param msg - Mensagem Error
 * @returns Bytes codificados
 */
export function encodeErrorMessage(msg: ErrorMessage): Uint8Array {
  // Tamanho: 2 (type) + 32 (channel_id) + 2 (len) + len
  const totalLen = 2 + 32 + 2 + msg.data.length
  const result = new Uint8Array(totalLen)
  const view = new DataView(result.buffer)

  let offset = 0

  // Type
  view.setUint16(offset, LightningMessageType.ERROR, false)
  offset += 2

  // channel_id
  result.set(msg.channelId, offset)
  offset += 32

  // len
  view.setUint16(offset, msg.data.length, false)
  offset += 2

  // data
  result.set(msg.data, offset)

  return result
}

/**
 * Decodifica mensagem Error
 *
 * @param data - Bytes da mensagem
 * @returns Mensagem Error decodificada
 */
export function decodeErrorMessage(data: Uint8Array): ErrorMessage {
  if (data.length < 36) {
    throw new Error('Error message too short')
  }

  const view = new DataView(data.buffer, data.byteOffset)
  let offset = 0

  // Type
  const type = view.getUint16(offset, false)
  if (type !== LightningMessageType.ERROR) {
    throw new Error(`Expected ERROR message type, got ${type}`)
  }
  offset += 2

  // channel_id
  const channelId = data.slice(offset, offset + 32)
  offset += 32

  // len
  const len = view.getUint16(offset, false)
  offset += 2

  if (offset + len > data.length) {
    throw new Error('Invalid error data length')
  }

  // data
  const errorData = data.slice(offset, offset + len)

  return {
    type: LightningMessageType.ERROR,
    channelId,
    len,
    data: errorData,
  }
}

/**
 * Cria mensagem Error
 *
 * @param channelId - ID do canal (ou all-zeros para erro global)
 * @param message - Mensagem de erro (string ou bytes)
 * @returns Mensagem Error
 */
export function createErrorMessage(
  channelId: ChannelId,
  message: string | Uint8Array,
): ErrorMessage {
  const data =
    typeof message === 'string' ? new TextEncoder().encode(message) : (message as Uint8Array)

  return {
    type: LightningMessageType.ERROR,
    channelId,
    len: data.length,
    data,
  }
}

/**
 * Obtém mensagem de erro como string
 *
 * @param msg - Mensagem Error
 * @returns Mensagem como string
 */
export function getErrorString(msg: ErrorMessage): string {
  return new TextDecoder().decode(msg.data)
}

/**
 * Verifica se o erro é global (não específico de canal)
 *
 * @param msg - Mensagem Error
 * @returns true se é erro global
 */
export function isGlobalError(msg: ErrorMessage): boolean {
  return msg.channelId.every(b => b === 0)
}

// ==========================================
// WARNING MESSAGE
// ==========================================

/**
 * Codifica mensagem Warning
 *
 * @param msg - Mensagem Warning
 * @returns Bytes codificados
 */
export function encodeWarningMessage(msg: WarningMessage): Uint8Array {
  const totalLen = 2 + 32 + 2 + msg.data.length
  const result = new Uint8Array(totalLen)
  const view = new DataView(result.buffer)

  let offset = 0

  view.setUint16(offset, LightningMessageType.WARNING, false)
  offset += 2

  result.set(msg.channelId, offset)
  offset += 32

  view.setUint16(offset, msg.data.length, false)
  offset += 2

  result.set(msg.data, offset)

  return result
}

/**
 * Decodifica mensagem Warning
 *
 * @param data - Bytes da mensagem
 * @returns Mensagem Warning decodificada
 */
export function decodeWarningMessage(data: Uint8Array): WarningMessage {
  if (data.length < 36) {
    throw new Error('Warning message too short')
  }

  const view = new DataView(data.buffer, data.byteOffset)
  let offset = 0

  const type = view.getUint16(offset, false)
  if (type !== LightningMessageType.WARNING) {
    throw new Error(`Expected WARNING message type, got ${type}`)
  }
  offset += 2

  const channelId = data.slice(offset, offset + 32)
  offset += 32

  const len = view.getUint16(offset, false)
  offset += 2

  if (offset + len > data.length) {
    throw new Error('Invalid warning data length')
  }

  const warningData = data.slice(offset, offset + len)

  return {
    type: LightningMessageType.WARNING,
    channelId,
    len,
    data: warningData,
  }
}

/**
 * Cria mensagem Warning
 *
 * @param channelId - ID do canal (ou all-zeros para warning global)
 * @param message - Mensagem de warning
 * @returns Mensagem Warning
 */
export function createWarningMessage(
  channelId: ChannelId,
  message: string | Uint8Array,
): WarningMessage {
  const data =
    typeof message === 'string' ? new TextEncoder().encode(message) : (message as Uint8Array)

  return {
    type: LightningMessageType.WARNING,
    channelId,
    len: data.length,
    data,
  }
}

// ==========================================
// PING MESSAGE
// ==========================================

/**
 * Codifica mensagem Ping
 *
 * @param msg - Mensagem Ping
 * @returns Bytes codificados
 */
export function encodePingMessage(msg: PingMessage): Uint8Array {
  const totalLen = 2 + 2 + 2 + msg.ignored.length
  const result = new Uint8Array(totalLen)
  const view = new DataView(result.buffer)

  let offset = 0

  view.setUint16(offset, LightningMessageType.PING, false)
  offset += 2

  view.setUint16(offset, msg.numPongBytes, false)
  offset += 2

  view.setUint16(offset, msg.byteslen, false)
  offset += 2

  result.set(msg.ignored, offset)

  return result
}

/**
 * Decodifica mensagem Ping
 *
 * @param data - Bytes da mensagem
 * @returns Mensagem Ping decodificada
 */
export function decodePingMessage(data: Uint8Array): PingMessage {
  if (data.length < 6) {
    throw new Error('Ping message too short')
  }

  const view = new DataView(data.buffer, data.byteOffset)
  let offset = 0

  const type = view.getUint16(offset, false)
  if (type !== LightningMessageType.PING) {
    throw new Error(`Expected PING message type, got ${type}`)
  }
  offset += 2

  const numPongBytes = view.getUint16(offset, false)
  offset += 2

  const byteslen = view.getUint16(offset, false)
  offset += 2

  if (offset + byteslen > data.length) {
    throw new Error('Invalid ping byteslen')
  }

  const ignored = data.slice(offset, offset + byteslen)

  return {
    type: LightningMessageType.PING,
    numPongBytes,
    byteslen,
    ignored,
  }
}

/**
 * Cria mensagem Ping
 *
 * @param numPongBytes - Número de bytes esperados no Pong
 * @param paddingLength - Tamanho do padding (opcional)
 * @returns Mensagem Ping
 */
export function createPingMessage(
  numPongBytes: number = 0,
  paddingLength: number = 0,
): PingMessage {
  return {
    type: LightningMessageType.PING,
    numPongBytes,
    byteslen: paddingLength,
    ignored: new Uint8Array(paddingLength),
  }
}

// ==========================================
// PONG MESSAGE
// ==========================================

/**
 * Codifica mensagem Pong
 *
 * @param msg - Mensagem Pong
 * @returns Bytes codificados
 */
export function encodePongMessage(msg: PongMessage): Uint8Array {
  const totalLen = 2 + 2 + msg.ignored.length
  const result = new Uint8Array(totalLen)
  const view = new DataView(result.buffer)

  let offset = 0

  view.setUint16(offset, LightningMessageType.PONG, false)
  offset += 2

  view.setUint16(offset, msg.byteslen, false)
  offset += 2

  result.set(msg.ignored, offset)

  return result
}

/**
 * Decodifica mensagem Pong
 *
 * @param data - Bytes da mensagem
 * @returns Mensagem Pong decodificada
 */
export function decodePongMessage(data: Uint8Array): PongMessage {
  if (data.length < 4) {
    throw new Error('Pong message too short')
  }

  const view = new DataView(data.buffer, data.byteOffset)
  let offset = 0

  const type = view.getUint16(offset, false)
  if (type !== LightningMessageType.PONG) {
    throw new Error(`Expected PONG message type, got ${type}`)
  }
  offset += 2

  const byteslen = view.getUint16(offset, false)
  offset += 2

  if (offset + byteslen > data.length) {
    throw new Error('Invalid pong byteslen')
  }

  const ignored = data.slice(offset, offset + byteslen)

  return {
    type: LightningMessageType.PONG,
    byteslen,
    ignored,
  }
}

/**
 * Cria mensagem Pong em resposta a um Ping
 *
 * @param ping - Mensagem Ping recebida
 * @returns Mensagem Pong
 */
export function createPongMessage(ping: PingMessage): PongMessage {
  // byteslen deve ser igual a numPongBytes do ping
  const byteslen = Math.min(ping.numPongBytes, MAX_MESSAGE_SIZE - 4)

  return {
    type: LightningMessageType.PONG,
    byteslen,
    ignored: new Uint8Array(byteslen),
  }
}

// ==========================================
// MESSAGE FRAMING
// ==========================================

/**
 * Obtém o tipo de uma mensagem Lightning
 *
 * @param data - Bytes da mensagem
 * @returns Tipo da mensagem
 */
export function getMessageType(data: Uint8Array): LightningMessageType {
  if (data.length < 2) {
    throw new Error('Message too short to have type')
  }

  const view = new DataView(data.buffer, data.byteOffset)
  return view.getUint16(0, false)
}

/**
 * Valida se uma mensagem está dentro do tamanho máximo
 *
 * @param data - Bytes da mensagem
 * @returns true se válida
 */
export function isValidMessageSize(data: Uint8Array): boolean {
  return data.length <= MAX_MESSAGE_SIZE
}

/**
 * Decodifica qualquer mensagem Lightning
 *
 * @param data - Bytes da mensagem
 * @returns Mensagem decodificada
 */
export function decodeLightningMessage(
  data: Uint8Array,
): InitMessage | ErrorMessage | WarningMessage | PingMessage | PongMessage {
  const type = getMessageType(data)

  switch (type) {
    case LightningMessageType.INIT:
      return decodeInitMessage(data)
    case LightningMessageType.ERROR:
      return decodeErrorMessage(data)
    case LightningMessageType.WARNING:
      return decodeWarningMessage(data)
    case LightningMessageType.PING:
      return decodePingMessage(data)
    case LightningMessageType.PONG:
      return decodePongMessage(data)
    default:
      throw new Error(`Unsupported message type: ${type}`)
  }
}

/**
 * Codifica qualquer mensagem Lightning suportada
 *
 * @param msg - Mensagem a codificar
 * @returns Bytes codificados
 */
export function encodeLightningMessage(
  msg: InitMessage | ErrorMessage | WarningMessage | PingMessage | PongMessage,
): Uint8Array {
  switch (msg.type) {
    case LightningMessageType.INIT:
      return encodeInitMessage(msg as InitMessage)
    case LightningMessageType.ERROR:
      return encodeErrorMessage(msg as ErrorMessage)
    case LightningMessageType.WARNING:
      return encodeWarningMessage(msg as WarningMessage)
    case LightningMessageType.PING:
      return encodePingMessage(msg as PingMessage)
    case LightningMessageType.PONG:
      return encodePongMessage(msg as PongMessage)
    default:
      throw new Error(`Unsupported message type: ${(msg as LightningMessage).type}`)
  }
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Compara dois channel IDs
 *
 * @param a - Primeiro channel ID
 * @param b - Segundo channel ID
 * @returns true se iguais
 */
export function channelIdEquals(a: ChannelId, b: ChannelId): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Cria channel ID a partir de funding transaction
 *
 * @param fundingTxid - TXID da funding transaction (32 bytes)
 * @param fundingOutputIndex - Índice do output
 * @returns Channel ID (32 bytes)
 */
export function deriveChannelId(fundingTxid: Uint8Array, fundingOutputIndex: number): ChannelId {
  if (fundingTxid.length !== 32) {
    throw new Error('Funding txid must be 32 bytes')
  }

  const channelId = new Uint8Array(32)
  channelId.set(fundingTxid)

  // XOR últimos 2 bytes com output index
  const view = new DataView(channelId.buffer)
  const currentValue = view.getUint16(30, false)
  view.setUint16(30, currentValue ^ fundingOutputIndex, false)

  return channelId
}

/**
 * Converte channel ID para string hexadecimal
 *
 * @param channelId - Channel ID
 * @returns String hexadecimal
 */
export function channelIdToHex(channelId: ChannelId): string {
  return Array.from(channelId)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Converte string hexadecimal para channel ID
 *
 * @param hex - String hexadecimal
 * @returns Channel ID
 */
export function hexToChannelId(hex: string): ChannelId {
  if (hex.length !== 64) {
    throw new Error('Channel ID hex must be 64 characters')
  }

  const result = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    result[i] = parseInt(hex.substr(i * 2, 2), 16)
  }

  return result
}
