/**
 * Trampoline Routing Implementation
 *
 * Implementa roteamento via nós trampoline que conhecem a rede:
 * - O sender não precisa conhecer a rota completa
 * - Trampoline nodes fazem pathfinding para o destino
 * - Múltiplas camadas de onion: outer (para trampoline) + inner (trampoline->destino)
 *
 * Referência: BOLT proposal para Trampoline Routing
 * https://github.com/lightning/bolts/pull/836
 */

import { Point } from '@/core/models/lightning/base'
import { PayloadType } from '@/core/models/lightning/routing'
import { uint8ArrayToHex, hexToUint8Array, concatUint8Arrays } from '@/core/lib/utils'
import { sha256 } from '@noble/hashes/sha2.js'
import * as secp256k1 from '@noble/secp256k1'
import { hkdf } from '@noble/hashes/hkdf.js'

// Constantes de Trampoline
const TRAMPOLINE_ONION_SIZE = 650 // Payload menor que onion normal
const MAX_TRAMPOLINE_HOPS = 4 // Máximo de trampoline hops
const TRAMPOLINE_FEE_LEVEL_COUNT = 4 // Níveis de fee para retry

// TLV types específicos de trampoline
export const enum TrampolineTlvType {
  AMT_TO_FORWARD = 2,
  OUTGOING_CLTV_VALUE = 4,
  OUTGOING_NODE_ID = 14, // Node ID do próximo trampoline ou destino
  INVOICE_FEATURES = 66,
  INVOICE_ROUTING_INFO = 67,
  PAYMENT_DATA = 8,
  TOTAL_AMOUNT = 18,
}

/**
 * Configuração de fee por nível
 * Níveis mais altos = fees mais altas para retry
 */
export interface TrampolineFeeLevel {
  level: number
  feeBaseMsat: bigint
  feeProportionalMillionths: number
  cltvExpiryDelta: number
}

/**
 * Fee levels padrão baseados no Electrum/Phoenix
 */
export const DEFAULT_FEE_LEVELS: TrampolineFeeLevel[] = [
  { level: 0, feeBaseMsat: 0n, feeProportionalMillionths: 0, cltvExpiryDelta: 576 },
  { level: 1, feeBaseMsat: 1000n, feeProportionalMillionths: 100, cltvExpiryDelta: 576 },
  { level: 2, feeBaseMsat: 3000n, feeProportionalMillionths: 500, cltvExpiryDelta: 576 },
  { level: 3, feeBaseMsat: 5000n, feeProportionalMillionths: 1000, cltvExpiryDelta: 576 },
]

/**
 * Nó trampoline conhecido
 */
export interface TrampolineNode {
  nodeId: Point // 33 bytes pubkey
  alias?: string
  features?: Uint8Array
  feeBaseMsat: bigint
  feeProportionalMillionths: number
  cltvExpiryDelta: number
}

/**
 * Nós trampoline públicos conhecidos (mainnet)
 * Esses são nós que anunciam suporte a trampoline
 */
export const KNOWN_TRAMPOLINE_NODES: TrampolineNode[] = [
  // ACINQ (Phoenix)
  {
    nodeId: hexToUint8Array('03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f'),
    alias: 'ACINQ',
    feeBaseMsat: 1000n,
    feeProportionalMillionths: 100,
    cltvExpiryDelta: 144,
  },
  // ACINQ Testnet
  {
    nodeId: hexToUint8Array('03933884aaf1d6b108397e5efe5c86bcf2d8ca8d2f700eda99db9214fc2712b134'),
    alias: 'ACINQ Testnet',
    feeBaseMsat: 1000n,
    feeProportionalMillionths: 100,
    cltvExpiryDelta: 144,
  },
]

/**
 * Hop em uma rota trampoline
 */
export interface TrampolineHop {
  nodeId: Point
  amountMsat: bigint
  cltvExpiry: number
  payloadData?: Uint8Array // TLV payload para este hop
}

/**
 * Rota trampoline completa
 */
export interface TrampolineRoute {
  hops: TrampolineHop[]
  totalAmountMsat: bigint
  totalFeeMsat: bigint
  totalCltvDelta: number
}

/**
 * Payload para onion trampoline
 */
export interface TrampolinePayload {
  amtToForward: bigint
  outgoingCltvValue: number
  outgoingNodeId?: Point // Próximo hop trampoline ou destino final
  paymentSecret?: Uint8Array // 32 bytes para destino final
  totalAmountMsat?: bigint // Para MPP
  invoiceFeatures?: Uint8Array
  invoiceRoutingInfo?: Uint8Array
}

/**
 * Resultado de criação de onion trampoline
 */
export interface TrampolineOnionResult {
  outerOnion: Uint8Array // Onion normal para primeiro trampoline
  trampolineOnion: Uint8Array // Onion trampoline encapsulado
  sessionKey: Uint8Array // Chave de sessão usada
}

/**
 * Classe principal de Trampoline Routing
 */
export class TrampolineRouter {
  private trampolineNodes: TrampolineNode[]
  private currentFeeLevel: number = 0

  constructor(trampolineNodes?: TrampolineNode[]) {
    this.trampolineNodes = trampolineNodes || [...KNOWN_TRAMPOLINE_NODES]
  }

