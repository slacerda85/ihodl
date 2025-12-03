/**
 * BOLT #7 - Gossip Protocol Implementation
 *
 * Implementa sincronização de gossip com a rede Lightning:
 * - gossip_timestamp_filter: Filtra mensagens por timestamp
 * - query_channel_range: Solicita canais por range de blocos
 * - reply_channel_range: Responde com canais no range
 * - query_short_channel_ids: Solicita info de canais específicos
 *
 * Referência: https://github.com/lightning/bolts/blob/master/07-routing-gossip.md
 */

import {
  GossipMessageType,
  GossipTimestampFilterMessage,
  QueryChannelRangeMessage,
  ReplyChannelRangeMessage,
  QueryShortChannelIdsMessage,
  ChannelAnnouncementMessage,
  NodeAnnouncementMessage,
  ChannelUpdateMessage,
  EncodingType,
  BITCOIN_CHAIN_HASH,
  formatShortChannelId,
} from '@/core/models/lightning/p2p'
import { ShortChannelId, ChainHash } from '@/core/models/lightning/base'
import { uint8ArrayToHex } from '@/core/lib/utils'

// Constantes de sincronização
const SYNC_BATCH_SIZE = 8000 // Número máximo de canais por batch
const GOSSIP_FLUSH_INTERVAL_MS = 60000 // 60 segundos
const STALE_GOSSIP_THRESHOLD_SECONDS = 1209600 // 2 semanas
const MAX_QUERY_RANGE_BLOCKS = 100000 // Máximo de blocos por query

/**
 * Estado de sincronização de gossip
 */
export enum GossipSyncState {
  IDLE = 'IDLE',
  SYNCING = 'SYNCING',
  SYNCED = 'SYNCED',
  ERROR = 'ERROR',
}

/**
 * Opções de sincronização
 */
export interface GossipSyncOptions {
  chainHash?: ChainHash
  requestTimestamps?: boolean
  requestChecksums?: boolean
  batchSize?: number
  startBlockHeight?: number
  fullSync?: boolean
}

/**
 * Estatísticas de sincronização
 */
export interface GossipSyncStats {
  state: GossipSyncState
  channelAnnouncementsReceived: number
  nodeAnnouncementsReceived: number
  channelUpdatesReceived: number
  queriesSent: number
  repliesReceived: number
  lastSyncTimestamp: number
  syncProgress: number // 0.0 - 1.0
}

/**
 * Callback para mensagens de gossip recebidas
 */
export type GossipMessageCallback = (
  message: ChannelAnnouncementMessage | NodeAnnouncementMessage | ChannelUpdateMessage,
) => Promise<void>

/**
 * Interface para enviar mensagens ao peer
 */
export interface GossipPeerInterface {
  sendMessage(data: Uint8Array): Promise<void>
  onMessage(handler: (data: Uint8Array) => void): void
  isConnected(): boolean
}

/**
 * Classe principal de sincronização de Gossip
 */
export class GossipSync {
  private state: GossipSyncState = GossipSyncState.IDLE
  private chainHash: ChainHash
  private stats: GossipSyncStats
  private pendingQueries: Map<string, { resolve: () => void; reject: (err: Error) => void }>
  private messageCallback: GossipMessageCallback | null = null
  private lastTimestamp: number = 0
  private flushTimer: ReturnType<typeof setInterval> | null = null

  // Canais conhecidos por shortChannelId
  private knownChannels: Set<string> = new Set()

  // Buffer de mensagens pendentes para processar
  private messageBuffer: (
    | ChannelAnnouncementMessage
    | NodeAnnouncementMessage
    | ChannelUpdateMessage
  )[] = []

  constructor(chainHash?: ChainHash) {
    this.chainHash = chainHash || BITCOIN_CHAIN_HASH
    this.pendingQueries = new Map()
    this.stats = {
      state: GossipSyncState.IDLE,
      channelAnnouncementsReceived: 0,
      nodeAnnouncementsReceived: 0,
      channelUpdatesReceived: 0,
      queriesSent: 0,
      repliesReceived: 0,
      lastSyncTimestamp: 0,
      syncProgress: 0,
    }
  }

  /**
   * Define callback para mensagens de gossip recebidas
   */
  setMessageCallback(callback: GossipMessageCallback): void {
    this.messageCallback = callback
  }

  /**
   * Retorna estatísticas de sincronização
   */
  getStats(): GossipSyncStats {
    return { ...this.stats, state: this.state }
  }

