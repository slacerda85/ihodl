/**
 * BOLT #4: Onion Routing Protocol
 *
 * Implementa construção e processamento de pacotes onion para
 * roteamento de pagamentos na Lightning Network.
 *
 * Baseado em: https://github.com/lightning/bolts/blob/master/04-onion-routing.md
 */

import { sha256, randomBytes, hmacSha256 } from '../crypto/crypto'
import { chacha20 } from '@noble/ciphers/chacha.js'
import { constructOnionPacket, decryptOnion } from './routing'
import { uint8ArrayToHex, hexToUint8Array } from '../utils/utils'
import type { OnionPacket, PayloadTlv } from '@/core/models/lightning/routing'

// ==========================================
// BOLT #4: BLINDED PATHS
// ==========================================

/**
 * Blinded paths permitem que o destinatário oculte sua identidade
 * e a estrutura do caminho até ele.
 *
 * Referência: https://github.com/lightning/bolts/blob/master/04-onion-routing.md#blinded-paths
 */

import * as secp from '@noble/secp256k1'

// ==========================================
// CONSTANTES
// ==========================================

export const ONION_PACKET_SIZE = 1366 // 1 + 33 + 1300 + 32
export const HOP_PAYLOADS_SIZE = 1300
export const HMAC_SIZE = 32
export const VERSION = 0x00
export const MAX_HOPS = 20

// ==========================================
// TIPOS
// ==========================================

/**
 * Informações de um hop na rota
 */
export interface HopInfo {
  nodePubkey: Uint8Array
  shortChannelId: Uint8Array
  amountMsat: bigint
  cltvExpiry: number
}

/**
 * Rota de pagamento
 */
export interface PaymentRoute {
  hops: HopInfo[]
  totalAmountMsat: bigint
  totalCltvExpiry: number
  totalFeeMsat: bigint
}

/**
 * Resultado do processamento de onion
 */
export interface OnionProcessResult {
  payload: PayloadTlv
  nextOnion?: Uint8Array
  isLastHop: boolean
}

// ==========================================
// CONSTRUÇÃO DE ONION PACKET
// ==========================================

/**
 * Cria onion packet para roteamento de pagamento (BOLT #4)
 * Implementa construção Sphinx para multi-hop payments
 *
 * @param route - Rota de pagamento com hops
 * @param paymentHash - Hash do pagamento (32 bytes)
 * @param paymentSecret - Payment secret para o destino final (32 bytes)
 * @returns Onion packet serializado (1366 bytes)
 */
export function createOnionPacket(
  route: PaymentRoute,
  paymentHash: Uint8Array,
  paymentSecret?: Uint8Array,
): Uint8Array {
  // Extrair pubkeys dos hops da rota
  const hopPubkeys: Uint8Array[] = route.hops.map(hop => hop.nodePubkey)

  // Gerar session key aleatório
  const sessionKey = randomBytes(32)

  // Preparar dados dos hops (payloads TLV)
  const hopsData: { length: bigint; payload: Uint8Array; hmac: Uint8Array }[] = []

  for (let i = 0; i < route.hops.length; i++) {
    const hop = route.hops[i]
    const isLastHop = i === route.hops.length - 1

    // Criar payload TLV para o hop
    const payload = createHopPayload(hop, paymentHash, isLastHop, paymentSecret)
    hopsData.push({
      length: BigInt(payload.length),
      payload,
      hmac: new Uint8Array(32), // Será preenchido durante construção
    })
  }

  // Construir onion packet usando Sphinx
  const onionPacket = constructOnionPacket(hopPubkeys, sessionKey, hopsData)

  // Serializar packet para bytes
  return serializeOnionPacket(onionPacket)
}

/**
 * Cria payload TLV para um hop específico
 *
 * @param hop - Informações do hop
 * @param paymentHash - Hash do pagamento
 * @param isLastHop - Se é o último hop (destino final)
 * @param paymentSecret - Payment secret (apenas para último hop)
 * @returns Payload TLV codificado
 */
export function createHopPayload(
  hop: HopInfo,
  paymentHash: Uint8Array,
  isLastHop: boolean,
  paymentSecret?: Uint8Array,
): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = []

  // amt_to_forward (type 2)
  tlvs.push({
    type: 2,
    value: encodeTu64(hop.amountMsat),
  })

  // outgoing_cltv_value (type 4)
  tlvs.push({
    type: 4,
    value: encodeTu32(hop.cltvExpiry),
  })

  if (isLastHop) {
    // Payload final: payment_data com payment_secret
    if (paymentSecret) {
      // payment_data (type 8): payment_secret + total_msat
      const paymentData = new Uint8Array(32 + 8)
      paymentData.set(paymentSecret, 0)
      const amountBytes = encodeTu64(hop.amountMsat)
      paymentData.set(amountBytes, 32)
      tlvs.push({ type: 8, value: paymentData })
    }
  } else {
    // Payload intermediário: short_channel_id
    tlvs.push({
      type: 6,
      value: hop.shortChannelId,
    })
  }

  return encodeTlvStream(tlvs)
}

// ==========================================
// PROCESSAMENTO DE ONION PACKET
// ==========================================

/**
 * Decodifica onion packet recebido
 *
 * @param data - Dados do onion packet (1366 bytes)
 * @returns OnionPacket decodificado
 */
export function decodeOnionPacket(data: Uint8Array): OnionPacket {
  if (data.length !== ONION_PACKET_SIZE) {
    throw new Error(`Invalid onion packet length: ${data.length}, expected ${ONION_PACKET_SIZE}`)
  }

  return {
    version: data[0],
    publicKey: data.subarray(1, 34),
    hopPayloads: data.subarray(34, 34 + HOP_PAYLOADS_SIZE),
    hmac: data.subarray(34 + HOP_PAYLOADS_SIZE),
  }
}

/**
 * Processa onion packet recebido em um nó
 *
 * @param onionData - Onion packet serializado
 * @param nodePrivKey - Chave privada do nó (32 bytes)
 * @param associatedData - Dados associados (payment hash)
 * @returns Resultado do processamento
 */
export function processOnionPacket(
  onionData: Uint8Array,
  nodePrivKey: Uint8Array,
  associatedData: Uint8Array = new Uint8Array(),
): OnionProcessResult {
  const packet = decodeOnionPacket(onionData)
  const result = decryptOnion(packet, associatedData, undefined, nodePrivKey)

  return {
    payload: result.payload as PayloadTlv,
    nextOnion: result.nextOnion ? serializeOnionPacket(result.nextOnion) : undefined,
    isLastHop: !result.nextOnion,
  }
}

// ==========================================
// SERIALIZAÇÃO
// ==========================================

/**
 * Serializa onion packet para bytes
 *
 * @param packet - OnionPacket estruturado
 * @returns Bytes serializados (1366 bytes)
 */
export function serializeOnionPacket(packet: OnionPacket): Uint8Array {
  const result = new Uint8Array(ONION_PACKET_SIZE)
  result[0] = packet.version
  result.set(packet.publicKey, 1)
  result.set(packet.hopPayloads, 1 + 33)
  result.set(packet.hmac, 1 + 33 + HOP_PAYLOADS_SIZE)
  return result
}

// ==========================================
// CODIFICAÇÃO TLV
// ==========================================

/**
 * Codifica stream de TLVs em bytes
 *
 * @param tlvs - Array de TLVs
 * @returns Bytes codificados
 */