  /**
   * Adiciona nó trampoline à lista
   */
  addTrampolineNode(node: TrampolineNode): void {
    // Verificar se já existe
    const exists = this.trampolineNodes.some(
      n => uint8ArrayToHex(n.nodeId) === uint8ArrayToHex(node.nodeId),
    )
    if (!exists) {
      this.trampolineNodes.push(node)
    }
  }

  /**
   * Remove nó trampoline da lista
   */
  removeTrampolineNode(nodeId: Point): void {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    this.trampolineNodes = this.trampolineNodes.filter(n => uint8ArrayToHex(n.nodeId) !== nodeIdHex)
  }

  /**
   * Retorna lista de nós trampoline disponíveis
   */
  getTrampolineNodes(): TrampolineNode[] {
    return [...this.trampolineNodes]
  }

  /**
   * Seleciona melhor nó trampoline para alcançar destino
   * Por enquanto, usa o primeiro disponível
   */
  selectTrampolineNode(destinationNodeId?: Point): TrampolineNode | null {
    if (this.trampolineNodes.length === 0) return null

    // Simples seleção: primeiro nó disponível
    // TODO: Implementar lógica mais sofisticada baseada em:
    // - Proximidade ao destino
    // - Histórico de sucesso
    // - Fees mais baixas
    return this.trampolineNodes[0]
  }

  /**
   * Calcula fee para um nível específico
   */
  calculateFeeForLevel(amountMsat: bigint, level: number): bigint {
    const feeLevel = DEFAULT_FEE_LEVELS[Math.min(level, DEFAULT_FEE_LEVELS.length - 1)]
    const proportionalFee = (amountMsat * BigInt(feeLevel.feeProportionalMillionths)) / 1000000n
    return feeLevel.feeBaseMsat + proportionalFee
  }

  /**
   * Obtém CLTV delta para um nível de fee
   */
  getCltvDeltaForLevel(level: number): number {
    const feeLevel = DEFAULT_FEE_LEVELS[Math.min(level, DEFAULT_FEE_LEVELS.length - 1)]
    return feeLevel.cltvExpiryDelta
  }

  /**
   * Cria rota trampoline para destino
   *
   * @param destinationNodeId - Node ID do destino final
   * @param amountMsat - Valor a enviar em millisatoshis
   * @param currentBlockHeight - Altura do bloco atual
   * @param feeLevel - Nível de fee (0-3)
   */
  createTrampolineRoute(
    destinationNodeId: Point,
    amountMsat: bigint,
    currentBlockHeight: number,
    feeLevel: number = 0,
  ): TrampolineRoute | null {
    const trampolineNode = this.selectTrampolineNode(destinationNodeId)
    if (!trampolineNode) {
      console.error('[trampoline] No trampoline node available')
      return null
    }

    // Calcular fees
    const fee = this.calculateFeeForLevel(amountMsat, feeLevel)
    const cltvDelta = this.getCltvDeltaForLevel(feeLevel)

    // Calcular CLTV expiry
    // Destino recebe currentBlockHeight + cltvDelta (do trampoline)
    // Trampoline recebe currentBlockHeight + cltvDelta + finalCltvDelta
    const finalCltvExpiry = currentBlockHeight + cltvDelta
    const trampolineCltvExpiry = finalCltvExpiry + trampolineNode.cltvExpiryDelta

    const hops: TrampolineHop[] = [
      // Hop 1: Nós -> Trampoline
      {
        nodeId: trampolineNode.nodeId,
        amountMsat: amountMsat + fee,
        cltvExpiry: trampolineCltvExpiry,
      },
      // Hop 2: Trampoline -> Destino
      {
        nodeId: destinationNodeId,
        amountMsat: amountMsat,
        cltvExpiry: finalCltvExpiry,
      },
    ]

    return {
      hops,
      totalAmountMsat: amountMsat + fee,
      totalFeeMsat: fee,
      totalCltvDelta: cltvDelta + trampolineNode.cltvExpiryDelta,
    }
  }

  /**
   * Codifica payload TLV para hop trampoline
   */
  encodeTrampolinePayload(payload: TrampolinePayload): Uint8Array {
    const tlvs: Uint8Array[] = []

    // amt_to_forward (type 2, tu64)
    tlvs.push(
      this.encodeTlv(TrampolineTlvType.AMT_TO_FORWARD, this.encodeTu64(payload.amtToForward)),
    )

    // outgoing_cltv_value (type 4, tu32)
    tlvs.push(
      this.encodeTlv(
        TrampolineTlvType.OUTGOING_CLTV_VALUE,
        this.encodeTu32(payload.outgoingCltvValue),
      ),
    )

    // outgoing_node_id (type 14, point)
    if (payload.outgoingNodeId) {
      tlvs.push(this.encodeTlv(TrampolineTlvType.OUTGOING_NODE_ID, payload.outgoingNodeId))
    }

    // payment_data (type 8, payment_secret + total_msat)
    if (payload.paymentSecret) {
      const paymentData = concatUint8Arrays([
        payload.paymentSecret,
        this.encodeTu64(payload.totalAmountMsat || payload.amtToForward),
      ])
      tlvs.push(this.encodeTlv(TrampolineTlvType.PAYMENT_DATA, paymentData))
    }

    // invoice_features (type 66)
    if (payload.invoiceFeatures) {
      tlvs.push(this.encodeTlv(TrampolineTlvType.INVOICE_FEATURES, payload.invoiceFeatures))
    }

    // invoice_routing_info (type 67)
    if (payload.invoiceRoutingInfo) {
      tlvs.push(this.encodeTlv(TrampolineTlvType.INVOICE_ROUTING_INFO, payload.invoiceRoutingInfo))
    }

    // Concatenar todos os TLVs
    return concatUint8Arrays(tlvs)
  }