  /**
   * Retorna estado atual
   */
  getState(): GossipSyncState {
    return this.state
  }

  /**
   * Cria mensagem gossip_timestamp_filter (tipo 265)
   *
   * Usada para informar ao peer que queremos receber mensagens de gossip
   * a partir de um timestamp específico.
   *
   * @param firstTimestamp - Timestamp inicial (Unix epoch)
   * @param timestampRange - Range de timestamps (0xFFFFFFFF para todos futuros)
   */
  createGossipTimestampFilter(
    firstTimestamp: number = Math.floor(Date.now() / 1000) - STALE_GOSSIP_THRESHOLD_SECONDS,
    timestampRange: number = 0xffffffff,
  ): GossipTimestampFilterMessage {
    return {
      type: GossipMessageType.GOSSIP_TIMESTAMP_FILTER,
      chainHash: this.chainHash,
      firstTimestamp,
      timestampRange,
    }
  }

  /**
   * Serializa gossip_timestamp_filter para envio
   */
  encodeGossipTimestampFilter(message: GossipTimestampFilterMessage): Uint8Array {
    // Formato: type (2) + chainHash (32) + firstTimestamp (4) + timestampRange (4)
    const buffer = new Uint8Array(42)
    const view = new DataView(buffer.buffer)

    view.setUint16(0, message.type, false)
    buffer.set(message.chainHash, 2)
    view.setUint32(34, message.firstTimestamp, false)
    view.setUint32(38, message.timestampRange, false)

    return buffer
  }

  /**
   * Cria mensagem query_channel_range (tipo 263)
   *
   * Solicita ao peer uma lista de short_channel_ids para canais
   * que foram confirmados em um range de blocos.
   *
   * @param firstBlocknum - Primeiro bloco do range
   * @param numberOfBlocks - Número de blocos a consultar
   * @param wantTimestamps - Se deve incluir timestamps nos replies
   * @param wantChecksums - Se deve incluir checksums nos replies
   */
  createQueryChannelRange(
    firstBlocknum: number,
    numberOfBlocks: number = MAX_QUERY_RANGE_BLOCKS,
    wantTimestamps: boolean = true,
    wantChecksums: boolean = true,
  ): QueryChannelRangeMessage {
    let queryOption = 0n
    if (wantTimestamps) queryOption |= 1n
    if (wantChecksums) queryOption |= 2n

    return {
      type: GossipMessageType.QUERY_CHANNEL_RANGE,
      chainHash: this.chainHash,
      firstBlocknum,
      numberOfBlocks: Math.min(numberOfBlocks, MAX_QUERY_RANGE_BLOCKS),
      tlvs: {
        queryOption,
      },
    }
  }

  /**
   * Serializa query_channel_range para envio
   */
  encodeQueryChannelRange(message: QueryChannelRangeMessage): Uint8Array {
    // Formato base: type (2) + chainHash (32) + firstBlocknum (4) + numberOfBlocks (4)
    const baseLength = 42
    const hasTlv = message.tlvs.queryOption !== undefined && message.tlvs.queryOption !== 0n

    // TLV: type (1) + length (1) + value (bigsize)
    const tlvLength = hasTlv ? 3 : 0

    const buffer = new Uint8Array(baseLength + tlvLength)
    const view = new DataView(buffer.buffer)

    view.setUint16(0, message.type, false)
    buffer.set(message.chainHash, 2)
    view.setUint32(34, message.firstBlocknum, false)
    view.setUint32(38, message.numberOfBlocks, false)

    // TLV para query_option
    if (hasTlv) {
      buffer[42] = 1 // TLV type
      buffer[43] = 1 // TLV length
      buffer[44] = Number(message.tlvs.queryOption) // value
    }

    return buffer
  }

  /**
   * Decodifica reply_channel_range recebido
   */
  decodeReplyChannelRange(data: Uint8Array): ReplyChannelRangeMessage | null {
    if (data.length < 44) return null

    const view = new DataView(data.buffer, data.byteOffset)
    const type = view.getUint16(0, false)

    if (type !== GossipMessageType.REPLY_CHANNEL_RANGE) return null

    const chainHash = data.slice(2, 34)
    const firstBlocknum = view.getUint32(34, false)
    const numberOfBlocks = view.getUint32(38, false)
    const syncComplete = data[42]
    const len = view.getUint16(43, false)
    const encodedShortIds = data.slice(45, 45 + len)

    return {
      type,
      chainHash,
      firstBlocknum,
      numberOfBlocks,
      syncComplete,
      len,
      encodedShortIds,
      tlvs: {}, // TODO: Parse TLVs
    }
  }