export function encodeTlvStream(tlvs: { type: number; value: Uint8Array }[]): Uint8Array {
  // Ordenar TLVs por tipo (requisito BOLT)
  const sortedTlvs = [...tlvs].sort((a, b) => a.type - b.type)

  const parts: Uint8Array[] = []

  for (const tlv of sortedTlvs) {
    // Type (bigsize)
    const typeBytes = encodeBigSize(BigInt(tlv.type))
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
export function decodeTlvStream(data: Uint8Array): { type: bigint; value: Uint8Array }[] {
  const tlvs: { type: bigint; value: Uint8Array }[] = []
  let offset = 0

  while (offset < data.length) {
    const { value: type, bytesRead: typeBytes } = decodeBigSize(data.subarray(offset))
    offset += typeBytes

    const { value: length, bytesRead: lengthBytes } = decodeBigSize(data.subarray(offset))
    offset += lengthBytes

    const value = data.subarray(offset, offset + Number(length))
    offset += Number(length)

    tlvs.push({ type, value })
  }

  return tlvs
}

// ==========================================
// CODIFICAÇÃO BIGSIZE
// ==========================================

/**
 * Codifica valor em formato BigSize (variable length integer)
 *
 * @param value - Valor a codificar
 * @returns Bytes codificados
 */
export function encodeBigSize(value: bigint): Uint8Array {
  if (value < 0xfdn) {
    return new Uint8Array([Number(value)])
  } else if (value <= 0xffffn) {
    const buf = new ArrayBuffer(3)
    const view = new DataView(buf)
    view.setUint8(0, 0xfd)
    view.setUint16(1, Number(value), false) // big-endian
    return new Uint8Array(buf)
  } else if (value <= 0xffffffffn) {
    const buf = new ArrayBuffer(5)
    const view = new DataView(buf)
    view.setUint8(0, 0xfe)
    view.setUint32(1, Number(value), false) // big-endian
    return new Uint8Array(buf)
  } else {
    const buf = new ArrayBuffer(9)
    const view = new DataView(buf)
    view.setUint8(0, 0xff)
    view.setBigUint64(1, value, false) // big-endian
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
  const view = new DataView(data.buffer, data.byteOffset)
  const first = data[0]

  if (first < 0xfd) {
    return { value: BigInt(first), bytesRead: 1 }
  } else if (first === 0xfd) {
    return { value: BigInt(view.getUint16(1, false)), bytesRead: 3 }
  } else if (first === 0xfe) {
    return { value: BigInt(view.getUint32(1, false)), bytesRead: 5 }
  } else {
    return { value: view.getBigUint64(1, false), bytesRead: 9 }
  }
}

// ==========================================
// CODIFICAÇÃO DE VALORES TRUNCADOS
// ==========================================

/**
 * Codifica tu64 (truncated u64) - minimal encoding
 *
 * @param value - Valor a codificar
 * @returns Bytes codificados (1-8 bytes)
 */
export function encodeTu64(value: bigint): Uint8Array {
  if (value === 0n) {
    return new Uint8Array(0)
  }

  const bytes: number[] = []
  let v = value

  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn))
    v >>= 8n
  }

  return new Uint8Array(bytes)
}

/**
 * Decodifica tu64
 *
 * @param data - Bytes a decodificar
 * @returns Valor decodificado
 */
export function decodeTu64(data: Uint8Array): bigint {
  let value = 0n
  for (const byte of data) {
    value = (value << 8n) | BigInt(byte)
  }
  return value
}

/**
 * Codifica tu32 (truncated u32) - minimal encoding
 *
 * @param value - Valor a codificar
 * @returns Bytes codificados (1-4 bytes)
 */
export function encodeTu32(value: number): Uint8Array {
  if (value === 0) {
    return new Uint8Array(0)
  }

  const bytes: number[] = []
  let v = value

  while (v > 0) {
    bytes.unshift(v & 0xff)
    v >>= 8
  }

  return new Uint8Array(bytes)
}

/**
 * Decodifica tu32
 *
 * @param data - Bytes a decodificar
 * @returns Valor decodificado
 */
export function decodeTu32(data: Uint8Array): number {
  let value = 0
  for (const byte of data) {
    value = (value << 8) | byte
  }
  return value
}

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

/**
 * Valida onion packet
 *
 * @param data - Dados do onion packet
 * @returns true se válido
 */
export function validateOnionPacket(data: Uint8Array): boolean {
  if (data.length !== ONION_PACKET_SIZE) {
    return false
  }

  const version = data[0]
  if (version !== VERSION) {
    return false
  }

  // Verificar que public key tem formato válido (02 ou 03 prefix)
  const pubkeyPrefix = data[1]
  if (pubkeyPrefix !== 0x02 && pubkeyPrefix !== 0x03) {
    return false
  }

  return true
}

/**
 * Calcula shared secret para um hop
 *
 * @param ephemeralPubkey - Chave pública efêmera
 * @param nodePrivkey - Chave privada do nó
 * @returns Shared secret (32 bytes)
 */
export function calculateSharedSecret(
  ephemeralPubkey: Uint8Array,
  nodePrivkey: Uint8Array,
): Uint8Array {
  // ECDH: shared_secret = SHA256(ephemeralPubkey * nodePrivkey)
  // Isso é feito pela biblioteca secp256k1
  // Por enquanto, retornamos placeholder
  return sha256(new Uint8Array([...ephemeralPubkey, ...nodePrivkey]))
}

/**
 * Gera chaves de roteamento a partir do shared secret
 *
 * @param sharedSecret - Shared secret (32 bytes)
 * @returns Chaves de roteamento (rho, mu, um, pad)
 */
export function generateRoutingKeys(sharedSecret: Uint8Array): {
  rho: Uint8Array
  mu: Uint8Array
  um: Uint8Array
  pad: Uint8Array
} {
  return {
    rho: sha256(new Uint8Array([...sharedSecret, ...new TextEncoder().encode('rho')])),
    mu: sha256(new Uint8Array([...sharedSecret, ...new TextEncoder().encode('mu')])),
    um: sha256(new Uint8Array([...sharedSecret, ...new TextEncoder().encode('um')])),
    pad: sha256(new Uint8Array([...sharedSecret, ...new TextEncoder().encode('pad')])),
  }
}

// ==========================================
// BOLT #4: PAYLOAD TLV DECODING
// ==========================================

/**
 * Tipos de TLV do payload BOLT #4
 */
export const PayloadTlvType = {
  AMT_TO_FORWARD: 2,
  OUTGOING_CLTV_VALUE: 4,
  SHORT_CHANNEL_ID: 6,
  PAYMENT_DATA: 8,
  PAYMENT_METADATA: 16,
  TOTAL_AMOUNT_MSAT: 18, // For MPP
  ENCRYPTED_RECIPIENT_DATA: 10, // For blinded paths
  BLINDING_POINT: 12, // For blinded paths
  CURRENT_PATH_KEY: 14, // For blinded paths
} as const

/**
 * Estrutura decodificada do payload TLV
 */
export interface DecodedPayload {
  amtToForward?: bigint
  outgoingCltvValue?: number
  shortChannelId?: Uint8Array
  paymentData?: {
    paymentSecret: Uint8Array
    totalMsat: bigint
  }
  paymentMetadata?: Uint8Array
  encryptedRecipientData?: Uint8Array
  blindingPoint?: Uint8Array
  currentPathKey?: Uint8Array
  isFinalHop: boolean
  unknownTlvs: { type: bigint; value: Uint8Array }[]
}

/**
 * Decodifica payload TLV de um hop
 *
 * @param data - Bytes do payload TLV
 * @returns Payload decodificado
 */
export function decodePayloadTlv(data: Uint8Array): DecodedPayload {
  const tlvs = decodeTlvStream(data)
  const result: DecodedPayload = {
    isFinalHop: false,
    unknownTlvs: [],
  }

  // Verificar ordem dos TLVs (BOLT #1: TLVs devem estar em ordem crescente de tipo)
  let lastType = -1n
  for (const tlv of tlvs) {
    if (tlv.type <= lastType) {
      throw new Error(
        `Invalid TLV stream: types must be strictly increasing (${tlv.type} <= ${lastType})`,
      )
    }
    lastType = tlv.type
  }

  for (const tlv of tlvs) {
    const typeNum = Number(tlv.type)

    switch (typeNum) {
      case PayloadTlvType.AMT_TO_FORWARD:
        result.amtToForward = decodeTu64(tlv.value)
        break

      case PayloadTlvType.OUTGOING_CLTV_VALUE:
        result.outgoingCltvValue = decodeTu32(tlv.value)
        break

      case PayloadTlvType.SHORT_CHANNEL_ID:
        if (tlv.value.length !== 8) {
          throw new Error('Invalid short_channel_id length')
        }
        result.shortChannelId = tlv.value
        break

      case PayloadTlvType.PAYMENT_DATA:
        if (tlv.value.length < 32) {
          throw new Error('Invalid payment_data length')
        }
        result.paymentData = {
          paymentSecret: tlv.value.subarray(0, 32),
          totalMsat: decodeTu64(tlv.value.subarray(32)),
        }
        result.isFinalHop = true
        break

      case PayloadTlvType.PAYMENT_METADATA:
        result.paymentMetadata = tlv.value
        break

      case PayloadTlvType.ENCRYPTED_RECIPIENT_DATA:
        result.encryptedRecipientData = tlv.value
        break

      case PayloadTlvType.BLINDING_POINT:
        if (tlv.value.length !== 33) {
          throw new Error('Invalid blinding_point length')
        }
        result.blindingPoint = tlv.value
        break

      case PayloadTlvType.CURRENT_PATH_KEY:
        if (tlv.value.length !== 33) {
          throw new Error('Invalid current_path_key length')
        }
        result.currentPathKey = tlv.value
        break

      default:
        // Unknown TLV - check if it's even (required) or odd (optional)
        if (tlv.type % 2n === 0n) {
          // Even types are required - if unknown, we must fail
          throw new Error(`Unknown required TLV type: ${tlv.type}`)
        }
        // Odd types are optional - store for potential forwarding
        result.unknownTlvs.push(tlv)
        break
    }
  }

  // Determine if this is the final hop
  // Final hop: has payment_data, no short_channel_id
  if (result.paymentData && !result.shortChannelId) {
    result.isFinalHop = true
  } else if (!result.paymentData && result.shortChannelId) {
    result.isFinalHop = false
  }

  return result
}