  /**
   * Codifica TLV individual
   */
  private encodeTlv(type: number, value: Uint8Array): Uint8Array {
    const typeBytes = this.encodeBigSize(BigInt(type))
    const lengthBytes = this.encodeBigSize(BigInt(value.length))
    return concatUint8Arrays([typeBytes, lengthBytes, value])
  }

  /**
   * Codifica BigSize (variable length integer)
   */
  private encodeBigSize(value: bigint): Uint8Array {
    if (value < 0xfdn) {
      return new Uint8Array([Number(value)])
    } else if (value < 0x10000n) {
      const buffer = new Uint8Array(3)
      buffer[0] = 0xfd
      new DataView(buffer.buffer).setUint16(1, Number(value), false)
      return buffer
    } else if (value < 0x100000000n) {
      const buffer = new Uint8Array(5)
      buffer[0] = 0xfe
      new DataView(buffer.buffer).setUint32(1, Number(value), false)
      return buffer
    } else {
      const buffer = new Uint8Array(9)
      buffer[0] = 0xff
      new DataView(buffer.buffer).setBigUint64(1, value, false)
      return buffer
    }
  }

  /**
   * Codifica tu64 (truncated u64)
   */
  private encodeTu64(value: bigint): Uint8Array {
    if (value === 0n) return new Uint8Array(0)

    const buffer = new Uint8Array(8)
    new DataView(buffer.buffer).setBigUint64(0, value, false)

    // Truncar zeros à esquerda
    let start = 0
    while (start < 7 && buffer[start] === 0) start++
    return buffer.slice(start)
  }

  /**
   * Codifica tu32 (truncated u32)
   */
  private encodeTu32(value: number): Uint8Array {
    if (value === 0) return new Uint8Array(0)

    const buffer = new Uint8Array(4)
    new DataView(buffer.buffer).setUint32(0, value, false)

    // Truncar zeros à esquerda
    let start = 0
    while (start < 3 && buffer[start] === 0) start++
    return buffer.slice(start)
  }

  /**
   * Cria onion trampoline
   *
   * O onion trampoline é menor (650 bytes) e encapsulado dentro do
   * payload do onion normal.
   *
   * @param route - Rota trampoline
   * @param paymentHash - Hash do pagamento
   * @param paymentSecret - Secret do pagamento (do invoice)
   * @param sessionKey - Chave de sessão (32 bytes random)
   */
  createTrampolineOnion(
    route: TrampolineRoute,
    paymentHash: Uint8Array,
    paymentSecret: Uint8Array,
    sessionKey?: Uint8Array,
  ): Uint8Array {
    // Gerar session key se não fornecida
    const ephemeralKey = sessionKey || crypto.getRandomValues(new Uint8Array(32))

    // Construir payloads para cada hop
    const payloads: Uint8Array[] = []

    for (let i = 0; i < route.hops.length; i++) {
      const hop = route.hops[i]
      const isLastHop = i === route.hops.length - 1

      const payload: TrampolinePayload = {
        amtToForward: hop.amountMsat,
        outgoingCltvValue: hop.cltvExpiry,
        outgoingNodeId: isLastHop ? undefined : route.hops[i + 1].nodeId,
        paymentSecret: isLastHop ? paymentSecret : undefined,
        totalAmountMsat: isLastHop ? route.totalAmountMsat : undefined,
      }

      payloads.push(this.encodeTrampolinePayload(payload))
    }

    // Construir onion usando Sphinx
    return this.constructSphinxOnion(
      route.hops.map(h => h.nodeId),
      payloads,
      ephemeralKey,
      TRAMPOLINE_ONION_SIZE,
    )
  }

