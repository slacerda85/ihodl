/**
 * BOLT #4: Onion Routing Protocol
 *
 * Implementa construção e processamento de pacotes onion para
 * roteamento de pagamentos na Lightning Network.
 *
 * Baseado em: https://github.com/lightning/bolts/blob/master/04-onion-routing.md
 */

import { sha256, randomBytes } from '../crypto/crypto'
import { constructOnionPacket, decryptOnion } from './routing'
import type { OnionPacket, PayloadTlv } from '@/core/models/lightning/routing'

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
 * Gera stream de cipher para encriptação
 */
function generateCipherStream(key: Uint8Array, length: number): Uint8Array {
  // ChaCha20 stream com nonce zero
  const stream = new Uint8Array(length)
  // Usar SHA256 em blocos como aproximação
  let offset = 0
  let counter = 0
  while (offset < length) {
    const block = sha256(new Uint8Array([...key, counter & 0xff, (counter >> 8) & 0xff]))
    const remaining = length - offset
    const toCopy = Math.min(32, remaining)
    stream.set(block.subarray(0, toCopy), offset)
    offset += toCopy
    counter++
  }
  return stream
}