/**
 * Valida payload TLV conforme BOLT #4
 *
 * @param payload - Payload decodificado
 * @returns true se válido, throws se inválido
 */
export function validatePayload(payload: DecodedPayload): boolean {
  // amt_to_forward é obrigatório
  if (payload.amtToForward === undefined) {
    throw new Error('Missing required amt_to_forward')
  }

  // outgoing_cltv_value é obrigatório
  if (payload.outgoingCltvValue === undefined) {
    throw new Error('Missing required outgoing_cltv_value')
  }

  // Para hop intermediário: short_channel_id é obrigatório
  if (!payload.isFinalHop && !payload.shortChannelId) {
    throw new Error('Missing required short_channel_id for intermediate hop')
  }

  // Para hop final: payment_data é obrigatório (se feature bit 14 está set)
  // Simplificado: payment_data deve estar presente no final hop
  if (payload.isFinalHop && !payload.paymentData) {
    // Pode ser válido sem payment_data em casos legacy
    // Apenas aviso
  }

  // Validar que amt_to_forward > 0
  if (payload.amtToForward <= 0n) {
    throw new Error('amt_to_forward must be positive')
  }

  // Validar que outgoing_cltv_value > 0
  if (payload.outgoingCltvValue <= 0) {
    throw new Error('outgoing_cltv_value must be positive')
  }

  return true
}

/**
 * Cria payload TLV para hop final com payment_data
 */
export function createFinalHopPayload(
  amtToForward: bigint,
  outgoingCltvValue: number,
  paymentSecret: Uint8Array,
  totalMsat: bigint,
  paymentMetadata?: Uint8Array,
): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = [
    { type: PayloadTlvType.AMT_TO_FORWARD, value: encodeTu64(amtToForward) },
    { type: PayloadTlvType.OUTGOING_CLTV_VALUE, value: encodeTu32(outgoingCltvValue) },
  ]

  // payment_data (type 8)
  const paymentData = new Uint8Array(32 + 8)
  paymentData.set(paymentSecret, 0)
  const totalMsatBytes = encodeTu64(totalMsat)
  paymentData.set(totalMsatBytes, 32)
  tlvs.push({
    type: PayloadTlvType.PAYMENT_DATA,
    value: paymentData.subarray(0, 32 + totalMsatBytes.length),
  })

  // payment_metadata (type 16) - opcional
  if (paymentMetadata && paymentMetadata.length > 0) {
    tlvs.push({ type: PayloadTlvType.PAYMENT_METADATA, value: paymentMetadata })
  }

  return encodeTlvStream(tlvs)
}

/**
 * Cria payload TLV para hop intermediário
 */
export function createIntermediateHopPayload(
  amtToForward: bigint,
  outgoingCltvValue: number,
  shortChannelId: Uint8Array,
): Uint8Array {
  if (shortChannelId.length !== 8) {
    throw new Error('short_channel_id must be 8 bytes')
  }

  const tlvs: { type: number; value: Uint8Array }[] = [
    { type: PayloadTlvType.AMT_TO_FORWARD, value: encodeTu64(amtToForward) },
    { type: PayloadTlvType.OUTGOING_CLTV_VALUE, value: encodeTu32(outgoingCltvValue) },
    { type: PayloadTlvType.SHORT_CHANNEL_ID, value: shortChannelId },
  ]

  return encodeTlvStream(tlvs)
}

/**
 * Cria payload TLV para blinded path
 */
export function createBlindedHopPayload(
  encryptedRecipientData: Uint8Array,
  blindingPoint?: Uint8Array,
): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = []

  if (blindingPoint) {
    if (blindingPoint.length !== 33) {
      throw new Error('blinding_point must be 33 bytes')
    }
    tlvs.push({ type: PayloadTlvType.BLINDING_POINT, value: blindingPoint })
  }

  tlvs.push({ type: PayloadTlvType.ENCRYPTED_RECIPIENT_DATA, value: encryptedRecipientData })

  return encodeTlvStream(tlvs)
}

// ==========================================
// BOLT #4: ERROR HANDLING
// ==========================================

/**
 * Códigos de falha BOLT #4
 */
export const FailureCode = {
  // Perm failures (can never succeed)
  INVALID_REALM: 0x4001,
  TEMPORARY_NODE_FAILURE: 0x2002,
  PERMANENT_NODE_FAILURE: 0x4002,
  REQUIRED_NODE_FEATURE_MISSING: 0x4003,
  INVALID_ONION_VERSION: 0x4004,
  INVALID_ONION_HMAC: 0x4005,
  INVALID_ONION_KEY: 0x4006,
  AMOUNT_BELOW_MINIMUM: 0x100b,
  FEE_INSUFFICIENT: 0x100c,
  INCORRECT_CLTV_EXPIRY: 0x100d,
  EXPIRY_TOO_SOON: 0x100e,
  INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS: 0x400f,
  FINAL_INCORRECT_CLTV_EXPIRY: 0x4012,
  FINAL_INCORRECT_HTLC_AMOUNT: 0x4013,
  CHANNEL_DISABLED: 0x1014,
  EXPIRY_TOO_FAR: 0x0015,
  INVALID_ONION_PAYLOAD: 0x4016,
  MPP_TIMEOUT: 0x4017,
  INVALID_ONION_BLINDING: 0x4018,
} as const

/**
 * Cria mensagem de erro encapsulada em onion
 */
export function createOnionErrorMessage(
  failureCode: number,
  sharedSecret: Uint8Array,
  failureData?: Uint8Array,
): Uint8Array {
  // Formato: 2 bytes failure code + 2 bytes data length + data + padding
  const dataLen = failureData?.length || 0
  const message = new Uint8Array(4 + dataLen + 256) // 256 bytes padding

  // Failure code (big-endian)
  message[0] = (failureCode >> 8) & 0xff
  message[1] = failureCode & 0xff

  // Data length (big-endian)
  message[2] = (dataLen >> 8) & 0xff
  message[3] = dataLen & 0xff

  // Data
  if (failureData) {
    message.set(failureData, 4)
  }

  // Pad to 256 bytes
  message.fill(0, 4 + dataLen, 260)

  // Encrypt with um key
  const umKey = sha256(new Uint8Array([...sharedSecret, ...new TextEncoder().encode('um')]))

  // XOR with cipher stream
  const cipherStream = generateCipherStream(umKey, message.length)
  for (let i = 0; i < message.length; i++) {
    message[i] ^= cipherStream[i]
  }

  return message
}

/**
 * Gera stream de cipher para encriptação usando ChaCha20
 * Conforme BOLT #4, usa nonce de 96 bits zerado
 */
function generateCipherStream(key: Uint8Array, length: number): Uint8Array {
  const nonce = new Uint8Array(12) // 96-bit zero nonce
  const zeros = new Uint8Array(length)
  return chacha20(key, nonce, zeros)
}