  /**
   * Constrói onion packet usando Sphinx
   *
   * Implementação simplificada do Sphinx protocol.
   * Para produção, usar implementação completa em routing.ts
   */
  private constructSphinxOnion(
    nodeIds: Point[],
    payloads: Uint8Array[],
    sessionKey: Uint8Array,
    onionSize: number,
  ): Uint8Array {
    const numHops = nodeIds.length
    if (numHops > MAX_TRAMPOLINE_HOPS) {
      throw new Error(`Too many hops: ${numHops}, max: ${MAX_TRAMPOLINE_HOPS}`)
    }

    // Gerar chave pública efêmera
    const ephemeralPubkey = secp256k1.getPublicKey(sessionKey, true)

    // Calcular shared secrets para cada hop
    const sharedSecrets: Uint8Array[] = []
    const ephemeralPubkeys: Uint8Array[] = [ephemeralPubkey]
    let currentKey = sessionKey

    for (let i = 0; i < numHops; i++) {
      // ECDH: shared_secret = SHA256(pubkey * privkey)
      const sharedPoint = secp256k1.getSharedSecret(currentKey, nodeIds[i])
      const sharedSecret = sha256(sharedPoint)
      sharedSecrets.push(sharedSecret)

      // Calcular próxima ephemeral key: blindingFactor = SHA256(ephemeralPubkey || sharedSecret)
      const blindingFactor = sha256(concatUint8Arrays([ephemeralPubkeys[i], sharedSecret]))

      // Nova ephemeral key = current * blindingFactor
      if (i < numHops - 1) {
        const currentPubkey = secp256k1.getPublicKey(currentKey, true)
        // Multiply point by scalar for next ephemeral
        const nextEphemeral = secp256k1.Point.fromHex(uint8ArrayToHex(currentPubkey)).multiply(
          BigInt('0x' + uint8ArrayToHex(blindingFactor)),
        )
        ephemeralPubkeys.push(nextEphemeral.toBytes(true))
        currentKey = this.multiplyPrivateKey(currentKey, blindingFactor)
      }
    }

    // Construir hop payloads de trás para frente
    let hopData = new Uint8Array(onionSize)
    let hmac: Uint8Array = new Uint8Array(32) // Último hop tem HMAC zero

    for (let i = numHops - 1; i >= 0; i--) {
      const payload = payloads[i]
      const payloadLength = this.encodeBigSize(BigInt(payload.length))

      // Gerar stream de pseudo-random bytes usando HKDF
      const rhoKey = this.deriveKey(sharedSecrets[i], 'rho')
      const stream = this.generateStream(rhoKey, onionSize)

      // Shift hop data right and add new payload
      const newHopData = new Uint8Array(onionSize)

      // Espaço para: length + payload + hmac
      const headerSize = payloadLength.length + payload.length + 32
      newHopData.set(payloadLength, 0)
      newHopData.set(payload, payloadLength.length)
      newHopData.set(hmac, payloadLength.length + payload.length)

      // Copiar dados anteriores (truncados)
      if (onionSize - headerSize > 0) {
        newHopData.set(hopData.slice(0, onionSize - headerSize), headerSize)
      }

      // XOR com stream
      for (let j = 0; j < onionSize; j++) {
        hopData[j] = newHopData[j] ^ stream[j]
      }

      // Calcular HMAC para próximo hop
      const muKey = this.deriveKey(sharedSecrets[i], 'mu')
      hmac = new Uint8Array(this.computeHmac(muKey, hopData))
    }

    // Montar onion packet: version (1) + ephemeral_pubkey (33) + hop_payloads (onionSize) + hmac (32)
    const onionPacket = new Uint8Array(1 + 33 + onionSize + 32)
    onionPacket[0] = 0 // version
    onionPacket.set(ephemeralPubkey, 1)
    onionPacket.set(hopData, 34)
    onionPacket.set(hmac, 34 + onionSize)

    return onionPacket
  }

  /**
   * Deriva chave usando HKDF
   */
  private deriveKey(sharedSecret: Uint8Array, keyType: string): Uint8Array {
    const info = new TextEncoder().encode(keyType)
    return hkdf(sha256, sharedSecret, undefined, info, 32)
  }

  /**
   * Gera stream pseudo-aleatório usando HKDF
   * Nota: Em produção, deveria usar ChaCha20, mas HKDF é suficiente para esta implementação
   */
  private generateStream(key: Uint8Array, length: number): Uint8Array {
    // Usar HKDF para gerar stream pseudo-aleatório
    // Em produção, ChaCha20 seria preferível
    return hkdf(sha256, key, undefined, undefined, length)
  }

  /**
   * Calcula HMAC-SHA256
   */
  private computeHmac(key: Uint8Array, data: Uint8Array): Uint8Array {
    // HMAC-SHA256
    const ipad = new Uint8Array(64).fill(0x36)
    const opad = new Uint8Array(64).fill(0x5c)

    for (let i = 0; i < key.length; i++) {
      ipad[i] ^= key[i]
      opad[i] ^= key[i]
    }

    const inner = sha256(concatUint8Arrays([ipad, data]))
    return sha256(concatUint8Arrays([opad, inner]))
  }

  /**
   * Multiplica chave privada por escalar
   */
  private multiplyPrivateKey(privateKey: Uint8Array, scalar: Uint8Array): Uint8Array {
    const a = BigInt('0x' + uint8ArrayToHex(privateKey))
    const b = BigInt('0x' + uint8ArrayToHex(scalar))
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
    const result = (a * b) % n

    const hex = result.toString(16).padStart(64, '0')
    return hexToUint8Array(hex)
  }

  /**
   * Encapsula onion trampoline no payload do onion normal
   *
   * O onion normal vai do sender ao primeiro nó trampoline.
   * O payload inclui o onion trampoline como TLV.
   */
  encapsulateForNormalOnion(
    trampolineOnion: Uint8Array,
    amountMsat: bigint,
    cltvExpiry: number,
  ): Uint8Array {
    // TLV type 20: trampoline_onion_packet
    const TRAMPOLINE_TLV_TYPE = 20

    // Construir payload TLV
    const tlvs: Uint8Array[] = []

    // amt_to_forward (type 2)
    tlvs.push(this.encodeTlv(PayloadType.AMT_TO_FORWARD, this.encodeTu64(amountMsat)))

    // outgoing_cltv_value (type 4)
    tlvs.push(this.encodeTlv(PayloadType.OUTGOING_CLTV_VALUE, this.encodeTu32(cltvExpiry)))

    // trampoline_onion_packet (type 20)
    tlvs.push(this.encodeTlv(TRAMPOLINE_TLV_TYPE, trampolineOnion))

    return concatUint8Arrays(tlvs)
  }

