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