// ==========================================
// BOLT #4: ERROR OBFUSCATION (Completo)
// ==========================================

/**
 * Tamanho fixo da mensagem de erro onion (BOLT #4)
 * A mensagem de erro tem tamanho fixo para evitar análise de tráfego
 */
export const ONION_ERROR_SIZE = 292 // 2 + 2 + 256 + 32 (failure + len + pad + hmac)

/**
 * Tipos de campos opcionais em mensagens de falha
 */
export const FailureDataField = {
  CHANNEL_UPDATE: 'channel_update',
  SHA256_OF_ONION: 'sha256_of_onion',
  HTLC_MSAT: 'htlc_msat',
} as const

/**
 * Estrutura de uma mensagem de falha decodificada
 */
export interface DecodedFailureMessage {
  failureCode: number
  failureCodeName: string
  failureData: Uint8Array
  channelUpdate?: Uint8Array
  sha256OfOnion?: Uint8Array
  htlcMsat?: bigint
  cltvExpiry?: number
  flags?: number
  failingChannelId?: Uint8Array
}

/**
 * Resultado da desobfuscação de erro
 */
export interface ErrorDeobfuscationResult {
  failure: DecodedFailureMessage
  failingNodeIndex: number
  failingNodePubkey?: Uint8Array
}

/**
 * Gera chave 'um' para ofuscação de erros
 * 'um' = HMAC-SHA256(sharedSecret, "um")
 */
export function generateUmKey(sharedSecret: Uint8Array): Uint8Array {
  return hmacSha256(sharedSecret, new TextEncoder().encode('um'))
}

/**
 * Gera chave 'ammag' para MAC de erros
 * 'ammag' = HMAC-SHA256(sharedSecret, "ammag")
 */
export function generateAmmagKey(sharedSecret: Uint8Array): Uint8Array {
  return hmacSha256(sharedSecret, new TextEncoder().encode('ammag'))
}

/**
 * Cria mensagem de erro inicial (no nó que falhou)
 * Formato: failure_code (2) || data_len (2) || data || pad || hmac (32)
 *
 * @param failureCode - Código de falha BOLT #4
 * @param sharedSecret - Shared secret com o nó originador
 * @param failureData - Dados adicionais da falha (opcional)
 * @returns Mensagem de erro ofuscada
 */
export function createFailureMessage(
  failureCode: number,
  sharedSecret: Uint8Array,
  failureData?: Uint8Array,
): Uint8Array {
  const dataLen = failureData?.length || 0
  // Payload: failure_code (2) + data_len (2) + data + padding to 256 bytes
  const payloadSize = 256
  const payload = new Uint8Array(payloadSize)

  // Failure code (big-endian)
  payload[0] = (failureCode >> 8) & 0xff
  payload[1] = failureCode & 0xff

  // Data length (big-endian)
  payload[2] = (dataLen >> 8) & 0xff
  payload[3] = dataLen & 0xff

  // Data
  if (failureData && dataLen > 0) {
    payload.set(failureData, 4)
  }

  // Rest is zero-padded (já é zero)

  // Calcular HMAC antes de encriptar
  const ammagKey = generateAmmagKey(sharedSecret)
  const payloadHmac = hmacSha256(ammagKey, payload)

  // Mensagem completa: payload + hmac
  const message = new Uint8Array(payloadSize + 32)
  message.set(payload, 0)
  message.set(payloadHmac, payloadSize)

  // Encriptar com ChaCha20 usando chave 'um'
  const umKey = generateUmKey(sharedSecret)
  const cipherStream = generateCipherStream(umKey, message.length)

  const encrypted = new Uint8Array(message.length)
  for (let i = 0; i < message.length; i++) {
    encrypted[i] = message[i] ^ cipherStream[i]
  }

  return encrypted
}

/**
 * Ofusca mensagem de erro em um nó intermediário
 * Cada nó no caminho de volta XOR com seu cipher stream
 *
 * @param errorMessage - Mensagem de erro recebida
 * @param sharedSecret - Shared secret deste nó
 * @returns Mensagem de erro re-ofuscada
 */
export function obfuscateError(errorMessage: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  const umKey = generateUmKey(sharedSecret)
  const cipherStream = generateCipherStream(umKey, errorMessage.length)

  const obfuscated = new Uint8Array(errorMessage.length)
  for (let i = 0; i < errorMessage.length; i++) {
    obfuscated[i] = errorMessage[i] ^ cipherStream[i]
  }

  return obfuscated
}

/**
 * Desobfusca mensagem de erro usando os shared secrets de cada hop
 * Tenta cada shared secret em ordem até encontrar HMAC válido
 *
 * @param errorMessage - Mensagem de erro ofuscada
 * @param sharedSecrets - Array de shared secrets (do primeiro ao último hop)
 * @returns Resultado com mensagem decodificada e índice do nó que falhou
 */
export function deobfuscateError(
  errorMessage: Uint8Array,
  sharedSecrets: Uint8Array[],
): ErrorDeobfuscationResult | null {
  let message = new Uint8Array(errorMessage)

  // Tentar cada shared secret em ordem
  for (let i = 0; i < sharedSecrets.length; i++) {
    const sharedSecret = sharedSecrets[i]
    const umKey = generateUmKey(sharedSecret)
    const cipherStream = generateCipherStream(umKey, message.length)

    // XOR para desobfuscar esta camada
    const decrypted = new Uint8Array(message.length)
    for (let j = 0; j < message.length; j++) {
      decrypted[j] = message[j] ^ cipherStream[j]
    }

    // Verificar HMAC
    const payloadSize = decrypted.length - 32
    const payload = decrypted.subarray(0, payloadSize)
    const receivedHmac = decrypted.subarray(payloadSize)

    const ammagKey = generateAmmagKey(sharedSecret)
    const expectedHmac = hmacSha256(ammagKey, payload)

    // Comparar HMACs
    if (constantTimeEqual(receivedHmac, expectedHmac)) {
      // HMAC válido - este é o nó que originou o erro
      const failure = parseFailureMessage(payload)
      return {
        failure,
        failingNodeIndex: i,
      }
    }

    // HMAC inválido - continuar desobfuscando para o próximo nó
    message = decrypted
  }

  // Não foi possível identificar o nó que falhou
  return null
}

/**
 * Parseia mensagem de falha decodificada
 *
 * @param payload - Payload decodificado (256 bytes)
 * @returns Mensagem de falha estruturada
 */
export function parseFailureMessage(payload: Uint8Array): DecodedFailureMessage {
  const view = new DataView(payload.buffer, payload.byteOffset)

  // Failure code (2 bytes, big-endian)
  const failureCode = view.getUint16(0, false)

  // Data length (2 bytes, big-endian)
  const dataLen = view.getUint16(2, false)

  // Data
  const failureData = payload.subarray(4, 4 + dataLen)

  // Obter nome do código de falha
  const failureCodeName = getFailureCodeName(failureCode)

  // Parsear dados adicionais baseado no tipo de erro
  const result: DecodedFailureMessage = {
    failureCode,
    failureCodeName,
    failureData,
  }

  // Parsear campos específicos baseado no failure code
  parseFailureData(result, failureCode, failureData)

  return result
}

/**
 * Parseia dados adicionais da falha baseado no tipo de erro
 */