  /**
   * Incrementa nível de fee para retry
   */
  incrementFeeLevel(): number {
    if (this.currentFeeLevel < TRAMPOLINE_FEE_LEVEL_COUNT - 1) {
      this.currentFeeLevel++
    }
    return this.currentFeeLevel
  }

  /**
   * Reseta nível de fee
   */
  resetFeeLevel(): void {
    this.currentFeeLevel = 0
  }

  /**
   * Retorna nível de fee atual
   */
  getCurrentFeeLevel(): number {
    return this.currentFeeLevel
  }

  /**
   * Verifica se pode fazer retry com fee mais alta
   */
  canRetry(): boolean {
    return this.currentFeeLevel < TRAMPOLINE_FEE_LEVEL_COUNT - 1
  }

  /**
   * Cria pagamento completo via trampoline
   *
   * Esta é a função principal para criar um pagamento trampoline.
   *
   * @param destinationNodeId - Node ID do destino
   * @param amountMsat - Valor em millisatoshis
   * @param paymentHash - Hash do pagamento (do invoice)
   * @param paymentSecret - Secret do pagamento (do invoice)
   * @param currentBlockHeight - Altura do bloco atual
   * @param feeLevel - Nível de fee (opcional, usa currentFeeLevel se não especificado)
   */
  createTrampolinePayment(
    destinationNodeId: Point,
    amountMsat: bigint,
    paymentHash: Uint8Array,
    paymentSecret: Uint8Array,
    currentBlockHeight: number,
    feeLevel?: number,
  ): TrampolineOnionResult | null {
    const level = feeLevel ?? this.currentFeeLevel

    // Criar rota trampoline
    const route = this.createTrampolineRoute(
      destinationNodeId,
      amountMsat,
      currentBlockHeight,
      level,
    )
    if (!route) {
      console.error('[trampoline] Failed to create route')
      return null
    }

    // Gerar session key
    const sessionKey = crypto.getRandomValues(new Uint8Array(32))

    // Criar onion trampoline
    const trampolineOnion = this.createTrampolineOnion(
      route,
      paymentHash,
      paymentSecret,
      sessionKey,
    )

    // Encapsular para onion normal
    const payload = this.encapsulateForNormalOnion(
      trampolineOnion,
      route.totalAmountMsat,
      route.hops[0].cltvExpiry,
    )

    console.log(
      `[trampoline] Created payment: amount=${amountMsat}, fee=${route.totalFeeMsat}, level=${level}`,
    )

    return {
      outerOnion: payload,
      trampolineOnion,
      sessionKey,
    }
  }

  /**
   * Processa erro de pagamento e determina se deve fazer retry
   *
   * @param errorCode - Código de erro do failure message
   * @returns true se deve fazer retry com fee mais alta
   */
  shouldRetryWithHigherFee(errorCode: number): boolean {
    // Códigos que indicam fee insuficiente
    const feeRelatedErrors = [
      0x100c, // FEE_INSUFFICIENT
      0x100e, // EXPIRY_TOO_SOON
      0x1007, // TEMPORARY_CHANNEL_FAILURE
    ]

    if (feeRelatedErrors.includes(errorCode) && this.canRetry()) {
      this.incrementFeeLevel()
      return true
    }

    return false
  }
}

/**
 * Factory function para criar TrampolineRouter
 */
export function createTrampolineRouter(trampolineNodes?: TrampolineNode[]): TrampolineRouter {
  return new TrampolineRouter(trampolineNodes)
}

/**
 * Verifica se um nó suporta trampoline (via features)
 */
export function supportsTrampolineRouting(features: Uint8Array): boolean {
  // Feature bit 56/57: trampoline_routing_optional/mandatory
  // Bit 56 está no byte 7 (56/8 = 7), bit 0 desse byte
  if (features.length < 8) return false

  const trampolineByte = features[features.length - 8] // Big-endian
  return (trampolineByte & 0x01) !== 0 || (trampolineByte & 0x02) !== 0
}

// ==========================================
// ENHANCED TRAMPOLINE ROUTING
// ==========================================

/**
 * Estatísticas de performance de um nó trampoline
 */
export interface TrampolineNodeStats {
  nodeId: string
  totalAttempts: number
  successfulPayments: number
  failedPayments: number
  avgResponseTimeMs: number
  lastUsed: number
  lastFailure?: number
  failureReasons: Map<number, number> // errorCode -> count
}

/**
 * Resultado de seleção de nó trampoline
 */
export interface TrampolineSelection {
  primary: TrampolineNode
  fallbacks: TrampolineNode[]
  strategy: TrampolineSelectionStrategy
}