  /**
   * Extrai short_channel_ids de encodedShortIds
   */
  decodeShortChannelIds(encoded: Uint8Array): ShortChannelId[] {
    if (encoded.length === 0) return []

    const encodingType = encoded[0]
    const scids: ShortChannelId[] = []

    if (encodingType === EncodingType.UNCOMPRESSED) {
      // Cada SCID tem 8 bytes
      const data = encoded.slice(1)
      for (let i = 0; i < data.length; i += 8) {
        if (i + 8 <= data.length) {
          scids.push(data.slice(i, i + 8))
        }
      }
    }
    // EncodingType.ZLIB_DEPRECATED não é suportado

    return scids
  }

  /**
   * Cria mensagem query_short_channel_ids (tipo 261)
   *
   * Solicita informações completas (announcements + updates) para
   * uma lista de short_channel_ids específicos.
   *
   * @param shortChannelIds - Lista de SCIDs a consultar
   */
  createQueryShortChannelIds(shortChannelIds: ShortChannelId[]): QueryShortChannelIdsMessage {
    // Encodar SCIDs com encoding_type uncompressed
    const encodedLength = 1 + shortChannelIds.length * 8
    const encodedShortIds = new Uint8Array(encodedLength)
    encodedShortIds[0] = EncodingType.UNCOMPRESSED

    for (let i = 0; i < shortChannelIds.length; i++) {
      encodedShortIds.set(shortChannelIds[i], 1 + i * 8)
    }

    return {
      type: GossipMessageType.QUERY_SHORT_CHANNEL_IDS,
      chainHash: this.chainHash,
      len: encodedLength,
      encodedShortIds,
      tlvs: {},
    }
  }

  /**
   * Serializa query_short_channel_ids para envio
   */
  encodeQueryShortChannelIds(message: QueryShortChannelIdsMessage): Uint8Array {
    // Formato: type (2) + chainHash (32) + len (2) + encodedShortIds
    const buffer = new Uint8Array(36 + message.len)
    const view = new DataView(buffer.buffer)

    view.setUint16(0, message.type, false)
    buffer.set(message.chainHash, 2)
    view.setUint16(34, message.len, false)
    buffer.set(message.encodedShortIds, 36)

    return buffer
  }

  /**
   * Processa mensagem recebida do peer
   */
  async handleIncomingMessage(data: Uint8Array): Promise<void> {
    if (data.length < 2) return

    const view = new DataView(data.buffer, data.byteOffset)
    const messageType = view.getUint16(0, false)

    switch (messageType) {
      case GossipMessageType.REPLY_CHANNEL_RANGE:
        await this.handleReplyChannelRange(data)
        break

      case GossipMessageType.REPLY_SHORT_CHANNEL_IDS_END:
        await this.handleReplyShortChannelIdsEnd(data)
        break

      case GossipMessageType.CHANNEL_ANNOUNCEMENT:
        await this.handleChannelAnnouncement(data)
        break

      case GossipMessageType.NODE_ANNOUNCEMENT:
        await this.handleNodeAnnouncement(data)
        break

      case GossipMessageType.CHANNEL_UPDATE:
        await this.handleChannelUpdate(data)
        break

      default:
        // Ignorar mensagens desconhecidas
        break
    }
  }

  /**
   * Processa reply_channel_range
   */
  private async handleReplyChannelRange(data: Uint8Array): Promise<void> {
    const reply = this.decodeReplyChannelRange(data)
    if (!reply) return

    this.stats.repliesReceived++

    // Extrair SCIDs
    const scids = this.decodeShortChannelIds(reply.encodedShortIds)

    console.log(
      `[gossip] Received reply_channel_range: blocks ${reply.firstBlocknum}-${reply.firstBlocknum + reply.numberOfBlocks}, ${scids.length} channels`,
    )

    // Registrar canais conhecidos
    for (const scid of scids) {
      const scidHex = uint8ArrayToHex(scid)
      if (!this.knownChannels.has(scidHex)) {
        this.knownChannels.add(scidHex)
      }
    }

    // Verificar se sync está completo
    if (reply.syncComplete === 1) {
      this.state = GossipSyncState.SYNCED
      this.stats.syncProgress = 1.0
      console.log(`[gossip] Sync complete. Total channels: ${this.knownChannels.size}`)

      // Resolver query pendente
      const queryKey = `range_${reply.firstBlocknum}`
      const pending = this.pendingQueries.get(queryKey)
      if (pending) {
        pending.resolve()
        this.pendingQueries.delete(queryKey)
      }
    }
  }