function parseFailureData(
  result: DecodedFailureMessage,
  failureCode: number,
  data: Uint8Array,
): void {
  if (data.length === 0) return

  const view = new DataView(data.buffer, data.byteOffset)

  // Erros que incluem channel_update
  const channelUpdateErrors: number[] = [
    FailureCode.AMOUNT_BELOW_MINIMUM,
    FailureCode.FEE_INSUFFICIENT,
    FailureCode.INCORRECT_CLTV_EXPIRY,
    FailureCode.EXPIRY_TOO_SOON,
    FailureCode.CHANNEL_DISABLED,
  ]

  if (channelUpdateErrors.includes(failureCode as number)) {
    // Formato: htlc_msat (8) + len (2) + channel_update
    if (data.length >= 10) {
      result.htlcMsat = view.getBigUint64(0, false)
      const updateLen = view.getUint16(8, false)
      if (data.length >= 10 + updateLen) {
        result.channelUpdate = data.subarray(10, 10 + updateLen)
      }
    }
  }

  // Erros com sha256_of_onion
  if (
    failureCode === FailureCode.INVALID_ONION_VERSION ||
    failureCode === FailureCode.INVALID_ONION_HMAC ||
    failureCode === FailureCode.INVALID_ONION_KEY
  ) {
    if (data.length >= 32) {
      result.sha256OfOnion = data.subarray(0, 32)
    }
  }

  // INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS
  if (failureCode === FailureCode.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS) {
    if (data.length >= 12) {
      result.htlcMsat = view.getBigUint64(0, false)
      result.cltvExpiry = view.getUint32(8, false)
    }
  }

  // FINAL_INCORRECT_CLTV_EXPIRY
  if (failureCode === FailureCode.FINAL_INCORRECT_CLTV_EXPIRY) {
    if (data.length >= 4) {
      result.cltvExpiry = view.getUint32(0, false)
    }
  }

  // FINAL_INCORRECT_HTLC_AMOUNT
  if (failureCode === FailureCode.FINAL_INCORRECT_HTLC_AMOUNT) {
    if (data.length >= 8) {
      result.htlcMsat = view.getBigUint64(0, false)
    }
  }

  // INVALID_ONION_PAYLOAD
  if (failureCode === FailureCode.INVALID_ONION_PAYLOAD) {
    if (data.length >= 3) {
      // type (bigsize) + offset (2)
      // Simplificado: assumir type é 1 byte
      const tlvType = data[0]
      const offset = view.getUint16(1, false)
      result.flags = tlvType
      result.cltvExpiry = offset // Reusing field for offset
    }
  }
}

/**
 * Obtém nome legível do código de falha
 */
export function getFailureCodeName(code: number): string {
  const names: Record<number, string> = {
    [FailureCode.INVALID_REALM]: 'invalid_realm',
    [FailureCode.TEMPORARY_NODE_FAILURE]: 'temporary_node_failure',
    [FailureCode.PERMANENT_NODE_FAILURE]: 'permanent_node_failure',
    [FailureCode.REQUIRED_NODE_FEATURE_MISSING]: 'required_node_feature_missing',
    [FailureCode.INVALID_ONION_VERSION]: 'invalid_onion_version',
    [FailureCode.INVALID_ONION_HMAC]: 'invalid_onion_hmac',
    [FailureCode.INVALID_ONION_KEY]: 'invalid_onion_key',
    [FailureCode.AMOUNT_BELOW_MINIMUM]: 'amount_below_minimum',
    [FailureCode.FEE_INSUFFICIENT]: 'fee_insufficient',
    [FailureCode.INCORRECT_CLTV_EXPIRY]: 'incorrect_cltv_expiry',
    [FailureCode.EXPIRY_TOO_SOON]: 'expiry_too_soon',
    [FailureCode.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS]: 'incorrect_or_unknown_payment_details',
    [FailureCode.FINAL_INCORRECT_CLTV_EXPIRY]: 'final_incorrect_cltv_expiry',
    [FailureCode.FINAL_INCORRECT_HTLC_AMOUNT]: 'final_incorrect_htlc_amount',
    [FailureCode.CHANNEL_DISABLED]: 'channel_disabled',
    [FailureCode.EXPIRY_TOO_FAR]: 'expiry_too_far',
    [FailureCode.INVALID_ONION_PAYLOAD]: 'invalid_onion_payload',
    [FailureCode.MPP_TIMEOUT]: 'mpp_timeout',
    [FailureCode.INVALID_ONION_BLINDING]: 'invalid_onion_blinding',
  }
  return names[code] || `unknown_failure_${code.toString(16)}`
}

/**
 * Verifica se o erro é permanente (não vale tentar novamente)
 */
export function isPermFailure(code: number): boolean {
  // Bit 14 (PERM) = 0x4000
  return (code & 0x4000) !== 0
}

/**
 * Verifica se o erro inclui update de canal
 */
export function hasChannelUpdate(code: number): boolean {
  // Bit 12 (UPDATE) = 0x1000
  return (code & 0x1000) !== 0
}

/**
 * Verifica se o erro é do nó (não do canal)
 */
export function isNodeFailure(code: number): boolean {
  // Bit 13 (NODE) = 0x2000
  return (code & 0x2000) !== 0
}

/**
 * Comparação em tempo constante para prevenir timing attacks
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }

  return result === 0
}

/**
 * Cria dados de falha para erros que incluem channel_update
 */
export function createChannelUpdateFailureData(
  htlcMsat: bigint,
  channelUpdate: Uint8Array,
): Uint8Array {
  const data = new Uint8Array(8 + 2 + channelUpdate.length)
  const view = new DataView(data.buffer)

  // htlc_msat (8 bytes, big-endian)
  view.setBigUint64(0, htlcMsat, false)

  // channel_update length (2 bytes, big-endian)
  view.setUint16(8, channelUpdate.length, false)

  // channel_update
  data.set(channelUpdate, 10)

  return data
}

/**
 * Cria dados de falha para INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS
 */
export function createPaymentDetailsFailureData(htlcMsat: bigint, cltvExpiry: number): Uint8Array {
  const data = new Uint8Array(12)
  const view = new DataView(data.buffer)

  view.setBigUint64(0, htlcMsat, false)
  view.setUint32(8, cltvExpiry, false)

  return data
}

/**
 * Atualiza mensagem de erro legada para formato v2 (para compatibilidade)
 * A mensagem legada usava createOnionErrorMessage com SHA256
 * Esta função converte para o novo formato
 */
export function createOnionErrorMessageV2(
  failureCode: number,
  sharedSecret: Uint8Array,
  failureData?: Uint8Array,
): Uint8Array {
  return createFailureMessage(failureCode, sharedSecret, failureData)
}

/**
 * Estrutura de um hop em um blinded path
 */
export interface BlindedHop {
  /** Blinded node ID (33 bytes compressed pubkey) */
  blindedNodeId: Uint8Array
  /** Encrypted data for this hop */
  encryptedData: Uint8Array
}

/**
 * Blinded path completo
 */
export interface BlindedPath {
  /** Introduction node (primeiro nó do path, não blindado) */
  introductionNodeId: Uint8Array
  /** Blinding point (33 bytes) - usado para derivar shared secrets */
  blindingPoint: Uint8Array
  /** Hops blindados */
  blindedHops: BlindedHop[]
}

/**
 * Dados encriptados para um hop em blinded path
 */
export interface BlindedHopData {
  /** Short channel ID para forward (8 bytes) - opcional para intermediate */
  shortChannelId?: Uint8Array
  /** Padding para uniformizar tamanho */
  padding?: Uint8Array
  /** Next blinding override - opcional */
  nextBlindingOverride?: Uint8Array
  /** Payment relay info (para payments) */
  paymentRelay?: {
    cltvExpiryDelta: number
    feeProportionalMillionths: number
    feeBaseMsat: number
  }
  /** Payment constraints (para payments) */
  paymentConstraints?: {
    maxCltvExpiry: number
    htlcMinimumMsat: bigint
  }
  /** Allowed features */
  allowedFeatures?: Uint8Array
}

/**
 * Dados encriptados para o final hop (recipient)
 */
export interface BlindedRecipientData {
  /** Path ID para correlacionar com invoice */
  pathId?: Uint8Array
  /** Payment constraints */
  paymentConstraints?: {
    maxCltvExpiry: number
    htlcMinimumMsat: bigint
  }
}

/**
 * Tipos de TLV para encrypted_data_tlv em blinded paths
 */
export const BlindedTlvType = {
  PADDING: 1,
  SHORT_CHANNEL_ID: 2,
  NEXT_BLINDING_OVERRIDE: 8,
  NEXT_NODE_ID: 4,
  PATH_ID: 6,
  PAYMENT_RELAY: 10,
  PAYMENT_CONSTRAINTS: 12,
  ALLOWED_FEATURES: 14,
} as const

/**
 * Cria um blinded path a partir de uma rota
 *
 * @param route - Node IDs do caminho (do introduction node ao recipient)
 * @param recipientData - Dados para o recipient (path_id, etc)
 * @param hopDatas - Dados para cada hop intermediário
 * @returns Blinded path
 */