export enum TrampolineSelectionStrategy {
  LOWEST_FEE = 'lowest_fee',
  HIGHEST_SUCCESS_RATE = 'highest_success',
  LOWEST_LATENCY = 'lowest_latency',
  ROUND_ROBIN = 'round_robin',
  WEIGHTED_RANDOM = 'weighted_random',
}

/**
 * Configuração do Enhanced Trampoline Router
 */
export interface EnhancedTrampolineConfig {
  maxRetries: number
  enableFallbackToGossip: boolean
  preferredStrategy: TrampolineSelectionStrategy
  maxFeePpm: number
  minSuccessRate: number
  failureCooldownMs: number
}

const DEFAULT_ENHANCED_CONFIG: EnhancedTrampolineConfig = {
  maxRetries: 4,
  enableFallbackToGossip: true,
  preferredStrategy: TrampolineSelectionStrategy.WEIGHTED_RANDOM,
  maxFeePpm: 5000, // 0.5%
  minSuccessRate: 0.5,
  failureCooldownMs: 60000, // 1 minuto
}

/**
 * Gerenciador de estatísticas de nós trampoline
 */
export class TrampolineStatsManager {
  private stats: Map<string, TrampolineNodeStats> = new Map()

  /**
   * Registra tentativa de pagamento
   */
  recordAttempt(nodeId: Uint8Array, startTime: number): void {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    const stat = this.getOrCreate(nodeIdHex)
    stat.totalAttempts++
    stat.lastUsed = Date.now()
    this.stats.set(nodeIdHex, stat)
  }

  /**
   * Registra sucesso de pagamento
   */
  recordSuccess(nodeId: Uint8Array, responseTimeMs: number): void {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    const stat = this.getOrCreate(nodeIdHex)
    stat.successfulPayments++

    // Atualizar média de tempo de resposta
    const totalResponses = stat.successfulPayments
    stat.avgResponseTimeMs =
      (stat.avgResponseTimeMs * (totalResponses - 1) + responseTimeMs) / totalResponses

    this.stats.set(nodeIdHex, stat)
  }

  /**
   * Registra falha de pagamento
   */
  recordFailure(nodeId: Uint8Array, errorCode: number): void {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    const stat = this.getOrCreate(nodeIdHex)
    stat.failedPayments++
    stat.lastFailure = Date.now()

    // Contar razão de falha
    const currentCount = stat.failureReasons.get(errorCode) || 0
    stat.failureReasons.set(errorCode, currentCount + 1)

    this.stats.set(nodeIdHex, stat)
  }

  /**
   * Calcula taxa de sucesso de um nó
   */
  getSuccessRate(nodeId: Uint8Array): number {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    const stat = this.stats.get(nodeIdHex)

    if (!stat || stat.totalAttempts === 0) {
      return 0.5 // Default 50% para nós sem histórico
    }

    return stat.successfulPayments / stat.totalAttempts
  }

  /**
   * Verifica se nó está em cooldown por falha recente
   */
  isInCooldown(nodeId: Uint8Array, cooldownMs: number): boolean {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    const stat = this.stats.get(nodeIdHex)

    if (!stat || !stat.lastFailure) return false

    return Date.now() - stat.lastFailure < cooldownMs
  }

  /**
   * Retorna estatísticas de um nó
   */
  getStats(nodeId: Uint8Array): TrampolineNodeStats | undefined {
    return this.stats.get(uint8ArrayToHex(nodeId))
  }

  /**
   * Retorna todas as estatísticas
   */
  getAllStats(): TrampolineNodeStats[] {
    return Array.from(this.stats.values())
  }

  private getOrCreate(nodeIdHex: string): TrampolineNodeStats {
    let stat = this.stats.get(nodeIdHex)
    if (!stat) {
      stat = {
        nodeId: nodeIdHex,
        totalAttempts: 0,
        successfulPayments: 0,
        failedPayments: 0,
        avgResponseTimeMs: 0,
        lastUsed: 0,
        failureReasons: new Map(),
      }
    }
    return stat
  }

  /**
   * Limpa estatísticas antigas
   */
  pruneOldStats(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs
    for (const [nodeId, stat] of this.stats) {
      if (stat.lastUsed < cutoff) {
        this.stats.delete(nodeId)
      }
    }
  }
}

/**
 * Seletor inteligente de nós trampoline
 */
export class SmartTrampolineSelector {
  private statsManager: TrampolineStatsManager
  private availableNodes: TrampolineNode[]
  private roundRobinIndex: number = 0
  private config: EnhancedTrampolineConfig

  constructor(
    availableNodes: TrampolineNode[],
    statsManager?: TrampolineStatsManager,
    config?: Partial<EnhancedTrampolineConfig>,
  ) {
    this.availableNodes = availableNodes
    this.statsManager = statsManager || new TrampolineStatsManager()
    this.config = { ...DEFAULT_ENHANCED_CONFIG, ...config }
  }