  /**
   * Processa reply_short_channel_ids_end
   */
  private async handleReplyShortChannelIdsEnd(data: Uint8Array): Promise<void> {
    if (data.length < 35) return

    const fullInformation = data[34]
    this.stats.repliesReceived++

    console.log(
      `[gossip] Received reply_short_channel_ids_end, fullInformation: ${fullInformation}`,
    )

    // Resolver queries pendentes
    const queryKey = `scids_pending`
    const pending = this.pendingQueries.get(queryKey)
    if (pending) {
      pending.resolve()
      this.pendingQueries.delete(queryKey)
    }
  }

  /**
   * Decodifica e processa channel_announcement
   */
  private async handleChannelAnnouncement(data: Uint8Array): Promise<void> {
    const message = this.decodeChannelAnnouncement(data)
    if (!message) return

    this.stats.channelAnnouncementsReceived++

    // Registrar canal conhecido
    const scidHex = uint8ArrayToHex(message.shortChannelId)
    this.knownChannels.add(scidHex)

    // Chamar callback
    if (this.messageCallback) {
      await this.messageCallback(message)
    }

    console.log(
      `[gossip] Received channel_announcement: ${formatShortChannelId(message.shortChannelId)}`,
    )
  }

  /**
   * Decodifica channel_announcement
   */
  private decodeChannelAnnouncement(data: Uint8Array): ChannelAnnouncementMessage | null {
    // Formato mínimo: type (2) + signatures (4*64) + featuresLen (2) + chainHash (32) + scid (8) + nodeIds (2*33) + bitcoinKeys (2*33)
    const minLength = 2 + 256 + 2 + 32 + 8 + 66 + 66
    if (data.length < minLength) return null

    const view = new DataView(data.buffer, data.byteOffset)
    let offset = 2 // Skip type

    const nodeSignature1 = data.slice(offset, offset + 64)
    offset += 64
    const nodeSignature2 = data.slice(offset, offset + 64)
    offset += 64
    const bitcoinSignature1 = data.slice(offset, offset + 64)
    offset += 64
    const bitcoinSignature2 = data.slice(offset, offset + 64)
    offset += 64

    const featuresLen = view.getUint16(offset, false)
    offset += 2
    const features = data.slice(offset, offset + featuresLen)
    offset += featuresLen

    const chainHash = data.slice(offset, offset + 32)
    offset += 32
    const shortChannelId = data.slice(offset, offset + 8)
    offset += 8
    const nodeId1 = data.slice(offset, offset + 33)
    offset += 33
    const nodeId2 = data.slice(offset, offset + 33)
    offset += 33
    const bitcoinKey1 = data.slice(offset, offset + 33)
    offset += 33
    const bitcoinKey2 = data.slice(offset, offset + 33)

    return {
      type: GossipMessageType.CHANNEL_ANNOUNCEMENT,
      nodeSignature1,
      nodeSignature2,
      bitcoinSignature1,
      bitcoinSignature2,
      featuresLen,
      features,
      chainHash,
      shortChannelId,
      nodeId1,
      nodeId2,
      bitcoinKey1,
      bitcoinKey2,
    }
  }

  /**
   * Decodifica e processa node_announcement
   */
  private async handleNodeAnnouncement(data: Uint8Array): Promise<void> {
    const message = this.decodeNodeAnnouncement(data)
    if (!message) return

    this.stats.nodeAnnouncementsReceived++

    // Atualizar timestamp
    if (message.timestamp > this.lastTimestamp) {
      this.lastTimestamp = message.timestamp
      this.stats.lastSyncTimestamp = message.timestamp
    }

    // Chamar callback
    if (this.messageCallback) {
      await this.messageCallback(message)
    }

    console.log(
      `[gossip] Received node_announcement: ${uint8ArrayToHex(message.nodeId).slice(0, 16)}...`,
    )
  }