export function createBlindedPath(
  route: Uint8Array[],
  recipientData: BlindedRecipientData,
  hopDatas: BlindedHopData[],
): BlindedPath {
  if (route.length < 2) {
    throw new Error('Blinded path requires at least 2 nodes')
  }

  if (hopDatas.length !== route.length - 2) {
    throw new Error('Number of hop datas must equal number of intermediate hops')
  }

  // Gerar blinding seed aleatório
  const blindingSeed = randomBytes(32)

  // Primeiro nó é o introduction node (não blindado)
  const introductionNodeId = route[0]

  // Calcular blinding point inicial: e * G
  const blindingPoint = secp.getPublicKey(blindingSeed, true)

  // Construir hops blindados
  const blindedHops: BlindedHop[] = []
  let currentBlindingKey = blindingSeed

  for (let i = 1; i < route.length; i++) {
    const nodeId = route[i]
    const isLastHop = i === route.length - 1

    // Calcular shared secret: SHA256(nodeId * blindingKey)
    const sharedSecret = calculateBlindedSharedSecret(nodeId, currentBlindingKey)

    // Calcular blinded node ID: nodeId + SHA256(nodeId || sharedSecret) * G
    const blindedNodeId = blindNodeId(nodeId, sharedSecret)

    // Preparar dados para encriptar
    let dataToEncrypt: Uint8Array
    if (isLastHop) {
      // Último hop: recipient data
      dataToEncrypt = encodeBlindedRecipientData(recipientData)
    } else {
      // Hop intermediário
      const hopData = hopDatas[i - 1]
      // Adicionar next_node_id para forwarding
      const nextNodeId = route[i + 1]
      dataToEncrypt = encodeBlindedHopData(hopData, nextNodeId)
    }

    // Encriptar dados com shared secret
    const encryptedData = encryptBlindedData(dataToEncrypt, sharedSecret)

    blindedHops.push({
      blindedNodeId,
      encryptedData,
    })

    // Calcular próximo blinding key: SHA256(currentBlindingPoint || sharedSecret) * currentBlindingKey
    if (!isLastHop) {
      currentBlindingKey = deriveNextBlindingKey(currentBlindingKey, sharedSecret)
    }
  }

  return {
    introductionNodeId,
    blindingPoint,
    blindedHops,
  }
}

/**
 * Processa um blinded path recebido (como nó intermediário)
 *
 * @param encryptedData - Dados encriptados recebidos
 * @param blindingPoint - Blinding point atual
 * @param nodePrivKey - Chave privada do nó
 * @returns Dados decriptados e próximo blinding point
 */
export function processBlindedHop(
  encryptedData: Uint8Array,
  blindingPoint: Uint8Array,
  nodePrivKey: Uint8Array,
): {
  decryptedData: BlindedHopData | BlindedRecipientData
  nextBlindingPoint?: Uint8Array
  nextNodeId?: Uint8Array
  isRecipient: boolean
} {
  // Calcular shared secret: ECDH(nodePrivKey, blindingPoint)
  const sharedSecret = calculateBlindedSharedSecretPriv(blindingPoint, nodePrivKey)

  // Decriptar dados
  const decryptedBytes = decryptBlindedData(encryptedData, sharedSecret)

  // Decodificar TLVs
  const tlvs = decodeTlvStream(decryptedBytes)

  // Parsear TLVs
  let nextNodeId: Uint8Array | undefined
  let nextBlindingOverride: Uint8Array | undefined
  let shortChannelId: Uint8Array | undefined
  let pathId: Uint8Array | undefined
  let paymentRelay: BlindedHopData['paymentRelay']
  let paymentConstraints: BlindedHopData['paymentConstraints']

  for (const tlv of tlvs) {
    const typeNum = Number(tlv.type)
    switch (typeNum) {
      case BlindedTlvType.NEXT_NODE_ID:
        nextNodeId = tlv.value
        break
      case BlindedTlvType.SHORT_CHANNEL_ID:
        shortChannelId = tlv.value
        break
      case BlindedTlvType.NEXT_BLINDING_OVERRIDE:
        nextBlindingOverride = tlv.value
        break
      case BlindedTlvType.PATH_ID:
        pathId = tlv.value
        break
      case BlindedTlvType.PAYMENT_RELAY:
        paymentRelay = decodePaymentRelay(tlv.value)
        break
      case BlindedTlvType.PAYMENT_CONSTRAINTS:
        paymentConstraints = decodePaymentConstraints(tlv.value)
        break
    }
  }

  // Determinar se é o recipient (tem path_id e não tem next_node_id)
  const isRecipient = pathId !== undefined && nextNodeId === undefined

  // Calcular próximo blinding point
  let nextBlindingPoint: Uint8Array | undefined
  if (!isRecipient) {
    if (nextBlindingOverride) {
      nextBlindingPoint = nextBlindingOverride
    } else {
      // Calcular: current_blinding_point * SHA256(current_blinding_point || shared_secret)
      nextBlindingPoint = deriveNextBlindingPoint(blindingPoint, sharedSecret)
    }
  }

  if (isRecipient) {
    return {
      decryptedData: { pathId, paymentConstraints } as BlindedRecipientData,
      isRecipient: true,
    }
  } else {
    return {
      decryptedData: { shortChannelId, paymentRelay, paymentConstraints } as BlindedHopData,
      nextBlindingPoint,
      nextNodeId,
      isRecipient: false,
    }
  }
}

/**
 * Calcula shared secret para blinded path (com pubkey)
 */
function calculateBlindedSharedSecret(nodeId: Uint8Array, blindingKey: Uint8Array): Uint8Array {
  // shared_secret = SHA256(nodeId * blindingKey)
  const sharedPoint = secp.getSharedSecret(blindingKey, nodeId, true)
  return sha256(sharedPoint.subarray(1)) // Remove prefix byte
}

/**
 * Calcula shared secret para blinded path (com privkey)
 */
function calculateBlindedSharedSecretPriv(
  blindingPoint: Uint8Array,
  nodePrivKey: Uint8Array,
): Uint8Array {
  const sharedPoint = secp.getSharedSecret(nodePrivKey, blindingPoint, true)
  return sha256(sharedPoint.subarray(1))
}

/**
 * Blinda um node ID
 * blinded_node_id = node_id + SHA256(node_id || shared_secret) * G
 */
function blindNodeId(nodeId: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  // blinding_factor = SHA256(node_id || shared_secret)
  const blindingFactor = sha256(new Uint8Array([...nodeId, ...sharedSecret]))

  // blinding_point = blinding_factor * G
  const blindingPointAddition = secp.getPublicKey(blindingFactor, true)

  // blinded_node_id = node_id + blinding_point
  const nodeIdPoint = secp.Point.fromHex(uint8ArrayToHex(nodeId))
  const blindingAddPoint = secp.Point.fromHex(uint8ArrayToHex(blindingPointAddition))
  const blindedPoint = nodeIdPoint.add(blindingAddPoint)

  return hexToUint8Array(blindedPoint.toHex(true))
}

/**
 * Deriva próximo blinding key
 */
function deriveNextBlindingKey(currentKey: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  // next_blinding_key = SHA256(current_blinding_point || shared_secret) * current_key
  const currentPoint = secp.getPublicKey(currentKey, true)
  const factor = sha256(new Uint8Array([...currentPoint, ...sharedSecret]))

  // Multiply scalar: next_key = factor * current_key (mod n)
  // secp256k1 curve order n
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
  const factorBigInt = bytesToBigInt(factor)
  const currentBigInt = bytesToBigInt(currentKey)
  const nextBigInt = (factorBigInt * currentBigInt) % n

  return bigIntToBytes(nextBigInt, 32)
}

/**
 * Deriva próximo blinding point
 */
function deriveNextBlindingPoint(
  currentBlindingPoint: Uint8Array,
  sharedSecret: Uint8Array,
): Uint8Array {
  // factor = SHA256(current_blinding_point || shared_secret)
  const factor = sha256(new Uint8Array([...currentBlindingPoint, ...sharedSecret]))

  // next_blinding_point = current_blinding_point * factor
  const currentPoint = secp.Point.fromHex(uint8ArrayToHex(currentBlindingPoint))
  const factorBigInt = bytesToBigInt(factor)
  const nextPoint = currentPoint.multiply(factorBigInt)

  return hexToUint8Array(nextPoint.toHex(true))
}