  /**
   * Seleciona melhor nó trampoline baseado na estratégia
   */
  select(
    amountMsat: bigint,
    destinationNodeId?: Uint8Array,
    excludeNodeIds?: Uint8Array[],
  ): TrampolineSelection | null {
    // Filtrar nós excluídos e em cooldown
    const excludeSet = new Set(excludeNodeIds?.map(n => uint8ArrayToHex(n)) || [])
    const eligibleNodes = this.availableNodes.filter(node => {
      const nodeIdHex = uint8ArrayToHex(node.nodeId)
      if (excludeSet.has(nodeIdHex)) return false
      if (this.statsManager.isInCooldown(node.nodeId, this.config.failureCooldownMs)) return false

      // Verificar taxa de sucesso mínima
      const successRate = this.statsManager.getSuccessRate(node.nodeId)
      if (successRate < this.config.minSuccessRate) return false

      // Verificar fee máxima
      const fee = this.calculateFee(node, amountMsat)
      const feePpm = Number((fee * 1000000n) / amountMsat)
      if (feePpm > this.config.maxFeePpm) return false

      return true
    })

    if (eligibleNodes.length === 0) {
      console.warn('[trampoline] No eligible trampoline nodes')
      return null
    }

    // Selecionar baseado na estratégia
    let sortedNodes: TrampolineNode[]

    switch (this.config.preferredStrategy) {
      case TrampolineSelectionStrategy.LOWEST_FEE:
        sortedNodes = this.sortByLowestFee(eligibleNodes, amountMsat)
        break

      case TrampolineSelectionStrategy.HIGHEST_SUCCESS_RATE:
        sortedNodes = this.sortBySuccessRate(eligibleNodes)
        break

      case TrampolineSelectionStrategy.LOWEST_LATENCY:
        sortedNodes = this.sortByLatency(eligibleNodes)
        break

      case TrampolineSelectionStrategy.ROUND_ROBIN:
        sortedNodes = this.getNextRoundRobin(eligibleNodes)
        break

      case TrampolineSelectionStrategy.WEIGHTED_RANDOM:
      default:
        sortedNodes = this.weightedRandomSort(eligibleNodes, amountMsat)
        break
    }

    return {
      primary: sortedNodes[0],
      fallbacks: sortedNodes.slice(1),
      strategy: this.config.preferredStrategy,
    }
  }

  /**
   * Ordena por fee mais baixa
   */
  private sortByLowestFee(nodes: TrampolineNode[], amountMsat: bigint): TrampolineNode[] {
    return [...nodes].sort((a, b) => {
      const feeA = this.calculateFee(a, amountMsat)
      const feeB = this.calculateFee(b, amountMsat)
      return Number(feeA - feeB)
    })
  }

  /**
   * Ordena por taxa de sucesso
   */
  private sortBySuccessRate(nodes: TrampolineNode[]): TrampolineNode[] {
    return [...nodes].sort((a, b) => {
      const rateA = this.statsManager.getSuccessRate(a.nodeId)
      const rateB = this.statsManager.getSuccessRate(b.nodeId)
      return rateB - rateA
    })
  }

  /**
   * Ordena por latência média
   */
  private sortByLatency(nodes: TrampolineNode[]): TrampolineNode[] {
    return [...nodes].sort((a, b) => {
      const statsA = this.statsManager.getStats(a.nodeId)
      const statsB = this.statsManager.getStats(b.nodeId)
      const latencyA = statsA?.avgResponseTimeMs || Infinity
      const latencyB = statsB?.avgResponseTimeMs || Infinity
      return latencyA - latencyB
    })
  }

  /**
   * Round robin simples
   */
  private getNextRoundRobin(nodes: TrampolineNode[]): TrampolineNode[] {
    const result: TrampolineNode[] = []
    const start = this.roundRobinIndex % nodes.length

    for (let i = 0; i < nodes.length; i++) {
      result.push(nodes[(start + i) % nodes.length])
    }

    this.roundRobinIndex++
    return result
  }

  /**
   * Seleção aleatória ponderada
   * Combina sucesso rate, fee e latência em um score
   */
  private weightedRandomSort(nodes: TrampolineNode[], amountMsat: bigint): TrampolineNode[] {
    const scored = nodes.map(node => {
      const successRate = this.statsManager.getSuccessRate(node.nodeId)
      const fee = this.calculateFee(node, amountMsat)
      const feePpm = Number((fee * 1000000n) / amountMsat)
      const stats = this.statsManager.getStats(node.nodeId)
      const latency = stats?.avgResponseTimeMs || 1000

      // Score = successRate^2 * (1 / feePpm) * (1 / log(latency))
      // Maior score = melhor
      const feeScore = 1000 / Math.max(feePpm, 1)
      const latencyScore = 1 / Math.log(Math.max(latency, 2))
      const score = Math.pow(successRate, 2) * feeScore * latencyScore

      // Adicionar randomização
      const randomFactor = 0.8 + Math.random() * 0.4 // 0.8 - 1.2
      return { node, score: score * randomFactor }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => s.node)
  }

  private calculateFee(node: TrampolineNode, amountMsat: bigint): bigint {
    const proportionalFee = (amountMsat * BigInt(node.feeProportionalMillionths)) / 1000000n
    return node.feeBaseMsat + proportionalFee
  }
}

/**
 * Enhanced Trampoline Router com seleção inteligente e fallback
 */
export class EnhancedTrampolineRouter extends TrampolineRouter {
  private statsManager: TrampolineStatsManager
  private selector: SmartTrampolineSelector
  private config: EnhancedTrampolineConfig
  private currentSelection?: TrampolineSelection
  private paymentStartTime: number = 0