  /**
   * Decodifica node_announcement
   */
  private decodeNodeAnnouncement(data: Uint8Array): NodeAnnouncementMessage | null {
    // Formato mínimo: type (2) + signature (64) + featuresLen (2) + timestamp (4) + nodeId (33) + rgbColor (3) + alias (32) + addrLen (2)
    const minLength = 2 + 64 + 2 + 4 + 33 + 3 + 32 + 2
    if (data.length < minLength) return null

    const view = new DataView(data.buffer, data.byteOffset)
    let offset = 2 // Skip type

    const signature = data.slice(offset, offset + 64)
    offset += 64

    const featuresLen = view.getUint16(offset, false)
    offset += 2
    const features = data.slice(offset, offset + featuresLen)
    offset += featuresLen

    const timestamp = view.getUint32(offset, false)
    offset += 4
    const nodeId = data.slice(offset, offset + 33)
    offset += 33
    const rgbColor = data.slice(offset, offset + 3)
    offset += 3
    const alias = data.slice(offset, offset + 32)
    offset += 32

    const addrLen = view.getUint16(offset, false)
    offset += 2

    // Parse addresses (simplificado)
    const addresses: { type: number; addr: Uint8Array; port: number }[] = []
    const addrEnd = offset + addrLen
    while (offset < addrEnd && offset < data.length) {
      const addrType = data[offset]
      offset++

      let addrBytes = 0
      switch (addrType) {
        case 1:
          addrBytes = 4
          break // IPv4
        case 2:
          addrBytes = 16
          break // IPv6
        case 4:
          addrBytes = 35
          break // Tor v3
        default:
          break
      }

      if (addrBytes > 0 && offset + addrBytes + 2 <= data.length) {
        const addr = data.slice(offset, offset + addrBytes)
        offset += addrBytes
        const port = view.getUint16(offset, false)
        offset += 2
        addresses.push({ type: addrType, addr, port })
      } else {
        break
      }
    }

    return {
      type: GossipMessageType.NODE_ANNOUNCEMENT,
      signature,
      featuresLen,
      features,
      timestamp,
      nodeId,
      rgbColor,
      alias,
      addrLen,
      addresses: addresses as NodeAnnouncementMessage['addresses'],
    }
  }

  /**
   * Decodifica e processa channel_update
   */
  private async handleChannelUpdate(data: Uint8Array): Promise<void> {
    const message = this.decodeChannelUpdate(data)
    if (!message) return

    this.stats.channelUpdatesReceived++

    // Atualizar timestamp
    if (message.timestamp > this.lastTimestamp) {
      this.lastTimestamp = message.timestamp
      this.stats.lastSyncTimestamp = message.timestamp
    }

    // Chamar callback
    if (this.messageCallback) {
      await this.messageCallback(message)
    }

    console.log(`[gossip] Received channel_update: ${formatShortChannelId(message.shortChannelId)}`)
  }

  /**
   * Decodifica channel_update
   */
  private decodeChannelUpdate(data: Uint8Array): ChannelUpdateMessage | null {
    // Formato: type (2) + signature (64) + chainHash (32) + scid (8) + timestamp (4) + messageFlags (1) + channelFlags (1) + cltvExpiryDelta (2) + htlcMinimumMsat (8) + feeBaseMsat (4) + feeProportionalMillionths (4) + htlcMaximumMsat (8)
    const expectedLength = 2 + 64 + 32 + 8 + 4 + 1 + 1 + 2 + 8 + 4 + 4 + 8
    if (data.length < expectedLength) return null

    const view = new DataView(data.buffer, data.byteOffset)
    let offset = 2 // Skip type

    const signature = data.slice(offset, offset + 64)
    offset += 64
    const chainHash = data.slice(offset, offset + 32)
    offset += 32
    const shortChannelId = data.slice(offset, offset + 8)
    offset += 8
    const timestamp = view.getUint32(offset, false)
    offset += 4
    const messageFlags = data[offset]
    offset++
    const channelFlags = data[offset]
    offset++
    const cltvExpiryDelta = view.getUint16(offset, false)
    offset += 2
    const htlcMinimumMsat = view.getBigUint64(offset, false)
    offset += 8
    const feeBaseMsat = view.getUint32(offset, false)
    offset += 4
    const feeProportionalMillionths = view.getUint32(offset, false)
    offset += 4
    const htlcMaximumMsat = view.getBigUint64(offset, false)

    return {
      type: GossipMessageType.CHANNEL_UPDATE,
      signature,
      chainHash,
      shortChannelId,
      timestamp,
      messageFlags,
      channelFlags,
      cltvExpiryDelta,
      htlcMinimumMsat,
      feeBaseMsat,
      feeProportionalMillionths,
      htlcMaximumMsat,
    }
  }