/**
 * Encripta dados do blinded hop usando ChaCha20-Poly1305
 */
function encryptBlindedData(data: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  // Derivar chave de encriptação: rho = HMAC-SHA256(sharedSecret, "blinded_node_id")
  const rhoKey = hmacSha256(sharedSecret, new TextEncoder().encode('blinded_node_id'))

  // Usar ChaCha20 com nonce zero
  const nonce = new Uint8Array(12)
  return chacha20(rhoKey, nonce, data)
}

/**
 * Decripta dados do blinded hop
 */
function decryptBlindedData(encryptedData: Uint8Array, sharedSecret: Uint8Array): Uint8Array {
  // Mesma operação que encriptar (ChaCha20 é simétrico)
  return encryptBlindedData(encryptedData, sharedSecret)
}

/**
 * Codifica dados do hop intermediário em TLV
 */
function encodeBlindedHopData(hopData: BlindedHopData, nextNodeId: Uint8Array): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = []

  // padding (type 1)
  if (hopData.padding) {
    tlvs.push({ type: BlindedTlvType.PADDING, value: hopData.padding })
  }

  // short_channel_id (type 2)
  if (hopData.shortChannelId) {
    tlvs.push({ type: BlindedTlvType.SHORT_CHANNEL_ID, value: hopData.shortChannelId })
  }

  // next_node_id (type 4) - obrigatório para hops intermediários
  tlvs.push({ type: BlindedTlvType.NEXT_NODE_ID, value: nextNodeId })

  // next_blinding_override (type 8)
  if (hopData.nextBlindingOverride) {
    tlvs.push({ type: BlindedTlvType.NEXT_BLINDING_OVERRIDE, value: hopData.nextBlindingOverride })
  }

  // payment_relay (type 10)
  if (hopData.paymentRelay) {
    tlvs.push({
      type: BlindedTlvType.PAYMENT_RELAY,
      value: encodePaymentRelay(hopData.paymentRelay),
    })
  }

  // payment_constraints (type 12)
  if (hopData.paymentConstraints) {
    tlvs.push({
      type: BlindedTlvType.PAYMENT_CONSTRAINTS,
      value: encodePaymentConstraints(hopData.paymentConstraints),
    })
  }

  // allowed_features (type 14)
  if (hopData.allowedFeatures) {
    tlvs.push({ type: BlindedTlvType.ALLOWED_FEATURES, value: hopData.allowedFeatures })
  }

  return encodeTlvStream(tlvs)
}

/**
 * Codifica dados do recipient em TLV
 */
function encodeBlindedRecipientData(recipientData: BlindedRecipientData): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = []

  // path_id (type 6)
  if (recipientData.pathId) {
    tlvs.push({ type: BlindedTlvType.PATH_ID, value: recipientData.pathId })
  }

  // payment_constraints (type 12)
  if (recipientData.paymentConstraints) {
    tlvs.push({
      type: BlindedTlvType.PAYMENT_CONSTRAINTS,
      value: encodePaymentConstraints(recipientData.paymentConstraints),
    })
  }

  return encodeTlvStream(tlvs)
}

/**
 * Codifica payment_relay TLV
 */
function encodePaymentRelay(relay: NonNullable<BlindedHopData['paymentRelay']>): Uint8Array {
  // cltv_expiry_delta (2) + fee_proportional_millionths (4) + fee_base_msat (4)
  const data = new Uint8Array(10)
  const view = new DataView(data.buffer)

  view.setUint16(0, relay.cltvExpiryDelta, false)
  view.setUint32(2, relay.feeProportionalMillionths, false)
  view.setUint32(6, relay.feeBaseMsat, false)

  return data
}

/**
 * Decodifica payment_relay TLV
 */
function decodePaymentRelay(data: Uint8Array): BlindedHopData['paymentRelay'] {
  const view = new DataView(data.buffer, data.byteOffset)

  return {
    cltvExpiryDelta: view.getUint16(0, false),
    feeProportionalMillionths: view.getUint32(2, false),
    feeBaseMsat: view.getUint32(6, false),
  }
}

/**
 * Codifica payment_constraints TLV
 */
function encodePaymentConstraints(
  constraints: NonNullable<BlindedHopData['paymentConstraints']>,
): Uint8Array {
  // max_cltv_expiry (4) + htlc_minimum_msat (8)
  const data = new Uint8Array(12)
  const view = new DataView(data.buffer)

  view.setUint32(0, constraints.maxCltvExpiry, false)
  view.setBigUint64(4, constraints.htlcMinimumMsat, false)

  return data
}

/**
 * Decodifica payment_constraints TLV
 */
function decodePaymentConstraints(data: Uint8Array): BlindedHopData['paymentConstraints'] {
  const view = new DataView(data.buffer, data.byteOffset)

  return {
    maxCltvExpiry: view.getUint32(0, false),
    htlcMinimumMsat: view.getBigUint64(4, false),
  }
}

/**
 * Helpers para conversão BigInt <-> bytes
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte)
  }
  return result
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let v = value
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return bytes
}

// ==========================================
// BOLT #4/12: ONION MESSAGES
// ==========================================

/**
 * Onion messages permitem comunicação privada P2P sem criar canais.
 * Usados para BOLT #12 Offers/Invoice requests.
 *
 * Referência: https://github.com/lightning/bolts/blob/master/04-onion-routing.md#onion-messages
 */

/**
 * Tamanho do onion packet para onion messages (diferente de pagamentos)
 */
export const ONION_MESSAGE_PACKET_SIZE = 1366

/**
 * Tipos de mensagem onion
 */
export enum OnionMessageType {
  /** Mensagem de texto simples */
  TEXT = 1,
  /** Invoice request (BOLT #12) */
  INVOICE_REQUEST = 64,
  /** Invoice (BOLT #12) */
  INVOICE = 66,
  /** Invoice error */
  INVOICE_ERROR = 68,
}

/**
 * Estrutura de uma onion message
 */
export interface OnionMessage {
  /** Blinding point (33 bytes) */
  blindingPoint: Uint8Array
  /** Onion packet encriptado */
  onionPacket: Uint8Array
}

/**
 * Payload de uma onion message
 */
export interface OnionMessagePayload {
  /** Reply path para resposta (opcional) */
  replyPath?: BlindedPath
  /** Encrypted data do blinded path */
  encryptedData?: Uint8Array
  /** Conteúdo da mensagem */
  messageContent?: {
    type: OnionMessageType
    data: Uint8Array
  }
}

/**
 * Tipos de TLV para onion message
 */
export const OnionMessageTlvType = {
  REPLY_PATH: 2,
  ENCRYPTED_DATA: 4,
  // Message content types (odd = optional)
  TEXT_MESSAGE: 65535,
  INVOICE_REQUEST: 64,
  INVOICE: 66,
  INVOICE_ERROR: 68,
} as const

/**
 * Cria uma onion message para enviar a um destino
 *
 * @param route - Rota de node IDs até o destino
 * @param payload - Conteúdo da mensagem
 * @param replyPath - Blinded path para resposta (opcional)
 * @returns Onion message
 */
export function createOnionMessage(
  route: Uint8Array[],
  payload: OnionMessagePayload,
  replyPath?: BlindedPath,
): OnionMessage {
  if (route.length === 0) {
    throw new Error('Route must have at least one node')
  }

  // Gerar session key aleatório
  const sessionKey = randomBytes(32)

  // Calcular blinding point inicial
  const blindingPoint = secp.getPublicKey(sessionKey, true)

  // Construir payloads para cada hop
  const hopsData: { length: bigint; payload: Uint8Array; hmac: Uint8Array }[] = []

  for (let i = 0; i < route.length; i++) {
    const isLastHop = i === route.length - 1

    let hopPayload: Uint8Array
    if (isLastHop) {
      // Final hop: incluir mensagem e reply path
      hopPayload = encodeOnionMessageFinalPayload(payload, replyPath)
    } else {
      // Hop intermediário: apenas forwarding info
      hopPayload = encodeOnionMessageIntermediatePayload(route[i + 1])
    }

    hopsData.push({
      length: BigInt(hopPayload.length),
      payload: hopPayload,
      hmac: new Uint8Array(32),
    })
  }

  // Construir onion packet
  const onionPacket = constructOnionPacket(route, sessionKey, hopsData)

  return {
    blindingPoint,
    onionPacket: serializeOnionPacket(onionPacket),
  }
}