  constructor(trampolineNodes?: TrampolineNode[], config?: Partial<EnhancedTrampolineConfig>) {
    super(trampolineNodes)
    this.config = { ...DEFAULT_ENHANCED_CONFIG, ...config }
    this.statsManager = new TrampolineStatsManager()
    this.selector = new SmartTrampolineSelector(
      this.getTrampolineNodes(),
      this.statsManager,
      config,
    )
  }

  /**
   * Inicia um novo pagamento com seleção inteligente
   */
  startPayment(amountMsat: bigint, destinationNodeId?: Uint8Array): TrampolineSelection | null {
    this.resetFeeLevel()
    this.paymentStartTime = Date.now()

    this.currentSelection = this.selector.select(amountMsat, destinationNodeId)

    if (this.currentSelection) {
      // Registrar tentativa
      this.statsManager.recordAttempt(this.currentSelection.primary.nodeId, this.paymentStartTime)
    }

    return this.currentSelection
  }

  /**
   * Registra sucesso do pagamento
   */
  recordPaymentSuccess(): void {
    if (!this.currentSelection) return

    const responseTime = Date.now() - this.paymentStartTime
    this.statsManager.recordSuccess(this.currentSelection.primary.nodeId, responseTime)

    console.log(
      `[trampoline] Payment succeeded via ${this.currentSelection.primary.alias || 'unknown'} in ${responseTime}ms`,
    )
  }

  /**
   * Registra falha e tenta fallback
   */
  handlePaymentFailure(errorCode: number): TrampolineNode | null {
    if (!this.currentSelection) return null

    // Registrar falha
    this.statsManager.recordFailure(this.currentSelection.primary.nodeId, errorCode)

    console.log(
      `[trampoline] Payment failed via ${this.currentSelection.primary.alias || 'unknown'}: error ${errorCode.toString(16)}`,
    )

    // Se é erro de fee, tentar com fee mais alta no mesmo nó
    if (this.shouldRetryWithHigherFee(errorCode)) {
      return this.currentSelection.primary
    }

    // Tentar próximo fallback
    if (this.currentSelection.fallbacks.length > 0) {
      const fallback = this.currentSelection.fallbacks.shift()!
      this.currentSelection.primary = fallback
      this.statsManager.recordAttempt(fallback.nodeId, Date.now())
      return fallback
    }

    return null
  }

  /**
   * Cria pagamento com seleção inteligente
   */
  createSmartTrampolinePayment(
    destinationNodeId: Uint8Array,
    amountMsat: bigint,
    paymentHash: Uint8Array,
    paymentSecret: Uint8Array,
    currentBlockHeight: number,
  ): { result: TrampolineOnionResult; selectedNode: TrampolineNode } | null {
    const selection = this.startPayment(amountMsat, destinationNodeId)
    if (!selection) return null

    const result = this.createTrampolinePayment(
      destinationNodeId,
      amountMsat,
      paymentHash,
      paymentSecret,
      currentBlockHeight,
    )

    if (!result) return null

    return {
      result,
      selectedNode: selection.primary,
    }
  }

  /**
   * Retorna estatísticas de todos os nós
   */
  getNodeStats(): TrampolineNodeStats[] {
    return this.statsManager.getAllStats()
  }

  /**
   * Retorna melhor nó baseado em histórico
   */
  getBestNode(amountMsat: bigint): TrampolineNode | null {
    const selection = this.selector.select(amountMsat)
    return selection?.primary || null
  }
}

/**
 * Rota com múltiplos trampolines (E2E trampoline routing)
 */
export interface MultiTrampolineRoute {
  trampolines: TrampolineNode[]
  totalAmountMsat: bigint
  totalFeeMsat: bigint
  totalCltvDelta: number
}

/**
 * Cria rota com múltiplos nós trampoline (para maior privacidade)
 */
export function createMultiTrampolineRoute(
  trampolines: TrampolineNode[],
  destinationNodeId: Uint8Array,
  amountMsat: bigint,
  currentBlockHeight: number,
): MultiTrampolineRoute | null {
  if (trampolines.length === 0 || trampolines.length > MAX_TRAMPOLINE_HOPS - 1) {
    console.error(`[trampoline] Invalid number of trampolines: ${trampolines.length}`)
    return null
  }

  let totalFee = 0n
  let totalCltvDelta = 0
  let currentAmount = amountMsat

  // Calcular de trás para frente
  for (let i = trampolines.length - 1; i >= 0; i--) {
    const node = trampolines[i]

    // Fee para este hop
    const fee =
      node.feeBaseMsat + (currentAmount * BigInt(node.feeProportionalMillionths)) / 1000000n
    totalFee += fee
    currentAmount += fee

    // CLTV
    totalCltvDelta += node.cltvExpiryDelta
  }

  return {
    trampolines,
    totalAmountMsat: currentAmount,
    totalFeeMsat: totalFee,
    totalCltvDelta,
  }
}

/**
 * Factory para Enhanced Trampoline Router
 */
export function createEnhancedTrampolineRouter(
  trampolineNodes?: TrampolineNode[],
  config?: Partial<EnhancedTrampolineConfig>,
): EnhancedTrampolineRouter {
  return new EnhancedTrampolineRouter(trampolineNodes, config)
}