  /**
   * Inicia sincronização de gossip com um peer
   *
   * @param peer - Interface do peer conectado
   * @param options - Opções de sincronização
   */
  async startSync(peer: GossipPeerInterface, options: GossipSyncOptions = {}): Promise<void> {
    if (!peer.isConnected()) {
      throw new Error('Peer not connected')
    }

    this.state = GossipSyncState.SYNCING
    this.stats.syncProgress = 0

    console.log('[gossip] Starting gossip sync')

    try {
      // 1. Enviar gossip_timestamp_filter para começar a receber atualizações
      const timestampFilter = this.createGossipTimestampFilter()
      const filterMsg = this.encodeGossipTimestampFilter(timestampFilter)
      await peer.sendMessage(filterMsg)
      this.stats.queriesSent++

      // 2. Para sync completo, consultar range de blocos
      if (options.fullSync !== false) {
        const startBlock = options.startBlockHeight ?? 0
        const query = this.createQueryChannelRange(
          startBlock,
          MAX_QUERY_RANGE_BLOCKS,
          options.requestTimestamps ?? true,
          options.requestChecksums ?? true,
        )
        const queryMsg = this.encodeQueryChannelRange(query)
        await peer.sendMessage(queryMsg)
        this.stats.queriesSent++

        // Aguardar resposta
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Query channel range timeout'))
          }, 60000) // 60s timeout

          this.pendingQueries.set(`range_${startBlock}`, {
            resolve: () => {
              clearTimeout(timeout)
              resolve()
            },
            reject: err => {
              clearTimeout(timeout)
              reject(err)
            },
          })
        })
      }

      // 3. Iniciar timer de flush para processar mensagens em lote
      this.startFlushTimer()

      console.log('[gossip] Gossip sync initiated successfully')
    } catch (error) {
      this.state = GossipSyncState.ERROR
      console.error('[gossip] Failed to start sync:', error)
      throw error
    }
  }

  /**
   * Solicita informações de canais específicos
   */
  async queryChannels(peer: GossipPeerInterface, scids: ShortChannelId[]): Promise<void> {
    if (scids.length === 0) return

    // Dividir em batches
    for (let i = 0; i < scids.length; i += SYNC_BATCH_SIZE) {
      const batch = scids.slice(i, i + SYNC_BATCH_SIZE)
      const query = this.createQueryShortChannelIds(batch)
      const msg = this.encodeQueryShortChannelIds(query)

      await peer.sendMessage(msg)
      this.stats.queriesSent++

      console.log(`[gossip] Queried ${batch.length} channels`)
    }
  }

  /**
   * Inicia timer de flush para processamento em lote
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return

    this.flushTimer = setInterval(() => {
      this.flushMessageBuffer()
    }, GOSSIP_FLUSH_INTERVAL_MS)
  }

  /**
   * Para timer de flush
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * Processa mensagens buffered
   */
  private async flushMessageBuffer(): Promise<void> {
    if (this.messageBuffer.length === 0) return

    const messages = this.messageBuffer.splice(0, this.messageBuffer.length)
    console.log(`[gossip] Flushing ${messages.length} buffered messages`)

    for (const message of messages) {
      if (this.messageCallback) {
        try {
          await this.messageCallback(message)
        } catch (error) {
          console.error('[gossip] Error processing message:', error)
        }
      }
    }
  }

  /**
   * Retorna número de canais conhecidos
   */
  getKnownChannelCount(): number {
    return this.knownChannels.size
  }

  /**
   * Verifica se um canal é conhecido
   */
  isChannelKnown(scid: ShortChannelId): boolean {
    return this.knownChannels.has(uint8ArrayToHex(scid))
  }

  /**
   * Limpa recursos e para sincronização
   */
  stop(): void {
    this.stopFlushTimer()
    this.state = GossipSyncState.IDLE
    this.pendingQueries.clear()
    console.log('[gossip] Gossip sync stopped')
  }

  /**
   * Reseta estado de sincronização
   */
  reset(): void {
    this.stop()
    this.knownChannels.clear()
    this.messageBuffer = []
    this.lastTimestamp = 0
    this.stats = {
      state: GossipSyncState.IDLE,
      channelAnnouncementsReceived: 0,
      nodeAnnouncementsReceived: 0,
      channelUpdatesReceived: 0,
      queriesSent: 0,
      repliesReceived: 0,
      lastSyncTimestamp: 0,
      syncProgress: 0,
    }
  }
}

/**
 * Factory function para criar GossipSync
 */
export function createGossipSync(chainHash?: ChainHash): GossipSync {
  return new GossipSync(chainHash)
}