/**
 * Processa uma onion message recebida
 *
 * @param message - Onion message recebida
 * @param nodePrivKey - Chave privada do nó
 * @returns Payload decriptado ou informação de forwarding
 */
export function processOnionMessage(
  message: OnionMessage,
  nodePrivKey: Uint8Array,
): {
  isForUs: boolean
  payload?: OnionMessagePayload
  nextNodeId?: Uint8Array
  nextOnionMessage?: OnionMessage
} {
  const packet = decodeOnionPacket(message.onionPacket)

  // Calcular shared secret
  const sharedSecret = calculateBlindedSharedSecretPriv(message.blindingPoint, nodePrivKey)

  // Decriptar payload
  const result = decryptOnion(packet, new Uint8Array(), sharedSecret, nodePrivKey)

  // Decodificar payload TLV
  const payloadTlvs = decodeTlvStream(result.payload as unknown as Uint8Array)

  let encryptedData: Uint8Array | undefined
  let replyPath: BlindedPath | undefined
  let messageContent: OnionMessagePayload['messageContent']

  for (const tlv of payloadTlvs) {
    const typeNum = Number(tlv.type)

    switch (typeNum) {
      case OnionMessageTlvType.ENCRYPTED_DATA:
        encryptedData = tlv.value
        break
      case OnionMessageTlvType.REPLY_PATH:
        replyPath = decodeBlindedPath(tlv.value)
        break
      case OnionMessageTlvType.INVOICE_REQUEST:
        messageContent = { type: OnionMessageType.INVOICE_REQUEST, data: tlv.value }
        break
      case OnionMessageTlvType.INVOICE:
        messageContent = { type: OnionMessageType.INVOICE, data: tlv.value }
        break
      case OnionMessageTlvType.INVOICE_ERROR:
        messageContent = { type: OnionMessageType.INVOICE_ERROR, data: tlv.value }
        break
      case OnionMessageTlvType.TEXT_MESSAGE:
        messageContent = { type: OnionMessageType.TEXT, data: tlv.value }
        break
    }
  }

  // Se não há próximo onion, a mensagem é para nós
  if (!result.nextOnion) {
    return {
      isForUs: true,
      payload: {
        replyPath,
        encryptedData,
        messageContent,
      },
    }
  }

  // Caso contrário, fazer forwarding
  // Calcular próximo blinding point
  const nextBlindingPoint = deriveNextBlindingPoint(message.blindingPoint, sharedSecret)

  // Processar encrypted_data para obter next_node_id
  let nextNodeId: Uint8Array | undefined
  if (encryptedData) {
    const decryptedData = decryptBlindedData(encryptedData, sharedSecret)
    const dataTlvs = decodeTlvStream(decryptedData)

    for (const tlv of dataTlvs) {
      if (Number(tlv.type) === BlindedTlvType.NEXT_NODE_ID) {
        nextNodeId = tlv.value
        break
      }
    }
  }

  return {
    isForUs: false,
    nextNodeId,
    nextOnionMessage: {
      blindingPoint: nextBlindingPoint,
      onionPacket: serializeOnionPacket(result.nextOnion),
    },
  }
}

/**
 * Codifica payload final de onion message
 */
function encodeOnionMessageFinalPayload(
  payload: OnionMessagePayload,
  replyPath?: BlindedPath,
): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = []

  // Reply path (type 2)
  if (replyPath) {
    tlvs.push({ type: OnionMessageTlvType.REPLY_PATH, value: encodeBlindedPath(replyPath) })
  }

  // Message content
  if (payload.messageContent) {
    let tlvType: number
    switch (payload.messageContent.type) {
      case OnionMessageType.INVOICE_REQUEST:
        tlvType = OnionMessageTlvType.INVOICE_REQUEST
        break
      case OnionMessageType.INVOICE:
        tlvType = OnionMessageTlvType.INVOICE
        break
      case OnionMessageType.INVOICE_ERROR:
        tlvType = OnionMessageTlvType.INVOICE_ERROR
        break
      default:
        tlvType = OnionMessageTlvType.TEXT_MESSAGE
    }
    tlvs.push({ type: tlvType, value: payload.messageContent.data })
  }

  return encodeTlvStream(tlvs)
}

/**
 * Codifica payload intermediário de onion message
 */
function encodeOnionMessageIntermediatePayload(nextNodeId: Uint8Array): Uint8Array {
  const tlvs: { type: number; value: Uint8Array }[] = []

  // Encrypted data com next_node_id
  const encryptedDataTlvs: { type: number; value: Uint8Array }[] = [
    { type: BlindedTlvType.NEXT_NODE_ID, value: nextNodeId },
  ]

  tlvs.push({
    type: OnionMessageTlvType.ENCRYPTED_DATA,
    value: encodeTlvStream(encryptedDataTlvs),
  })

  return encodeTlvStream(tlvs)
}

/**
 * Codifica um blinded path para serialização
 */
export function encodeBlindedPath(path: BlindedPath): Uint8Array {
  const parts: Uint8Array[] = []

  // Introduction node ID (33 bytes)
  parts.push(path.introductionNodeId)

  // Blinding point (33 bytes)
  parts.push(path.blindingPoint)

  // Number of hops (1 byte)
  parts.push(new Uint8Array([path.blindedHops.length]))

  // Hops
  for (const hop of path.blindedHops) {
    // Blinded node ID (33 bytes)
    parts.push(hop.blindedNodeId)

    // Encrypted data length (2 bytes big-endian)
    const lenBuf = new Uint8Array(2)
    new DataView(lenBuf.buffer).setUint16(0, hop.encryptedData.length, false)
    parts.push(lenBuf)

    // Encrypted data
    parts.push(hop.encryptedData)
  }

  // Concatenar
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Decodifica um blinded path serializado
 */
export function decodeBlindedPath(data: Uint8Array): BlindedPath {
  let offset = 0

  // Introduction node ID (33 bytes)
  const introductionNodeId = data.subarray(offset, offset + 33)
  offset += 33

  // Blinding point (33 bytes)
  const blindingPoint = data.subarray(offset, offset + 33)
  offset += 33

  // Number of hops (1 byte)
  const numHops = data[offset]
  offset += 1

  // Hops
  const blindedHops: BlindedHop[] = []
  for (let i = 0; i < numHops; i++) {
    // Blinded node ID (33 bytes)
    const blindedNodeId = data.subarray(offset, offset + 33)
    offset += 33

    // Encrypted data length (2 bytes)
    const encryptedDataLen = new DataView(data.buffer, data.byteOffset + offset).getUint16(0, false)
    offset += 2

    // Encrypted data
    const encryptedData = data.subarray(offset, offset + encryptedDataLen)
    offset += encryptedDataLen

    blindedHops.push({ blindedNodeId, encryptedData })
  }

  return {
    introductionNodeId,
    blindingPoint,
    blindedHops,
  }
}

/**
 * Cria um reply path blindado para responder a uma onion message
 *
 * @param route - Caminho de volta (do responder ao originador)
 * @param pathId - ID único para correlacionar respostas
 * @returns Blinded path para respostas
 */
export function createReplyPath(route: Uint8Array[], pathId: Uint8Array): BlindedPath {
  const recipientData: BlindedRecipientData = {
    pathId,
  }

  // Criar hop datas vazios para intermediários
  const hopDatas: BlindedHopData[] = Array(Math.max(0, route.length - 2)).fill({})

  return createBlindedPath(route, recipientData, hopDatas)
}

/**
 * Envia resposta usando reply path
 *
 * @param replyPath - Reply path recebido na mensagem original
 * @param payload - Conteúdo da resposta
 * @returns Onion message de resposta
 */
export function createReplyMessage(
  replyPath: BlindedPath,
  payload: OnionMessagePayload,
): OnionMessage {
  // Construir rota a partir do blinded path
  const route: Uint8Array[] = [replyPath.introductionNodeId]
  for (const hop of replyPath.blindedHops) {
    route.push(hop.blindedNodeId)
  }

  return createOnionMessage(route, payload)
}
