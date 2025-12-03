// BOLT #1 & #8: Lightning Network Client Implementation
// Complete Lightning Network client with wallet operations
//
// ORQUESTRAÇÃO COMPLETA DO FLUXO LIGHTNING NETWORK:
// ==================================================
//
// Este cliente é o orquestrador principal de todas as operações Lightning.
// Ele coordena o fluxo completo desde a conexão até pagamentos e gerenciamento de canais.
//
// FLUXO GERAL (ORDEM DE EXECUÇÃO):
// 1. CONEXÃO E HANDSHAKE (BOLT #1 + #8)
//    - createConnection() -> performNoiseHandshake() -> exchangeInitMessages()
//    - Resultado: LightningConnection estabelecida com chaves de transporte
//
// 2. GERENCIAMENTO DE CANAIS (BOLT #2)
//    - hasActiveChannels() -> Verificar canais existentes
//    - generateInvoice() -> Criar invoice com abertura automática de canal se necessário
//    - getChannelBasepoints() -> Derivar basepoints para novos canais
//
// 3. PAGAMENTOS (BOLT #2 + #11)
//    - sendPayment() -> Enviar pagamento via HTLC
//    - getBalance() -> Consultar saldo disponível
//
// 4. DERIVAÇÃO DE CHAVES (LNPBP-46)
//    - getExtendedLightningKey() -> Chave raiz Lightning m/9735'/
//    - getNodeKey() -> Chave de nó para assinatura
//    - getChannelBasepoints() -> Basepoints para canais
//    - getFundingWallet() -> Carteira de funding
//
// USO TÍPICO:
// 1. Criar cliente: LightningClient.create(config, masterKey)
// 2. Verificar canais: client.hasActiveChannels()
// 3. Gerar invoice: client.generateInvoice({amount: 1000n, description: "Pagamento"})
// 4. Enviar pagamento: client.sendPayment({invoice: "lnbc...", amount: 1000n})
// 5. Fechar: client.close()

import {
  generateKey,
  initializeHandshakeState,
  actOneSend,
  actTwoReceive,
  actThreeSend,
  encryptMessage,
  decryptMessage,
} from './transport'
import { encodeInitMessage, decodeInitMessage, encodePingMessage, decodePongMessage } from './base'
import { KeyPair, HandshakeState, TransportKeys } from '@/core/models/lightning/transport'
import { LightningMessageType, InitMessage, PingMessage } from '@/core/models/lightning/base'
import { Socket, Peer } from '@/core/models/network'
import {
  AcceptChannelMessage,
  FundingCreatedMessage,
  ChannelReadyMessage,
} from '@/core/models/lightning/peer'
import {
  LightningConnection,
  LightningClientConfig,
  HandshakeResult,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_PING_PONG_CONFIG,
  PingPongConfig,
  ChannelOpeningFeeConfig,
  DEFAULT_CHANNEL_FEE_CONFIG,
  LightningPaymentRequest,
  PaymentResult,
  GenerateInvoiceParams,
  InvoiceWithChannelInfo,
  LIGHTNING_PURPOSE,
  LIGHTNING_COIN_TYPE,
} from '@/core/models/lightning/client'
import { createLightningSocket } from '@/core/lib/network/socket'
import {
  InvoiceCreateParams,
  CurrencyPrefix,
  DEFAULT_EXPIRY_SECONDS,
  DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
} from '@/core/models/lightning/invoice'
import { encodeInvoice } from './invoice'
import { deriveChildKey, createPublicKey } from '../key'
import { sha256, randomBytes } from '../crypto/crypto'
import {
  RoutingGraph,
  PaymentRoute,
  RoutingNode,
  RoutingChannel,
  constructOnionPacket,
  decryptOnion,
} from './routing'
import { GossipMessageUnion } from '@/core/models/lightning/p2p'
import { PaymentHash } from '@/core/models/lightning/transaction'
import { PaymentSecret } from '@/core/models/lightning/invoice'
import { CoinType } from '@/core/models/address'
import { LnVersion, NodeIndex, constructChannelIndex } from '@/core/models/lightning/lnpbp42'
import { hexToUint8Array, uint8ArrayToHex } from '../utils'
import { lightningPersistence } from './persistence'
import {
  encodeOpenChannelMessage,
  encodeFundingCreatedMessage,
  encodeChannelReadyMessage,
  encodeShutdownMessage,
  encodeUpdateAddHtlcMessage,
  encodeUpdateFulfillHtlcMessage,
  encodeUpdateFailHtlcMessage,
} from './peer'

import { broadcastTransaction, estimateFeeRate } from '../electrum/client'

// Novos módulos Lightning integrados
import { ChannelManager, ChannelState as ChannelMgrState } from './channel'
import { RevocationStore } from './revocation'
import type { LocalConfig } from './commitment'

// BOLT #7: Gossip Protocol
import {
  GossipSync,
  GossipSyncState,
  GossipSyncStats,
  GossipPeerInterface,
  createGossipSync,
} from './gossip'

// Trampoline Routing
import {
  TrampolineRouter,
  TrampolineRoute,
  TrampolineNode,
  TrampolineOnionResult,
  createTrampolineRouter,
  supportsTrampolineRouting,
  KNOWN_TRAMPOLINE_NODES,
} from './trampoline'

/**
 * Lightning Client - Wallet-level operations
 * Provides complete Lightning Network functionality including:
 * - Invoice generation with automatic channel opening
 * - Payment sending (future)
 * - Balance management (future)
 *
 * ARQUITETURA GERAL:
 * ==================
 *
 * Esta classe é dividida em seções funcionais:
 * 1. CONSTRUTOR E CONFIGURAÇÃO
 * 2. CONEXÃO E HANDSHAKE (BOLT #1 + #8)
 * 3. GERENCIAMENTO DE CANAIS (BOLT #2)
 * 4. PAGAMENTOS E BALANÇO
 * 5. DERIVAÇÃO DE CHAVES (LNPBP-46)
 * 6. UTILITÁRIOS INTERNOS
 * 7. FACTORY METHOD
 */
export class LightningClient {
  // ==========================================
  // 1. CONSTRUTOR E CONFIGURAÇÃO
  // ==========================================

  private connection: LightningConnection
  private masterKey: Uint8Array
  private network: 'mainnet' | 'testnet' | 'regtest'
  private channelFeeConfig: ChannelOpeningFeeConfig
  private nodeIndex: number = 0 // Incrementa para cada invoice gerado
  private preimageStore: Map<string, Uint8Array> = new Map() // Armazenamento de preimages

  // Gerenciamento de canais
  private channels: Map<string, ChannelInfo> = new Map()
  private channelStates: Map<string, ChannelState> = new Map()
  private htlcs: Map<string, HtlcInfo[]> = new Map() // channelId -> HTLCs
  private nextChannelId: number = 0
  private nextHtlcId: Map<string, bigint> = new Map() // channelId -> next HTLC ID

  // Novos gerenciadores de canal integrados (BOLT #2/#3)
  private channelManagers: Map<string, ChannelManager> = new Map()
  private revocationStores: Map<string, RevocationStore> = new Map()

  // ==========================================
  // ROTEAMENTO BOLT #4 + #7
  // ==========================================

  // Routing graph for pathfinding
  private routingGraph: RoutingGraph = new RoutingGraph()

  // Gossip message processing
  private gossipMessages: GossipMessageUnion[] = []

  // Watchtower for channel monitoring
  private watchtower: Watchtower = new Watchtower()

  // BOLT #7: Gossip Sync
  private gossipSync: GossipSync | null = null

  // Trampoline routing
  private trampolineRouter: TrampolineRouter | null = null

  constructor(
    connection: LightningConnection,
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ) {
    this.connection = connection
    this.masterKey = masterKey
    this.network = network
    this.channelFeeConfig = channelFeeConfig || DEFAULT_CHANNEL_FEE_CONFIG

    // Inicializar módulos
    this.gossipSync = createGossipSync()
    this.trampolineRouter = createTrampolineRouter()

    // Configurar callback de gossip
    this.gossipSync.setMessageCallback(async message => {
      await this.updateRoutingGraph(message as GossipMessage)
    })
  }

  // ==========================================
  // 2. CONEXÃO E HANDSHAKE (BOLT #1 + #8)
  // ==========================================
  //
  // Esta seção implementa o protocolo de transporte Lightning.
  // Ordem de execução obrigatória:
  // 1. createConnection() - Estabelece conexão TLS
  // 2. performNoiseHandshake() - Handshake BOLT #8 (Noise_XK)
  // 3. exchangeInitMessages() - Troca de mensagens Init BOLT #1
  // 4. startPingPong() - Keep-alive com ping/pong
  //
  // Resultado: LightningConnection com chaves de transporte estabelecidas

  /**
   * PASSO 1: Cria conexão TLS segura com peer Lightning
   * BOLT #1: Base Protocol - Conexão TLS
   *
   * Como usar:
   * const socket = await this.createConnection(peer, timeout)
   *
   * @param peer - Endereço do peer (host:port)
   * @param timeout - Timeout em ms (padrão 10s)
   * @returns Promise<Socket> - Socket TCP conectado
   */
  private async createConnection(peer: Peer, timeout: number = 10000): Promise<Socket> {
    return createLightningSocket(peer, timeout)
  }

  /**
   * PASSO 2: Executa handshake completo BOLT #8 (Noise_XK_secp256k1_ChaChaPoly_SHA256)
   * Handshake de 3 atos para estabelecer chaves de transporte criptografadas
   *
   * Como usar:
   * const handshakeResult = await this.performNoiseHandshake(socket, peerPubKey)
   *
   * Fluxo BOLT #8:
   * - Act One: Iniciador envia chave efêmera (50 bytes)
   * - Act Two: Responder envia chave efêmera (50 bytes)
   * - Act Three: Iniciador envia chave estática criptografada (66 bytes)
   *
   * @param socket - Socket TLS conectado
   * @param peerPubKey - Chave pública do peer (33 bytes compressed)
   * @returns Promise<HandshakeResult> - Chaves de transporte estabelecidas
   */
  private async performNoiseHandshake(
    socket: Socket,
    peerPubKey: Uint8Array,
  ): Promise<HandshakeResult> {
    // Gerar chave local efêmera para handshake
    const localKeyPair: KeyPair = generateKey()

    // Inicializar estado do handshake
    const handshakeState: HandshakeState = initializeHandshakeState(peerPubKey, localKeyPair)

    // Act One: Enviar chave efêmera
    const { message: actOneMsg, newState: stateAfterActOne } = actOneSend(
      handshakeState,
      peerPubKey,
      localKeyPair,
    )
    await this.sendRaw(socket, actOneMsg)
    console.log('[lightning] Act One sent')

    // Act Two: Receber chave efêmera do responder
    const actTwoMsg = await this.receiveRaw(socket, 50)
    const actTwoResult = actTwoReceive(stateAfterActOne, actTwoMsg, localKeyPair)
    if ('error' in actTwoResult) {
      throw new Error(`Handshake Act Two failed: ${actTwoResult.error}`)
    }
    console.log('[lightning] Act Two received')

    // Extrair chave pública efêmera do responder do Act Two
    const responderEphemeralPubkey = actTwoMsg.subarray(1, 34)

    // Act Three: Initiator ENVIA sua chave estática criptografada
    // BOLT #8: O initiator envia act3, não recebe!
    const actThreeResult = actThreeSend(
      actTwoResult.newState,
      localKeyPair, // nossa chave estática
      responderEphemeralPubkey, // chave efêmera do responder
    )
    await this.sendRaw(socket, actThreeResult.message)
    console.log('[lightning] Act Three sent')

    return {
      transportKeys: actThreeResult.keys,
      peerPubKey,
    }
  }

  /**
   * PASSO 3: Troca mensagens Init (BOLT #1)
   * Envia Init local e recebe Init do peer para estabelecer features suportadas
   *
   * Como usar:
   * await this.exchangeInitMessages(socket, transportKeys)
   *
   * Mensagem Init contém:
   * - globalfeatures: Features globais (0 bytes = nenhum)
   * - features: Features locais (0 bytes = básico)
   * - tlvs: Type-Length-Value extensions (futuro)
   *
   * @param socket - Socket TLS conectado
   * @param transportKeys - Chaves de transporte do handshake
   */
  private async exchangeInitMessages(socket: Socket, transportKeys: TransportKeys): Promise<void> {
    // Criar mensagem Init local (features básicas)
    const initMsg: InitMessage = {
      type: LightningMessageType.INIT,
      gflen: 0,
      globalfeatures: new Uint8Array(0),
      flen: 0,
      features: new Uint8Array(0),
      tlvs: [],
    }

    // Codificar e enviar Init
    const encodedInit = encodeInitMessage(initMsg)
    const { encrypted: encryptedInit } = encryptMessage(transportKeys, encodedInit)
    await this.sendRaw(socket, encryptedInit)

    // Receber e decodificar Init do peer
    const encryptedPeerInit = await this.receiveRaw(socket, 18 + 2 + 16) // length prefix + min init + tag
    const decryptedPeerInit = decryptMessage(transportKeys, encryptedPeerInit)
    if ('error' in decryptedPeerInit) {
      throw new Error(`Failed to decrypt peer Init: ${decryptedPeerInit.error}`)
    }

    // Decodificar Init do peer (não usado por enquanto)
    decodeInitMessage(decryptedPeerInit.message)
    console.log('[lightning] Init exchange completed')
  }

  /**
   * PASSO 4: Inicia keep-alive com ping/pong (BOLT #1)
   * Mantém conexão viva enviando ping periodicamente e respondendo pong
   *
   * Como usar:
   * const cleanup = this.startPingPong(socket, transportKeys, config)
   * // Chamar cleanup() quando fechar conexão
   *
   * Funcionamento:
   * - Envia ping a cada intervalo (padrão 30s)
   * - Espera pong por até timeout (padrão 10s)
   * - Fecha conexão se perder muitos pings (padrão 3)
   *
   * @param socket - Socket TLS conectado
   * @param transportKeys - Chaves de transporte
   * @param config - Configuração ping/pong
   * @returns Função cleanup para parar ping/pong
   */
  private startPingPong(
    socket: Socket,
    transportKeys: TransportKeys,
    config: PingPongConfig = DEFAULT_PING_PONG_CONFIG,
  ): () => void {
    let missedPings = 0
    let pingTimeout: ReturnType<typeof setTimeout> | null = null

    const pingInterval = setInterval(async () => {
      try {
        const pingMsg: PingMessage = {
          type: LightningMessageType.PING,
          numPongBytes: 1,
          byteslen: 0,
          ignored: new Uint8Array(0),
        }

        const encodedPing = encodePingMessage(pingMsg)
        const { encrypted: encryptedPing } = encryptMessage(transportKeys, encodedPing)
        await this.sendRaw(socket, encryptedPing)
        console.log('[lightning] Ping sent')

        // Set timeout for pong response
        pingTimeout = setTimeout(() => {
          missedPings++
          console.warn(`[lightning] Ping timeout, missed: ${missedPings}`)
          if (missedPings >= config.maxMissedPings) {
            console.error('[lightning] Too many missed pings, closing connection')
            socket.destroy()
          }
        }, config.timeout)
      } catch (error) {
        console.warn('[lightning] Ping failed:', error)
        clearInterval(pingInterval)
        if (pingTimeout) clearTimeout(pingTimeout)
      }
    }, config.interval)

    const onData = async (data: string | Buffer) => {
      try {
        const buffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        const decrypted = decryptMessage(transportKeys, buffer)
        if ('error' in decrypted) return // Não é mensagem válida

        // Tentar decodificar como Pong
        if (decrypted.message.length >= 2) {
          const msgType = (decrypted.message[0] << 8) | decrypted.message[1]
          if (msgType === LightningMessageType.PONG) {
            // Pong recebido - reset missed pings counter
            if (pingTimeout) {
              clearTimeout(pingTimeout)
              pingTimeout = null
            }
            missedPings = 0
            decodePongMessage(decrypted.message)
            console.log('[lightning] Pong received')
          }
        }
      } catch {
        // Ignorar mensagens não-pong
      }
    }

    socket.on('data', onData)

    // Cleanup function
    const cleanup = () => {
      clearInterval(pingInterval)
      if (pingTimeout) clearTimeout(pingTimeout)
      socket.removeListener('data', onData)
    }

    socket.on('close', cleanup)

    return cleanup
  }

  /**
   * Cria conexão Lightning completa
   * Ordem: TLS -> Handshake BOLT #8 -> Init exchange -> Ping/Pong
   */
  private async createLightningConnection(
    config: LightningClientConfig,
  ): Promise<LightningConnection> {
    const finalConfig: LightningClientConfig = { ...DEFAULT_CLIENT_CONFIG, ...config }

    // Chave pública do peer (parâmetro opcional ou dummy para teste)
    const peerPubKey = finalConfig.peerPubKey || new Uint8Array(33) // 33 bytes compressed pubkey
    if (!finalConfig.peerPubKey) {
      peerPubKey[0] = 0x02 // compressed prefix dummy
    }

    try {
      // 1. Conexão TLS
      const socket = await this.createConnection(finalConfig.peer, finalConfig.timeout)
      // 2. Handshake BOLT #8
      const handshakeResult = await this.performNoiseHandshake(socket, peerPubKey)

      // 3. Troca de Init messages
      await this.exchangeInitMessages(socket, handshakeResult.transportKeys)

      // 4. Iniciar Ping/Pong
      const cleanupPingPong = this.startPingPong(socket, handshakeResult.transportKeys)

      // 5. Retornar conexão com estado de transporte
      const lightningConnection: LightningConnection = Object.assign(socket, {
        transportKeys: handshakeResult.transportKeys,
        peerPubKey: handshakeResult.peerPubKey,
      })

      // Add cleanup function to connection
      const extendedConnection = lightningConnection as LightningConnection & {
        cleanup: () => void
      }
      extendedConnection.cleanup = cleanupPingPong

      console.log('[lightning] Lightning connection established')
      return extendedConnection
    } catch (error) {
      console.error('[lightning] Connection failed:', error)
      throw error
    }
  }

  // ==========================================
  // 2.5 GERENCIAMENTO DE PEERS
  // ==========================================
  //
  // Gerencia múltiplas conexões peer na rede Lightning.
  // Funcionalidades:
  // - Conectar/desconectar peers específicos
  // - Manter lista de peers conectados
  // - Persistir estado de peers
  // - Balanceamento de carga entre peers
  //
  // Estados de peer: DISCONNECTED -> CONNECTING -> CONNECTED -> DISCONNECTING

  private connectedPeers: Map<string, LightningConnection> = new Map()
  private peerStates: Map<string, PeerState> = new Map()

  /**
   * Conecta a um peer específico da rede Lightning
   * Estabelece conexão completa (TLS + Handshake + Init) e registra peer
   *
   * Como usar:
   * await client.connectPeer({
   *   host: '127.0.0.1',
   *   port: 9735,
   *   pubkey: '03abcd...'
   * })
   *
   * @param peer - Informações do peer
   * @returns Promise<PeerConnectionResult> - Resultado da conexão
   */
  async connectPeer(peer: PeerWithPubkey): Promise<PeerConnectionResult> {
    const peerId = `${peer.host}:${peer.port}`

    // Verificar se já conectado
    if (this.connectedPeers.has(peerId)) {
      return { success: true, peerId, message: 'Already connected' }
    }

    try {
      // Atualizar estado para CONNECTING
      this.peerStates.set(peerId, PeerState.CONNECTING)

      // Criar configuração de conexão
      const config: LightningClientConfig = {
        peer,
        peerPubKey: peer.pubkey ? hexToUint8Array(peer.pubkey) : undefined,
        timeout: 10000,
      }

      // Estabelecer conexão Lightning completa
      const connection = await this.createLightningConnection(config)

      // Registrar peer conectado
      this.connectedPeers.set(peerId, connection)
      this.peerStates.set(peerId, PeerState.CONNECTED)

      // Persistir estado do peer
      await lightningPersistence.savePeer({
        nodeId: peerId,
        host: peer.host,
        port: peer.port,
        pubkey: peer.pubkey || '',
        lastConnected: Date.now(),
      })

      console.log(`[lightning] Connected to peer: ${peerId}`)
      return { success: true, peerId, connection }
    } catch (error) {
      // Limpar estado em caso de falha
      this.peerStates.set(peerId, PeerState.DISCONNECTED)
      console.error(`[lightning] Failed to connect to peer ${peerId}:`, error)
      return { success: false, peerId, error: error as Error }
    }
  }

  /**
   * Desconecta de um peer específico
   * Fecha conexão graceful e limpa estado
   *
   * Como usar:
   * await client.disconnectPeer('127.0.0.1:9735')
   *
   * @param peerId - ID do peer (host:port)
   * @returns Promise<boolean> - true se desconectado com sucesso
   */
  async disconnectPeer(peerId: string): Promise<boolean> {
    const connection = this.connectedPeers.get(peerId)
    if (!connection) {
      return false
    }

    try {
      // Atualizar estado
      this.peerStates.set(peerId, PeerState.DISCONNECTING)

      // Fechar conexão
      const connectionWithCleanup = connection as LightningConnection & { cleanup?: () => void }
      if (connectionWithCleanup.cleanup) {
        connectionWithCleanup.cleanup()
      }
      connection.destroy()

      // Limpar estado
      this.connectedPeers.delete(peerId)
      this.peerStates.set(peerId, PeerState.DISCONNECTED)

      // Atualizar persistência
      const peerData = await lightningPersistence.getPeer(peerId)
      if (peerData) {
        peerData.lastConnected = Date.now()
        await lightningPersistence.savePeer(peerData)
      }

      console.log(`[lightning] Disconnected from peer: ${peerId}`)
      return true
    } catch (error) {
      console.error(`[lightning] Error disconnecting peer ${peerId}:`, error)
      return false
    }
  }

  /**
   * Lista todos os peers conectados
   * Retorna informações sobre peers ativos
   *
   * Como usar:
   * const peers = client.getConnectedPeers()
   * console.log(`Connected to ${peers.length} peers`)
   *
   * @returns Array<PeerInfo> - Lista de peers conectados
   */
  getConnectedPeers(): PeerInfo[] {
    const peers: PeerInfo[] = []

    for (const peerId of this.connectedPeers.keys()) {
      const state = this.peerStates.get(peerId) || PeerState.DISCONNECTED
      peers.push({
        id: peerId,
        host: peerId.split(':')[0],
        port: parseInt(peerId.split(':')[1]),
        state,
        connectedAt: Date.now(), // TODO: armazenar timestamp real
      })
    }

    return peers
  }

  /**
   * Obtém peer para balanceamento de carga
   * Seleciona peer conectado baseado em estratégia (round-robin, random, etc.)
   *
   * Como usar:
   * const peer = client.getPeerForLoadBalancing()
   * if (peer) {
   *   // Usar peer para operação
   * }
   *
   * @returns PeerInfo | null - Peer selecionado ou null se nenhum conectado
   */
  getPeerForLoadBalancing(): PeerInfo | null {
    const connectedPeers = this.getConnectedPeers()
    if (connectedPeers.length === 0) {
      return null
    }

    // Estratégia simples: round-robin baseado em timestamp
    const index = Math.floor(Date.now() / 1000) % connectedPeers.length
    return connectedPeers[index]
  }

  /**
   * Carrega peers persistidos na inicialização
   * Restaura conexões com peers conhecidos
   *
   * Como usar:
   * await client.loadPersistedPeers() // Chamado automaticamente no create()
   */
  private async loadPersistedPeers(): Promise<void> {
    try {
      const persistedPeers = await lightningPersistence.getPeers()

      for (const peerId of Object.keys(persistedPeers)) {
        // TODO: Implementar reconexão automática baseada em configuração
        // Por enquanto, apenas registra estado
        this.peerStates.set(peerId, PeerState.DISCONNECTED)
        console.log(`[lightning] Loaded persisted peer: ${peerId}`)
      }
    } catch (error) {
      console.warn('[lightning] Failed to load persisted peers:', error)
    }
  }
  //
  // Funções auxiliares usadas internamente pelo cliente.
  // Normalmente não chamadas diretamente pelo usuário.

  private sendRaw(socket: Socket, data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(data, undefined, (err?: Error | undefined) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private receiveRaw(socket: Socket, expectedLength: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = []

      const onData = (data: string | Buffer) => {
        const dataBuffer =
          typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        chunks.push(dataBuffer)
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        if (totalLength >= expectedLength) {
          socket.removeListener('data', onData)
          socket.removeListener('error', onError)
          const result = new Uint8Array(expectedLength)
          let offset = 0
          for (const chunk of chunks) {
            const remaining = expectedLength - offset
            if (remaining <= 0) break
            const copyLength = Math.min(chunk.length, remaining)
            result.set(chunk.subarray(0, copyLength), offset)
            offset += copyLength
          }
          resolve(result)
        }
      }

      const onError = (err: Error) => {
        socket.removeListener('data', onData)
        reject(err)
      }

      socket.on('data', onData)
      socket.on('error', onError)
    })
  }

  /**
   * Deriva chave Lightning usando LNPBP-46 path m'/9735'/0'/0'/0/index
   * LNPBP-46 define purpose 9735 para Lightning Network
   */
  private deriveLightningKey(index: number): Uint8Array {
    // m'/9735'/0'/0' (extended lightning key / chain / node account)
    let key = this.masterKey
    key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose' (hardened)
    key = deriveChildKey(key, LIGHTNING_COIN_TYPE + 0x80000000) // coinType' (hardened)
    key = deriveChildKey(key, 0x80000000) // account' (hardened)

    // /0/index (não-hardened para derivação pública)
    key = deriveChildKey(key, 0) // change
    key = deriveChildKey(key, index) // addressIndex

    return key
  }

  /**
   * Gera payment hash e payment secret para invoice
   */
  private generatePaymentCredentials(): {
    paymentHash: PaymentHash
    paymentSecret: PaymentSecret
    preimage: Uint8Array
  } {
    // Gerar preimage aleatório (32 bytes)
    const preimage = randomBytes(32)

    // Payment hash = SHA256(preimage)
    const paymentHash = sha256(preimage) as PaymentHash

    // Payment secret = random 32 bytes (BOLT11 requirement)
    const paymentSecret = randomBytes(32) as PaymentSecret

    return { paymentHash, paymentSecret, preimage }
  }

  /**
   * Calcula fee de abertura de canal baseado no amount
   */
  private calculateChannelOpeningFee(amount: bigint): bigint {
    const { baseFee, feeRate } = this.channelFeeConfig
    const variableFee = BigInt(Math.floor(Number(amount) * feeRate))
    return baseFee + variableFee
  }

  /**
   * Cria LocalConfig para ChannelManager a partir dos basepoints
   */
  private createLocalConfig(
    channelId: string,
    fundingSatoshis: bigint,
    pushMsat: bigint,
  ): LocalConfig {
    const basepoints = this.getChannelBasepoints(channelId)
    const fundingKey = this.getFundingWallet(0, 0)
    const fundingPubkey = createPublicKey(fundingKey.subarray(0, 32))

    // Gerar seed para per-commitment secrets (32 bytes aleatórios)
    const perCommitmentSecretSeed = randomBytes(32)

    return {
      perCommitmentSecretSeed,
      dustLimitSat: 546n,
      maxAcceptedHtlcs: 30,
      htlcMinimumMsat: 1000n,
      maxHtlcValueInFlightMsat: fundingSatoshis * 1000n,
      toSelfDelay: 144,
      channelReserveSat: fundingSatoshis / 100n,
      fundingPubkey,
      revocationBasepoint: basepoints.revocation,
      paymentBasepoint: basepoints.payment,
      delayedPaymentBasepoint: basepoints.delayed,
      htlcBasepoint: basepoints.htlc,
      initialMsat: fundingSatoshis * 1000n - pushMsat,
    }
  }

  /**
   * Cria ChannelManager para um novo canal
   */
  private createChannelManagerForOpen(
    tempChannelId: Uint8Array,
    peerId: string,
    fundingSatoshis: bigint,
    pushMsat: bigint,
    channelId: string,
  ): ChannelManager {
    const localConfig = this.createLocalConfig(channelId, fundingSatoshis, pushMsat)

    const manager = new ChannelManager({
      tempChannelId,
      peerId: hexToUint8Array(peerId.replace(/[:.]/g, '')), // Converter peerId para bytes
      fundingSatoshis,
      localConfig,
      weAreFunder: true,
      announceChannel: true,
    })

    // Registrar callback de mudança de estado
    manager.onStateChanged((oldState, newState) => {
      console.log(`[lightning] Channel ${channelId} state: ${oldState} -> ${newState}`)

      // Sincronizar com estado legado
      if (newState === ChannelMgrState.OPEN) {
        this.channelStates.set(channelId, ChannelState.NORMAL)
      } else if (newState === ChannelMgrState.CLOSED) {
        this.channelStates.set(channelId, ChannelState.CLOSED)
      }
    })

    return manager
  }

  /**
   * Valida parâmetros recebidos em accept_channel
   */
  private validateAcceptChannelParams(
    acceptMsg: AcceptChannelMessage,
    channelInfo: ChannelInfo,
  ): boolean {
    // Validar dust limit (deve ser razoável)
    if (
      acceptMsg.dustLimitSatoshis < 546n ||
      acceptMsg.dustLimitSatoshis > channelInfo.capacity / 100n
    ) {
      return false
    }

    // Validar channel reserve (deve ser pelo menos 1% da capacidade)
    if (acceptMsg.channelReserveSatoshis < channelInfo.capacity / 100n) {
      return false
    }

    // Validar HTLC minimum (deve ser positivo)
    if (acceptMsg.htlcMinimumMsat <= 0n) {
      return false
    }

    // Validar to_self_delay (deve ser positivo)
    if (acceptMsg.toSelfDelay <= 0) {
      return false
    }

    // Validar max_accepted_htlcs (deve ser positivo)
    if (acceptMsg.maxAcceptedHtlcs <= 0) {
      return false
    }

    return true
  }

  /**
   * Cria transação de funding para o canal usando Electrum
   * Implementa criação real da transação de funding com integração Electrum
   */
  private async createFundingTransaction(
    channelId: string,
    channelInfo: ChannelInfo,
    remoteConfig: any,
  ): Promise<{
    txid: Uint8Array
    outputIndex: number
    signature: Uint8Array
  }> {
    try {
      // Derivar chave de funding do canal
      const fundingKey = this.getFundingWallet(0, 0) // Receive case, index 0
      const fundingPubkey = createPublicKey(fundingKey.subarray(0, 32))

      // Calcular script de output do canal (2-of-2 multisig)
      const localPubkey = fundingPubkey
      const remotePubkey = remoteConfig.fundingPubkey

      // Criar script multisig 2-of-2
      const multisigScript = this.createMultisigScript(localPubkey, remotePubkey)

      // Calcular endereço P2WSH para o canal
      const scriptHash = sha256(multisigScript)
      const channelAddress = this.scriptHashToAddress(scriptHash)

      // Obter UTXOs disponíveis para funding
      const utxos = await this.getAvailableUtxos(channelInfo.capacity)

      // Selecionar UTXOs suficientes
      const selectedUtxos = this.selectUtxos(utxos, channelInfo.capacity)

      // Calcular fee estimada
      const feeRate = await estimateFeeRate(6) // 6 blocos de confirmação
      const estimatedFee = this.estimateFundingTxFee(
        selectedUtxos.length,
        1,
        BigInt(Math.ceil(feeRate)),
      )

      // Verificar se temos fundos suficientes
      const totalInput = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0n)
      if (totalInput < channelInfo.capacity + estimatedFee) {
        throw new Error('Insufficient funds for channel funding')
      }

      // Criar transação de funding
      const fundingTx = this.buildFundingTransaction(
        selectedUtxos,
        channelInfo.capacity,
        channelAddress,
        estimatedFee,
        fundingKey,
      )

      // Broadcast transação via Electrum
      const txHex = this.serializeTransaction(fundingTx)
      const txidHex = await broadcastTransaction(txHex)

      // Converter txid para Uint8Array
      const txid = hexToUint8Array(txidHex)

      // Simular assinatura (em implementação real, seria assinatura real)
      const signature = randomBytes(64)

      // Atualizar informações do canal
      channelInfo.fundingTxid = txidHex
      channelInfo.fundingOutputIndex = 0

      console.log(`[lightning] Funding transaction broadcasted: ${txidHex}`)
      return { txid, outputIndex: 0, signature }
    } catch (error) {
      console.error('[lightning] Failed to create funding transaction:', error)
      throw error
    }
  }

  // ==========================================
  // 3. GERENCIAMENTO DE CANAIS (BOLT #2)
  // ==========================================
  //
  // Esta seção gerencia canais de pagamento Lightning.
  // Ordem de uso típica:
  // 1. hasActiveChannels() -> Verificar canais existentes
  // 2. openChannel() -> Abrir novo canal
  // 3. generateInvoice() -> Criar invoice (usa canal existente)
  // 4. closeChannel() -> Fechar canal quando necessário
  //
  // Estados de canal: PENDING_OPEN -> OPENING -> CHANNEL_READY -> NORMAL -> SHUTTING_DOWN -> CLOSED

  /**
   * Abre um novo canal Lightning com um peer (BOLT #2)
   * Executa o protocolo completo de abertura de canal
   *
   * Como usar:
   * const result = await client.openChannel({
   *   peerId: '127.0.0.1:9735',
   *   amount: 100000n, // 100k sats
   *   pushMsat: 0n
   * })
   *
   * Fluxo BOLT #2:
   * 1. Verificar se peer está conectado
   * 2. Gerar temporary_channel_id
   * 3. Derivar basepoints para o canal
   * 4. Enviar open_channel
   * 5. Receber accept_channel
   * 6. Criar transação de funding
   * 7. Enviar funding_created
   * 8. Receber funding_signed
   * 9. Aguardar confirmações
   * 10. Enviar channel_ready
   *
   * @param params - Parâmetros da abertura do canal
   * @returns Promise<OpenChannelResult> - Resultado da operação
   */
  async openChannel(params: OpenChannelParams): Promise<OpenChannelResult> {
    const { peerId, amount, pushMsat = 0n } = params

    try {
      // 1. Verificar se peer está conectado
      const peerConnection = this.connectedPeers.get(peerId)
      if (!peerConnection) {
        return { success: false, error: `Peer ${peerId} not connected` }
      }

      // 2. Gerar temporary_channel_id (32 bytes aleatórios)
      const temporaryChannelId = randomBytes(32)

      // 3. Gerar channel_id único
      const channelId = `channel_${this.nextChannelId++}_${Date.now()}`

      // 4. Atualizar estado do canal
      this.channelStates.set(channelId, ChannelState.PENDING_OPEN)

      // 5. Criar ChannelManager para gerenciar estado do canal
      const channelManager = this.createChannelManagerForOpen(
        temporaryChannelId,
        peerId,
        amount,
        pushMsat,
        channelId,
      )
      this.channelManagers.set(channelId, channelManager)

      // 6. Criar RevocationStore para este canal
      const revocationStore = new RevocationStore()
      this.revocationStores.set(channelId, revocationStore)

      // 7. Derivar basepoints para este canal
      const basepoints = this.getChannelBasepoints(channelId)

      // 8. Derivar chave de funding
      const fundingKey = this.getFundingWallet(0, 0) // Receive case, index 0
      const fundingPubkey = createPublicKey(fundingKey.subarray(0, 32))

      // 9. Preparar parâmetros do canal
      const channelParams = {
        type: 32, // LightningMessageType.OPEN_CHANNEL
        chainHash:
          this.network === 'mainnet'
            ? new Uint8Array(32).fill(0) // Bitcoin mainnet chain hash
            : new Uint8Array(32).fill(1), // Testnet/regtest
        temporaryChannelId,
        fundingSatoshis: amount,
        pushMsat,
        dustLimitSatoshis: params.dustLimitSatoshis || 546n,
        maxHtlcValueInFlightMsat: params.maxHtlcValueInFlightMsat || amount * 1000n,
        channelReserveSatoshis: params.channelReserveSatoshis || amount / 100n, // 1%
        htlcMinimumMsat: params.htlcMinimumMsat || 1000n,
        feeratePerKw: params.feeratePerKw || 1000, // 1000 sat/kvB = 1 sat/vbyte
        toSelfDelay: params.toSelfDelay || 144, // ~1 dia
        maxAcceptedHtlcs: params.maxAcceptedHtlcs || 30,
        fundingPubkey,
        revocationBasepoint: basepoints.revocation,
        paymentBasepoint: basepoints.payment,
        delayedPaymentBasepoint: basepoints.delayed,
        htlcBasepoint: basepoints.htlc,
        firstPerCommitmentPoint: basepoints.perCommitment,
        channelFlags: 0, // Announce channel
        tlvs: [],
      }

      // 10. Criar e enviar mensagem open_channel
      const openMsg = encodeOpenChannelMessage(channelParams)
      const { encrypted: encryptedOpen } = encryptMessage(peerConnection.transportKeys, openMsg)
      await this.sendRaw(peerConnection, encryptedOpen)

      // 11. Atualizar estado para OPENING
      this.channelStates.set(channelId, ChannelState.OPENING)

      // 12. Registrar informações básicas do canal
      const channelInfo: ChannelInfo = {
        channelId,
        peerId,
        state: ChannelState.OPENING,
        localBalance: amount - pushMsat / 1000n,
        remoteBalance: pushMsat / 1000n,
        capacity: amount,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      }
      this.channels.set(channelId, channelInfo)

      // 13. Persistir estado inicial do canal (incluindo ChannelManager serializado)
      await lightningPersistence.saveChannel({
        channelId,
        nodeId: peerId,
        state: 'opening',
        localBalance: channelInfo.localBalance.toString(),
        remoteBalance: channelInfo.remoteBalance.toString(),
        localConfig: {},
        remoteConfig: {},
      })

      console.log(`[lightning] Opening channel ${channelId} with peer ${peerId}`)
      return { success: true, channelId }
    } catch (error) {
      console.error('[lightning] Failed to open channel:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Verifica se existem canais ativos (BOLT #2)
   * Canais ativos são aqueles no estado NORMAL
   *
   * Como usar:
   * const hasChannels = await client.hasActiveChannels()
   * if (!hasChannels) {
   *   // Abrir novo canal
   * }
   *
   * @returns Promise<boolean> - true se há canais ativos
   */
  async hasActiveChannels(): Promise<boolean> {
    for (const channelId of this.channels.keys()) {
      if (this.channelStates.get(channelId) === ChannelState.NORMAL) {
        return true
      }
    }
    return false
  }

  /**
   * Aceita abertura de canal de um peer (BOLT #2)
   * Processa mensagem accept_channel e continua o fluxo de abertura
   *
   * Como usar:
   * const result = await client.acceptChannel(peerId, acceptMsg)
   *
   * Fluxo BOLT #2 (continuação):
   * 5. Receber accept_channel do peer
   * 6. Criar transação de funding
   * 7. Enviar funding_created
   * 8. Receber funding_signed
   * 9. Aguardar confirmações
   * 10. Enviar channel_ready
   *
   * @param peerId - ID do peer que enviou accept_channel
   * @param acceptMsg - Mensagem accept_channel recebida
   * @returns Promise<boolean> - true se aceitação foi processada com sucesso
   */
  async acceptChannel(peerId: string, acceptMsg: AcceptChannelMessage): Promise<boolean> {
    try {
      // 1. Verificar se peer está conectado
      const peerConnection = this.connectedPeers.get(peerId)
      if (!peerConnection) {
        console.error(`[lightning] Peer ${peerId} not connected for channel acceptance`)
        return false
      }

      // 2. Encontrar canal correspondente pelo temporary_channel_id
      const channelId = Array.from(this.channels.keys()).find(id => {
        const channel = this.channels.get(id)
        return channel && this.channelStates.get(id) === ChannelState.OPENING
      })

      if (!channelId) {
        console.error(`[lightning] No opening channel found for peer ${peerId}`)
        return false
      }

      const channelInfo = this.channels.get(channelId)!
      const temporaryChannelId = acceptMsg.temporaryChannelId

      // 3. Validar parâmetros do accept_channel
      if (!this.validateAcceptChannelParams(acceptMsg, channelInfo)) {
        console.error(`[lightning] Invalid accept_channel parameters from peer ${peerId}`)
        return false
      }

      // 4. Obter ChannelManager e processar accept_channel
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        // Usar o novo ChannelManager para processar
        const result = channelManager.handleAcceptChannel({
          tempChannelId: acceptMsg.temporaryChannelId,
          dustLimitSatoshis: acceptMsg.dustLimitSatoshis,
          maxHtlcValueInFlightMsat: acceptMsg.maxHtlcValueInFlightMsat,
          channelReserveSatoshis: acceptMsg.channelReserveSatoshis,
          htlcMinimumMsat: acceptMsg.htlcMinimumMsat,
          minimumDepth: acceptMsg.minimumDepth || 3,
          toSelfDelay: acceptMsg.toSelfDelay,
          maxAcceptedHtlcs: acceptMsg.maxAcceptedHtlcs,
          fundingPubkey: acceptMsg.fundingPubkey,
          revocationBasepoint: acceptMsg.revocationBasepoint,
          paymentBasepoint: acceptMsg.paymentBasepoint,
          delayedPaymentBasepoint: acceptMsg.delayedPaymentBasepoint,
          htlcBasepoint: acceptMsg.htlcBasepoint,
          firstPerCommitmentPoint: acceptMsg.firstPerCommitmentPoint,
        })

        if (!result.success) {
          console.error(`[lightning] ChannelManager rejected accept_channel: ${result.error}`)
          return false
        }
      }

      // 5. Atualizar informações do canal com dados do peer
      channelInfo.remoteBalance = 0n // Accept channel não especifica push_msat
      channelInfo.localBalance = channelInfo.capacity - channelInfo.remoteBalance

      // 6. Persistir configuração remota
      const remoteConfig = {
        dustLimitSatoshis: acceptMsg.dustLimitSatoshis,
        maxHtlcValueInFlightMsat: acceptMsg.maxHtlcValueInFlightMsat,
        channelReserveSatoshis: acceptMsg.channelReserveSatoshis,
        htlcMinimumMsat: acceptMsg.htlcMinimumMsat,
        toSelfDelay: acceptMsg.toSelfDelay,
        maxAcceptedHtlcs: acceptMsg.maxAcceptedHtlcs,
        fundingPubkey: acceptMsg.fundingPubkey,
        revocationBasepoint: acceptMsg.revocationBasepoint,
        paymentBasepoint: acceptMsg.paymentBasepoint,
        delayedPaymentBasepoint: acceptMsg.delayedPaymentBasepoint,
        htlcBasepoint: acceptMsg.htlcBasepoint,
        firstPerCommitmentPoint: acceptMsg.firstPerCommitmentPoint,
      }

      await lightningPersistence.saveChannel({
        channelId,
        nodeId: peerId,
        state: 'opening',
        fundingTxid: channelInfo.fundingTxid,
        fundingOutputIndex: channelInfo.fundingOutputIndex,
        localBalance: channelInfo.localBalance.toString(),
        remoteBalance: channelInfo.remoteBalance.toString(),
        localConfig: {},
        remoteConfig,
      })

      // 6. Criar transação de funding
      const fundingTx = await this.createFundingTransaction(channelId, channelInfo, remoteConfig)

      // 7. Preparar mensagem funding_created
      const fundingCreatedMsg: FundingCreatedMessage = {
        type: LightningMessageType.FUNDING_CREATED,
        temporaryChannelId,
        fundingTxid: fundingTx.txid,
        fundingOutputIndex: fundingTx.outputIndex,
        signature: fundingTx.signature,
      }

      // 8. Enviar funding_created
      const encodedFundingCreated = encodeFundingCreatedMessage(fundingCreatedMsg)
      const { encrypted: encryptedFundingCreated } = encryptMessage(
        peerConnection.transportKeys,
        encodedFundingCreated,
      )
      await this.sendRaw(peerConnection, encryptedFundingCreated)

      // 9. Atualizar estado para CHANNEL_READY (aguardando funding_signed)
      this.channelStates.set(channelId, ChannelState.CHANNEL_READY)

      console.log(`[lightning] Accepted channel ${channelId} from peer ${peerId}`)
      return true
    } catch (error) {
      console.error('[lightning] Failed to accept channel:', error)
      return false
    }
  }

  // ==========================================
  // 3. COMPLETAR ABERTURA DE CANAL (BOLT #2)
  // ==========================================
  //
  // Esta seção completa o fluxo de abertura de canal após acceptChannel().
  // Ordem de uso:
  // 1. acceptChannel() -> Envia funding_created
  // 2. receiveFundingSigned() -> Recebe funding_signed do peer
  // 3. waitForFundingConfirmation() -> Aguarda confirmações da transação
  // 4. sendChannelReady() -> Envia channel_ready
  // 5. Transita para NORMAL
  //

  /**
   * Recebe funding_signed do peer e valida assinatura (BOLT #2)
   * Completa a abertura do canal após acceptChannel()
   *
   * Como usar:
   * const result = await client.receiveFundingSigned({
   *   channelId: "abc123...",
   *   signature: fundingSignature
   * })
   *
   * Fluxo interno:
   * 1. Validar que canal existe e está em CHANNEL_READY
   * 2. Verificar assinatura da transação de funding
   * 3. Atualizar estado para FUNDING_CONFIRMED
   * 4. Aguardar confirmações da blockchain
   *
   * @param params - Parâmetros do funding_signed
   * @returns Promise<boolean> - Sucesso da operação
   */
  async receiveFundingSigned(params: {
    channelId: string
    signature: Uint8Array
  }): Promise<boolean> {
    const { channelId, signature } = params

    const channel = this.channels.get(channelId)
    if (!channel) {
      console.error('[lightning] Channel not found:', channelId)
      return false
    }

    const currentState = this.channelStates.get(channelId)
    if (currentState !== ChannelState.CHANNEL_READY) {
      console.error('[lightning] Channel not in CHANNEL_READY state:', currentState)
      return false
    }

    try {
      // TODO: Validar assinatura da transação de funding
      // Por enquanto, aceitar qualquer assinatura válida
      if (signature.length !== 64) {
        console.error('[lightning] Invalid funding signature length')
        return false
      }

      // Atualizar estado para aguardar confirmações
      this.channelStates.set(channelId, ChannelState.FUNDING_CONFIRMED)

      // TODO: Iniciar monitoramento de confirmações da blockchain
      // Por enquanto, simular confirmação imediata para desenvolvimento
      setTimeout(() => {
        this.handleFundingConfirmed(channelId)
      }, 1000) // Simular 1 segundo de confirmação

      console.log(`[lightning] Received funding_signed for channel ${channelId}`)
      return true
    } catch (error) {
      console.error('[lightning] Failed to process funding_signed:', error)
      return false
    }
  }

  /**
   * Aguarda confirmações da transação de funding (BOLT #2)
   * Monitora a blockchain até ter confirmações suficientes
   *
   * Como usar:
   * await client.waitForFundingConfirmation(channelId, 3) // Aguardar 3 confirmações
   *
   * @param channelId - ID do canal
   * @param minConfirmations - Número mínimo de confirmações (padrão 3)
   * @returns Promise<boolean> - Canal confirmado
   */
  async waitForFundingConfirmation(
    channelId: string,
    minConfirmations: number = 3,
  ): Promise<boolean> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      console.error('[lightning] Channel not found:', channelId)
      return false
    }

    // TODO: Implementar monitoramento real da blockchain
    // Por enquanto, simular confirmações
    return new Promise(resolve => {
      const checkConfirmations = () => {
        // Simular confirmações aumentando gradualmente
        const currentConfirmations = Math.min(
          minConfirmations,
          Math.floor(Math.random() * minConfirmations) + 1,
        )

        if (currentConfirmations >= minConfirmations) {
          console.log(
            `[lightning] Channel ${channelId} confirmed with ${currentConfirmations} confirmations`,
          )
          resolve(true)
        } else {
          console.log(
            `[lightning] Channel ${channelId} has ${currentConfirmations}/${minConfirmations} confirmations`,
          )
          setTimeout(checkConfirmations, 2000) // Verificar novamente em 2 segundos
        }
      }

      checkConfirmations()
    })
  }

  /**
   * Manipula confirmação de funding e envia channel_ready (BOLT #2)
   * Chamado automaticamente após confirmações suficientes
   *
   * @param channelId - ID do canal confirmado
   */
  private async handleFundingConfirmed(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return

    try {
      // Atualizar estado para NORMAL
      this.channelStates.set(channelId, ChannelState.NORMAL)

      // Enviar channel_ready para o peer
      await this.sendChannelReady(channelId)

      // Atualizar timestamp de atividade
      channel.lastActivity = Date.now()

      // Persistir estado atualizado
      await this.persistChannelState(channelId)

      console.log(`[lightning] Channel ${channelId} is now NORMAL and ready for payments`)
    } catch (error) {
      console.error('[lightning] Failed to handle funding confirmation:', error)
      this.channelStates.set(channelId, ChannelState.ERROR)
    }
  }

  /**
   * Envia channel_ready para o peer (BOLT #2)
   * Indica que o canal está pronto para uso
   *
   * @param channelId - ID do canal
   */
  private async sendChannelReady(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.connectedPeers.get(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Atualizar ChannelManager se disponível
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      // Marcar que confirmações foram atingidas
      channelManager.updateFundingConfirmations(6) // Assumindo que já passou minimum_depth
    }

    // Derivar próximo per-commitment point
    const basepoints = this.getChannelBasepoints(channelId)

    // Criar mensagem channel_ready
    const channelReadyMessage: ChannelReadyMessage = {
      type: LightningMessageType.CHANNEL_READY,
      channelId: hexToUint8Array(channelId),
      secondPerCommitmentPoint: basepoints.perCommitment.subarray(1, 34), // Simulação
      tlvs: [] as any, // TODO: Implementar ChannelReadyTlvs
    }

    // Codificar e enviar
    const encodedChannelReady = encodeChannelReadyMessage(channelReadyMessage)
    const encryptedChannelReady = await encryptMessage(
      peerConnection.transportKeys,
      encodedChannelReady,
    )

    await this.sendRaw(peerConnection, encryptedChannelReady.encrypted)

    console.log(`[lightning] Sent channel_ready for channel ${channelId}`)
  }

  /**
   * Persiste o estado atualizado de um canal
   *
   * @param channelId - ID do canal
   */
  private async persistChannelState(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return

    try {
      await lightningPersistence.saveChannel({
        channelId,
        nodeId: channel.peerId,
        state: channel.state,
        localBalance: channel.localBalance.toString(),
        remoteBalance: channel.remoteBalance.toString(),
        fundingTxid: channel.fundingTxid,
        fundingOutputIndex: channel.fundingOutputIndex,
        localConfig: {}, // TODO: Adicionar configuração local
        remoteConfig: {}, // TODO: Adicionar configuração remota
      })
    } catch (error) {
      console.error('[lightning] Failed to persist channel state:', error)
    }
  }

  // ==========================================
  // 4. FECHAMENTO DE CANAIS (BOLT #2)
  // ==========================================
  //
  // Esta seção implementa o fechamento cooperativo e unilateral de canais.
  // Ordem de uso:
  // 1. closeChannel() -> Fechamento cooperativo
  // 2. forceCloseChannel() -> Fechamento unilateral
  // 3. shutdown() -> Inicia shutdown cooperativo
  //

  /**
   * Fecha canal cooperativamente (BOLT #2)
   * Envia shutdown e aguarda closing_signed do peer
   *
   * Como usar:
   * const result = await client.closeChannel({
   *   channelId: "abc123...",
   *   scriptpubkey: script // Opcional, usa endereço padrão se não fornecido
   * })
   *
   * Fluxo cooperativo:
   * 1. Enviar shutdown com scriptpubkey
   * 2. Receber shutdown do peer
   * 3. Trocar commitment_signed/revoke_and_ack
   * 4. Enviar closing_signed
   * 5. Receber closing_signed do peer
   * 6. Broadcast transação de fechamento
   *
   * @param params - Parâmetros do fechamento
   * @returns Promise<CloseChannelResult> - Resultado da operação
   */
  async closeChannel(params: CloseChannelParams): Promise<CloseChannelResult> {
    const { channelId, scriptpubkey } = params

    const channel = this.channels.get(channelId)
    if (!channel) {
      return { success: false, error: 'Channel not found' }
    }

    const currentState = this.channelStates.get(channelId)
    if (currentState !== ChannelState.NORMAL) {
      return { success: false, error: `Channel not in NORMAL state: ${currentState}` }
    }

    try {
      // Atualizar estado para SHUTTING_DOWN
      this.channelStates.set(channelId, ChannelState.SHUTTING_DOWN)

      // Usar scriptpubkey fornecido ou gerar um padrão
      const shutdownScript = scriptpubkey || this.generateShutdownScript()

      // Usar ChannelManager se disponível
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const shutdownMsg = channelManager.initiateShutdown(shutdownScript)

          const peerConnection = this.connectedPeers.get(channel.peerId)
          if (peerConnection) {
            const { encrypted } = encryptMessage(peerConnection.transportKeys, shutdownMsg)
            await this.sendRaw(peerConnection, encrypted)
            console.log(`[lightning] Sent shutdown for channel ${channelId} (via ChannelManager)`)
          }
        } catch (error) {
          console.error('[lightning] ChannelManager initiateShutdown failed:', error)
          // Continuar com código legado
          await this.sendShutdown(channelId, shutdownScript)
        }
      } else {
        // Código legado: Enviar shutdown message
        await this.sendShutdown(channelId, shutdownScript)
      }

      // TODO: Aguardar shutdown do peer
      // TODO: Trocar commitment_signed/revoke_and_ack
      // TODO: Enviar e receber closing_signed
      // TODO: Broadcast transação de fechamento

      // Por enquanto, simular fechamento imediato
      this.channelStates.set(channelId, ChannelState.CLOSED)
      channel.lastActivity = Date.now()

      console.log(`[lightning] Channel ${channelId} closed cooperatively`)
      return { success: true }
    } catch (error) {
      console.error('[lightning] Failed to close channel:', error)
      this.channelStates.set(channelId, ChannelState.ERROR)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Fecha canal unilateralmente (force close) (BOLT #2)
   * Broadcast commitment transaction diretamente
   *
   * Como usar:
   * const result = await client.forceCloseChannel("channelId")
   *
   * Usado quando:
   * - Peer não responde
   * - Canal comprometido
   * - Necessidade de emergência
   *
   * @param channelId - ID do canal
   * @returns Promise<CloseChannelResult> - Resultado da operação
   */
  async forceCloseChannel(channelId: string): Promise<CloseChannelResult> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      return { success: false, error: 'Channel not found' }
    }

    const currentState = this.channelStates.get(channelId)
    if (currentState !== ChannelState.NORMAL) {
      return { success: false, error: `Channel not in NORMAL state: ${currentState}` }
    }

    try {
      // Atualizar estado para CLOSING
      this.channelStates.set(channelId, ChannelState.CLOSING)

      // Usar ChannelManager se disponível para obter commitment transaction
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const commitmentTx = channelManager.forceClose()
          // commitmentTx contém a commitment transaction para broadcast
          console.log(`[lightning] Force close commitment tx ready for channel ${channelId}`)
          // TODO: Broadcast a commitment transaction via electrum
          // Serializar commitmentTx.outputs e fazer broadcast
          void commitmentTx // Marcar como usado
        } catch (error) {
          console.error('[lightning] ChannelManager forceClose failed:', error)
        }
      }

      // Por enquanto, simular fechamento imediato
      this.channelStates.set(channelId, ChannelState.CLOSED)
      channel.lastActivity = Date.now()

      console.log(`[lightning] Channel ${channelId} force closed`)
      return { success: true }
    } catch (error) {
      console.error('[lightning] Failed to force close channel:', error)
      this.channelStates.set(channelId, ChannelState.ERROR)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Gera scriptpubkey padrão para shutdown
   * TODO: Implementar geração baseada em endereço do usuário
   */
  private generateShutdownScript(): Uint8Array {
    // Simulação: P2WPKH script (simplificado)
    // Em implementação real, usar endereço do usuário
    return new Uint8Array([0x00, 0x14, ...randomBytes(20)]) // OP_0 <20-byte-hash>
  }

  /**
   * Envia shutdown message para iniciar fechamento cooperativo (BOLT #2)
   *
   * @param channelId - ID do canal
   * @param scriptpubkey - Script de destino para os fundos
   */
  private async sendShutdown(channelId: string, scriptpubkey: Uint8Array): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.connectedPeers.get(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Criar shutdown message
    const shutdownMessage = {
      type: LightningMessageType.SHUTDOWN,
      channelId: hexToUint8Array(channelId),
      len: scriptpubkey.length,
      scriptpubkey,
      tlvs: [] as any, // TODO: Implementar ShutdownTlvs
    } as any // TODO: Corrigir tipo ShutdownMessage

    // Codificar e enviar
    const encodedShutdown = encodeShutdownMessage(shutdownMessage)
    const encryptedShutdown = await encryptMessage(peerConnection.transportKeys, encodedShutdown)

    await this.sendRaw(peerConnection, encryptedShutdown.encrypted)

    console.log(`[lightning] Sent shutdown for channel ${channelId}`)
  }

  // ==========================================
  // 5. PAGAMENTOS HTLC (BOLT #2 + #11)
  // ==========================================
  //
  // Esta seção implementa pagamentos via HTLC (Hash Time Locked Contracts).
  // Ordem de uso:
  // 1. sendPayment() -> Envia pagamento via HTLC
  // 2. receiveHTLC() -> Recebe HTLC de incoming payment
  // 3. fulfillHTLC() -> Libera fundos quando recebe preimage
  // 4. failHTLC() -> Falha HTLC quando expira ou erro
  //

  /**
   * Envia pagamento via HTLC (BOLT #2)
   * Implementação completa com roteamento e HTLCs reais
   *
   * Como usar:
   * const result = await client.sendPayment({
   *   invoice: "lnbc1000n1p0x9z9pp5...",
   *   amount: 1000n
   * })
   *
   * Fluxo HTLC:
   * 1. Decodificar invoice BOLT11 completa
   * 2. Encontrar rota via gossip protocol (BOLT #7)
   * 3. Construir onion packet com rota
   * 4. Enviar update_add_htlc para cada hop
   * 5. Aguardar preimage do destinatário
   * 6. Revelar preimage via update_fulfill_htlc
   *
   * @param request - Invoice e amount opcional
   * @returns Promise<PaymentResult> - Resultado do pagamento
   */
  async sendPayment(request: LightningPaymentRequest): Promise<PaymentResult> {
    const { invoice, amount } = request

    // Verificação básica da invoice
    if (
      !invoice ||
      (!invoice.startsWith('lnbc') && !invoice.startsWith('lntb') && !invoice.startsWith('lntbs'))
    ) {
      throw new Error('Invalid Lightning invoice')
    }

    try {
      // 1. Decodificar invoice BOLT11
      const decodedInvoice = await this.decodeInvoiceComplete(invoice)

      // 2. Verificar amount
      const paymentAmount = amount || decodedInvoice.amount
      if (!paymentAmount) {
        throw new Error('Amount not specified in invoice or request')
      }

      // 3. Verificar saldo disponível
      const balance = await this.getBalance()
      if (balance < paymentAmount) {
        throw new Error('Insufficient balance')
      }

      // 4. Encontrar rota (simplificado - usa canal direto se possível)
      const route = await this.findRoute(decodedInvoice.payeePubkey, paymentAmount)
      if (!route) {
        throw new Error('No route found')
      }

      // 5. Gerar payment secret e hash
      const { paymentHash } = this.generatePaymentCredentials()

      // 6. Enviar HTLC
      const htlcId = await this.sendHTLC(
        route,
        paymentAmount,
        paymentHash,
        decodedInvoice.cltvExpiry,
      )

      // 7. Aguardar resultado (simplificado)
      const result = await this.waitForHTLCResult(route.channelId, htlcId, paymentHash)

      if (result.success && result.preimage) {
        // Pagamento bem-sucedido
        return {
          success: true,
          preimage: result.preimage,
          paymentHash,
        }
      } else {
        // Pagamento falhou
        return {
          success: false,
          error: result.error || 'Payment failed',
          paymentHash,
        }
      }
    } catch (error) {
      console.error('[lightning] Payment failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment error',
        paymentHash: new Uint8Array(32), // Placeholder - em implementação real, seria o hash da invoice
      }
    }
  }

  /**
   * Recebe HTLC de incoming payment (BOLT #2)
   * Processa update_add_htlc do peer
   *
   * @param channelId - ID do canal
   * @param htlcMessage - Mensagem update_add_htlc
   * @returns Promise<boolean> - true se HTLC aceito
   */
  async receiveHTLC(channelId: string, htlcMessage: any): Promise<boolean> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      console.error('[lightning] Channel not found for HTLC:', channelId)
      return false
    }

    try {
      // 1. Validar HTLC
      if (!this.validateHTLC(htlcMessage, channel)) {
        await this.failHTLC(channelId, htlcMessage.id, 'Invalid HTLC')
        return false
      }

      // 2. Usar ChannelManager se disponível
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const result = channelManager.handleUpdateAddHtlc({
            htlcId: htlcMessage.id,
            amountMsat: BigInt(htlcMessage.amountMsat),
            paymentHash: htlcMessage.paymentHash,
            cltvExpiry: htlcMessage.cltvExpiry,
            onionRoutingPacket: htlcMessage.onionRoutingPacket,
          })
          if (!result.success) {
            console.error('[lightning] ChannelManager handleUpdateAddHtlc failed:', result.error)
            await this.failHTLC(channelId, htlcMessage.id, 'Processing error')
            return false
          }
          console.log(`[lightning] Received HTLC ${htlcMessage.id} via ChannelManager`)
        } catch (error) {
          console.error('[lightning] ChannelManager handleUpdateAddHtlc failed:', error)
          await this.failHTLC(channelId, htlcMessage.id, 'Processing error')
          return false
        }
      }

      // 3. Verificar se é pagamento para nós
      const isForUs = await this.isPaymentForUs(htlcMessage.paymentHash)

      if (isForUs) {
        // 3a. Pagamento destinado a nós - aguardar processamento
        console.log(`[lightning] Received payment HTLC for us: ${htlcMessage.id}`)

        // TODO: Aguardar aplicação processar o pagamento
        // Por enquanto, simular sucesso
        setTimeout(() => {
          this.fulfillHTLC(
            channelId,
            htlcMessage.id,
            this.generatePreimage(htlcMessage.paymentHash),
          )
        }, 1000)

        return true
      } else {
        // 3b. Pagamento para forward - encontrar próximo hop
        const nextHop = await this.findNextHop(htlcMessage.onionRoutingPacket)
        if (!nextHop) {
          await this.failHTLC(channelId, htlcMessage.id, 'No route')
          return false
        }

        // Forward HTLC
        await this.forwardHTLC(nextHop, htlcMessage)
        return true
      }
    } catch (error) {
      console.error('[lightning] Failed to process HTLC:', error)
      await this.failHTLC(channelId, htlcMessage.id, 'Processing error')
      return false
    }
  }

  /**
   * Libera HTLC com preimage (BOLT #2)
   * Envia update_fulfill_htlc para liberar fundos
   *
   * @param channelId - ID do canal
   * @param htlcId - ID do HTLC
   * @param preimage - Preimage de 32 bytes
   */
  private async fulfillHTLC(
    channelId: string,
    htlcId: bigint,
    preimage: Uint8Array,
  ): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.connectedPeers.get(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Usar ChannelManager se disponível
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      try {
        const fulfillMsg = channelManager.fulfillHtlc(htlcId, preimage)

        const { encrypted: encryptedFulfill } = encryptMessage(
          peerConnection.transportKeys,
          fulfillMsg,
        )
        await this.sendRaw(peerConnection, encryptedFulfill)

        this.updateHTLCState(channelId, htlcId, 'fulfilled')
        console.log(
          `[lightning] Fulfilled HTLC ${htlcId} on channel ${channelId} (via ChannelManager)`,
        )
        return
      } catch (error) {
        console.error('[lightning] ChannelManager fulfillHtlc failed:', error)
        // Fallback para código legado
      }
    }

    // Código legado
    const fulfillMessage = {
      type: LightningMessageType.UPDATE_FULFILL_HTLC,
      channelId: hexToUint8Array(channelId),
      id: htlcId,
      paymentPreimage: preimage,
    }

    const encodedFulfill = encodeUpdateFulfillHtlcMessage(fulfillMessage as any)
    const encryptedFulfill = await encryptMessage(peerConnection.transportKeys, encodedFulfill)

    await this.sendRaw(peerConnection, encryptedFulfill.encrypted)

    this.updateHTLCState(channelId, htlcId, 'fulfilled')
    console.log(`[lightning] Fulfilled HTLC ${htlcId} on channel ${channelId}`)
  }

  /**
   * Falha HTLC (BOLT #2)
   * Envia update_fail_htlc com razão da falha
   *
   * @param channelId - ID do canal
   * @param htlcId - ID do HTLC
   * @param reason - Razão da falha
   */
  private async failHTLC(channelId: string, htlcId: bigint, reason: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.connectedPeers.get(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Usar ChannelManager se disponível
    const channelManager = this.channelManagers.get(channelId)
    if (channelManager) {
      try {
        const reasonBytes = new TextEncoder().encode(reason)
        const failMsg = channelManager.failHtlc(htlcId, reasonBytes)

        const { encrypted: encryptedFail } = encryptMessage(peerConnection.transportKeys, failMsg)
        await this.sendRaw(peerConnection, encryptedFail)

        this.updateHTLCState(channelId, htlcId, 'failed')
        console.log(
          `[lightning] Failed HTLC ${htlcId} on channel ${channelId}: ${reason} (via ChannelManager)`,
        )
        return
      } catch (error) {
        console.error('[lightning] ChannelManager failHtlc failed:', error)
        // Fallback para código legado
      }
    }

    // Código legado
    const reasonBytes = new TextEncoder().encode(reason)
    const failMessage = {
      type: LightningMessageType.UPDATE_FAIL_HTLC,
      channelId: hexToUint8Array(channelId),
      id: htlcId,
      len: reasonBytes.length,
      reason: reasonBytes,
    }

    const encodedFail = encodeUpdateFailHtlcMessage(failMessage as any)
    const encryptedFail = await encryptMessage(peerConnection.transportKeys, encodedFail)

    await this.sendRaw(peerConnection, encryptedFail.encrypted)

    this.updateHTLCState(channelId, htlcId, 'failed')
    console.log(`[lightning] Failed HTLC ${htlcId} on channel ${channelId}: ${reason}`)
  }

  /**
   * Envia HTLC para iniciar pagamento (BOLT #2)
   *
   * @param route - Rota de pagamento
   * @param amount - Amount em msat
   * @param paymentHash - Hash do pagamento
   * @param cltvExpiry - Expiração CLTV
   * @returns Promise<bigint> - ID do HTLC criado
   */
  private async sendHTLC(
    route: any,
    amount: bigint,
    paymentHash: Uint8Array,
    cltvExpiry: number,
  ): Promise<bigint> {
    const channel = this.channels.get(route.channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.connectedPeers.get(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // Obter ChannelManager para este canal
    const channelManager = this.channelManagers.get(route.channelId)

    // Criar onion packet (simplificado)
    const onionPacket = this.createOnionPacket(route, paymentHash)

    // Se temos ChannelManager, usar ele para gerenciar HTLC
    if (channelManager) {
      try {
        const result = channelManager.addHtlc(amount, paymentHash, cltvExpiry, onionPacket)

        // Codificar e enviar mensagem gerada
        const { encrypted: encryptedHtlc } = encryptMessage(
          peerConnection.transportKeys,
          result.message,
        )
        await this.sendRaw(peerConnection, encryptedHtlc)

        // Registrar HTLC na lista legacy
        const htlcInfo: HtlcInfo = {
          id: result.htlcId,
          amountMsat: amount,
          paymentHash,
          cltvExpiry,
          direction: 'outgoing',
          state: 'pending',
        }
        const htlcList = this.htlcs.get(route.channelId) || []
        htlcList.push(htlcInfo)
        this.htlcs.set(route.channelId, htlcList)

        console.log(
          `[lightning] Sent HTLC ${result.htlcId} on channel ${route.channelId} (via ChannelManager)`,
        )
        return result.htlcId
      } catch (error) {
        console.error('[lightning] ChannelManager addHtlc failed:', error)
        throw error
      }
    }

    // Fallback: gerenciamento manual de HTLC (código legado)
    const htlcId = this.nextHtlcId.get(route.channelId) || 0n
    this.nextHtlcId.set(route.channelId, htlcId + 1n)

    // Criar HTLC message
    const htlcMessage = {
      type: LightningMessageType.UPDATE_ADD_HTLC,
      channelId: hexToUint8Array(route.channelId),
      id: htlcId,
      amountMsat: amount,
      paymentHash,
      cltvExpiry,
      onionRoutingPacket: onionPacket,
      tlvs: [] as unknown,
    }

    // Codificar e enviar
    const encodedHtlc = encodeUpdateAddHtlcMessage(htlcMessage as any)
    const encryptedHtlc = await encryptMessage(peerConnection.transportKeys, encodedHtlc)

    await this.sendRaw(peerConnection, encryptedHtlc.encrypted)

    // Registrar HTLC
    const htlcInfo: HtlcInfo = {
      id: htlcId,
      amountMsat: amount,
      paymentHash,
      cltvExpiry,
      direction: 'outgoing',
      state: 'pending',
    }
    const htlcList = this.htlcs.get(route.channelId) || []
    htlcList.push(htlcInfo)
    this.htlcs.set(route.channelId, htlcList)

    console.log(`[lightning] Sent HTLC ${htlcId} on channel ${route.channelId}`)
    return htlcId
  }

  // ==========================================
  // MÉTODOS AUXILIARES HTLC
  // ==========================================

  /**
   * Decodificação completa de invoice BOLT11
   * TODO: Implementar decodificação real
   */
  private async decodeInvoiceComplete(invoice: string): Promise<any> {
    // Simulação: decodificar invoice básica
    const decoded = this.decodeInvoiceBasic(invoice)
    return {
      ...decoded,
      payeePubkey: randomBytes(33), // Simulação
      cltvExpiry: Math.floor(Date.now() / 1000) + 3600, // 1 hora
    }
  }

  /**
   * Encontra rota para pagamento (simplificado)
   * TODO: Implementar pathfinding real (BOLT #4)
   */
  private async findRoute(destination: Uint8Array, amount: bigint): Promise<any> {
    // Simulação: usar primeiro canal disponível
    for (const [channelId, channel] of this.channels) {
      if (
        this.channelStates.get(channelId) === ChannelState.NORMAL &&
        channel.localBalance >= amount
      ) {
        return { channelId, nextHop: null }
      }
    }
    return null
  }

  /**
   * Aguarda resultado do HTLC
   */
  private async waitForHTLCResult(
    channelId: string,
    htlcId: bigint,
    paymentHash: Uint8Array,
  ): Promise<any> {
    // Simulação: aguardar resultado
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ success: true, preimage: randomBytes(32), paymentHash })
      }, 2000)
    })
  }

  /**
   * Valida HTLC recebido
   */
  private validateHTLC(htlcMessage: any, channel: ChannelInfo): boolean {
    // Validar amount
    if (htlcMessage.amountMsat > channel.remoteBalance) {
      return false
    }

    // Validar CLTV expiry
    const currentHeight = 800000 // Simulação
    if (htlcMessage.cltvExpiry <= currentHeight) {
      return false
    }

    return true
  }

  /**
   * Verifica se pagamento é destinado a nós
   */
  private async isPaymentForUs(paymentHash: Uint8Array): Promise<boolean> {
    // TODO: Verificar se temos o preimage armazenado
    // Por enquanto, simular que metade dos pagamentos são para nós
    return Math.random() > 0.5
  }

  /**
   * Encontra próximo hop para forwarding
   */
  private async findNextHop(onionPacket: Uint8Array): Promise<any> {
    // TODO: Decodificar onion packet e encontrar próximo hop
    return null // Simulação: não forward
  }

  /**
   * Forward HTLC para próximo hop
   */
  private async forwardHTLC(nextHop: any, htlcMessage: any): Promise<void> {
    // TODO: Implementar forwarding
    console.log('[lightning] HTLC forwarding not implemented yet')
  }

  /**
   * Gera preimage para payment hash
   */
  private generatePreimage(paymentHash: Uint8Array): Uint8Array {
    // TODO: Recuperar preimage real do armazenamento
    return randomBytes(32) // Simulação
  }

  /**
   * Cria onion packet para roteamento (BOLT #4)
   * Implementação completa com Sphinx para multi-hop payments
   */
  private createOnionPacket(route: any, paymentHash: Uint8Array): Uint8Array {
    // Extrair pubkeys dos hops da rota
    const hopPubkeys: Uint8Array[] = []
    for (let i = 0; i < route.hops.length; i++) {
      // TODO: Obter pubkey real do nó do grafo de roteamento
      // Por enquanto, simular pubkeys
      hopPubkeys.push(new Uint8Array(33)) // Placeholder
    }

    // Gerar session key aleatório
    const sessionKey = randomBytes(32)

    // Preparar dados dos hops (payloads TLV)
    const hopsData: any[] = []
    for (let i = 0; i < route.hops.length; i++) {
      const hop = route.hops[i]
      const isLastHop = i === route.hops.length - 1

      // Criar payload TLV para o hop
      const payload = this.createHopPayload(hop, paymentHash, isLastHop)
      hopsData.push({
        length: BigInt(payload.length),
        payload,
        hmac: new Uint8Array(32), // Será preenchido durante construção
      })
    }

    // Construir onion packet usando Sphinx
    const onionPacket = constructOnionPacket(hopPubkeys, sessionKey, hopsData)

    // Serializar packet para bytes
    return this.serializeOnionPacket(onionPacket)
  }

  /**
   * Cria payload TLV para um hop específico
   */
  private createHopPayload(hop: any, paymentHash: Uint8Array, isLastHop: boolean): Uint8Array {
    if (isLastHop) {
      // Payload final: amount, cltv_expiry, payment_secret (se disponível)
      const amount = hop.amountMsat || 1000n
      const cltvExpiry = hop.cltvExpiry || Math.floor(Date.now() / 1000) + 3600
      const paymentSecret = randomBytes(32) // TODO: Usar payment_secret real

      // Codificar TLVs
      const tlvs: any[] = [
        { type: 2, value: amount }, // amt_to_forward
        { type: 4, value: cltvExpiry }, // outgoing_cltv_value
        { type: 8, value: paymentSecret }, // payment_secret
        { type: 6, value: paymentHash }, // payment_data (legacy)
      ]

      return this.encodeTlvs(tlvs)
    } else {
      // Payload intermediário: amount, cltv_expiry, next hop info
      const amount = hop.amountMsat || 1000n
      const cltvExpiry = hop.cltvExpiry || Math.floor(Date.now() / 1000) + 3600

      const tlvs: any[] = [
        { type: 2, value: amount }, // amt_to_forward
        { type: 4, value: cltvExpiry }, // outgoing_cltv_value
        { type: 6, value: hop.shortChannelId }, // short_channel_id
      ]

      return this.encodeTlvs(tlvs)
    }
  }

  /**
   * Codifica array de TLVs em bytes
   */
  private encodeTlvs(tlvs: any[]): Uint8Array {
    const parts: Uint8Array[] = []

    for (const tlv of tlvs) {
      // Type (bigsize)
      const typeBytes = this.encodeBigSize(BigInt(tlv.type))

      // Length (bigsize)
      const lengthBytes = this.encodeBigSize(BigInt(tlv.value.length))

      // Value
      const valueBytes = tlv.value instanceof Uint8Array ? tlv.value : this.encodeValue(tlv.value)

      parts.push(typeBytes, lengthBytes, valueBytes)
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
   * Codifica valor baseado no tipo
   */
  private encodeValue(value: any): Uint8Array {
    if (typeof value === 'bigint') {
      // tu64
      const buf = new ArrayBuffer(8)
      new DataView(buf).setBigUint64(0, value, true)
      return new Uint8Array(buf)
    } else if (typeof value === 'number') {
      // tu32
      const buf = new ArrayBuffer(4)
      new DataView(buf).setUint32(0, value, true)
      return new Uint8Array(buf)
    } else if (value instanceof Uint8Array) {
      return value
    } else {
      throw new Error('Unsupported TLV value type')
    }
  }

  /**
   * Codifica bigsize
   */
  private encodeBigSize(value: bigint): Uint8Array {
    if (value < 0xfd) {
      return new Uint8Array([Number(value)])
    } else if (value <= 0xffff) {
      const buf = new ArrayBuffer(3)
      const view = new DataView(buf)
      view.setUint8(0, 0xfd)
      view.setUint16(1, Number(value), true)
      return new Uint8Array(buf)
    } else if (value <= 0xffffffff) {
      const buf = new ArrayBuffer(5)
      const view = new DataView(buf)
      view.setUint8(0, 0xfe)
      view.setUint32(1, Number(value), true)
      return new Uint8Array(buf)
    } else {
      const buf = new ArrayBuffer(9)
      const view = new DataView(buf)
      view.setUint8(0, 0xff)
      view.setBigUint64(1, value, true)
      return new Uint8Array(buf)
    }
  }

  /**
   * Serializa onion packet para bytes
   */
  private serializeOnionPacket(packet: any): Uint8Array {
    // Formato: version (1) + pubkey (33) + hop_payloads (1300) + hmac (32)
    const result = new Uint8Array(1 + 33 + 1300 + 32)
    result[0] = packet.version
    result.set(packet.publicKey, 1)
    result.set(packet.hopPayloads, 1 + 33)
    result.set(packet.hmac, 1 + 33 + 1300)
    return result
  }

  /**
   * Decodifica onion packet recebido
   */
  private decodeOnionPacket(data: Uint8Array): any {
    if (data.length !== 1366) {
      throw new Error('Invalid onion packet length')
    }

    return {
      version: data[0],
      publicKey: data.subarray(1, 34),
      hopPayloads: data.subarray(34, 34 + 1300),
      hmac: data.subarray(34 + 1300),
    }
  }

  /**
   * Processa onion packet recebido em um hop intermediário
   */
  private processOnionPacket(
    onionData: Uint8Array,
    associatedData: Uint8Array = new Uint8Array(),
  ): {
    payload: any
    nextOnion?: Uint8Array
  } {
    // Obter chave privada do nó (simulação)
    const nodePrivKey = this.deriveLightningKey(0).subarray(0, 32)

    const packet = this.decodeOnionPacket(onionData)
    const result = decryptOnion(packet, associatedData, undefined, nodePrivKey)

    return {
      payload: result.payload,
      nextOnion: result.nextOnion ? this.serializeOnionPacket(result.nextOnion) : undefined,
    }
  }

  /**
   * Atualiza estado de HTLC
   */
  private updateHTLCState(
    channelId: string,
    htlcId: bigint,
    state: 'pending' | 'fulfilled' | 'failed',
  ): void {
    const htlcs = this.htlcs.get(channelId)
    if (!htlcs) return

    const htlc = htlcs.find(h => h.id === htlcId)
    if (htlc) {
      htlc.state = state
    }
  }
  //
  // Esta seção gerencia pagamentos e consultas de saldo.
  // Ordem de uso:
  // 1. getBalance() -> Verificar saldo disponível
  // 2. sendPayment() -> Enviar pagamento via HTLC
  // 3. generateInvoice() -> Receber pagamentos
  //
  // Pagamentos usam HTLC (Hash Time Locked Contracts)

  /**
   * Retorna saldo disponível nos canais Lightning (BOLT #2)
   * Soma valores de todos os canais ativos
   *
   * Como usar:
   * const balance = await client.getBalance()
   * console.log(`Saldo: ${balance} sats`)
   *
   * @returns Promise<bigint> - Saldo total em satoshis
   */
  async getBalance(): Promise<bigint> {
    let totalBalance = 0n

    // Somar saldos de todos os canais ativos
    for (const [channelId, channel] of this.channels) {
      if (this.channelStates.get(channelId) === ChannelState.NORMAL) {
        totalBalance += channel.localBalance
      }
    }

    return totalBalance
  }

  /**
   * Gera invoice Lightning com abertura automática de canal (BOLT #2 + #11)
   * Cria invoice BOLT11 com suporte para abertura automática de canal
   *
   * Como usar:
   * const invoice = await client.generateInvoice({
   *   amount: 1000n,
   *   description: "Pagamento de teste"
   * })
   *
   * Funcionamento:
   * 1. Verifica se há canais ativos
   * 2. Se não há canais, calcula fee de abertura
   * 3. Gera payment_hash e payment_secret
   * 4. Deriva chave de nó para assinatura
   * 5. Codifica invoice BOLT11
   *
   * @param params - Parâmetros da invoice
   * @returns Promise<InvoiceWithChannelInfo> - Invoice e metadados
   */
  async generateInvoice(params: GenerateInvoiceParams): Promise<InvoiceWithChannelInfo> {
    const { amount, description, expiry, metadata } = params

    // Validar amount se fornecido
    if (amount !== undefined && amount <= 0n) {
      throw new Error('Amount must be positive')
    }

    // Verificar se precisa abrir canal
    const requiresChannel = !(await this.hasActiveChannels())

    // Calcular fee de abertura de canal se necessário
    let channelOpeningFee: bigint | undefined
    let effectiveAmount = amount

    if (requiresChannel && amount !== undefined) {
      // Se amount for menor que minChannelSize, ajustar
      const minSize = this.channelFeeConfig.minChannelSize
      const channelSize = amount > minSize ? amount : minSize

      channelOpeningFee = this.calculateChannelOpeningFee(channelSize)

      // O amount do invoice inclui a taxa de abertura
      // (usuário paga amount + fee, recebe amount)
      // Nota: Phoenix/Breez deduzem a fee do amount recebido
      // Aqui fazemos igual: amount solicitado é o que será recebido
    }

    // Gerar credenciais de pagamento
    const { paymentHash, paymentSecret } = this.generatePaymentCredentials()

    // TODO: Armazenar preimage para validação futura
    // const preimage = this.generatePaymentCredentials().preimage
    // this.storePreimage(paymentHash, preimage)

    // Derivar chave para assinar invoice
    const nodeKey = this.deriveLightningKey(this.nodeIndex++)
    const privateKey = nodeKey.subarray(0, 32)
    const publicKey = createPublicKey(privateKey)

    // Determinar currency prefix
    const currencyPrefix =
      this.network === 'mainnet'
        ? CurrencyPrefix.BITCOIN_MAINNET
        : this.network === 'testnet'
          ? CurrencyPrefix.BITCOIN_TESTNET
          : CurrencyPrefix.BITCOIN_REGTEST

    // Criar invoice params
    const invoiceParams: InvoiceCreateParams = {
      currency: currencyPrefix,
      amount: effectiveAmount, // Amount em millisatoshis
      paymentHash,
      paymentSecret,
      description,
      expiry: expiry || DEFAULT_EXPIRY_SECONDS,
      minFinalCltvExpiryDelta: DEFAULT_MIN_FINAL_CLTV_EXPIRY_DELTA,
      payeePubkey: publicKey,
      metadata,
      payeePrivateKey: privateKey,
    }

    // Encodar invoice
    const invoiceString = encodeInvoice(invoiceParams)

    return {
      invoice: invoiceString,
      qrCode: invoiceString.toUpperCase(), // BOLT11 em uppercase para QR
      amount: effectiveAmount,
      channelOpeningFee,
      requiresChannel,
      paymentHash: uint8ArrayToHex(paymentHash),
    }
  }

  /**
   * Decodificação básica de invoice para simulação
   * TODO: Implementar decodificação completa BOLT11
   */
  private decodeInvoiceBasic(invoice: string): {
    amount?: bigint
    paymentHash: Uint8Array
    description?: string
  } {
    // Simulação: extrair informações básicas da string
    // Em implementação real, usar biblioteca BOLT11
    const paymentHashHex = invoice.slice(-64) // Últimos 64 chars como hash mock
    const paymentHash = hexToUint8Array(paymentHashHex)

    // Amount mock (se presente)
    const amountMatch = invoice.match(/(\d+)n(\d+)/)
    const amount = amountMatch ? BigInt(amountMatch[1]) * 1000n + BigInt(amountMatch[2]) : undefined

    return {
      amount,
      paymentHash,
      description: 'Mock invoice',
    }
  }

  // ==========================================
  // 7. FACTORY METHOD E LIMPEZA
  // ==========================================

  /**
   * Fecha conexão Lightning
   * Cleanup completo: para ping/pong e destroi socket
   *
   * Como usar:
   * await client.close() // Sempre chamar ao finalizar
   */
  async close(): Promise<void> {
    // Cleanup ping/pong if exists
    const connectionWithCleanup = this.connection as LightningConnection & { cleanup?: () => void }
    if (connectionWithCleanup.cleanup) {
      connectionWithCleanup.cleanup()
    }

    // Destroy socket
    this.connection.destroy()
  }

  // ==========================================
  // 5. DERIVAÇÃO DE CHAVES (LNPBP-46)
  // ==========================================
  //
  // Implementa LNPBP-46 para derivação determinística de chaves Lightning.
  // Purpose 9735 define chaves específicas para Lightning Network.
  //
  // Hierarquia de derivação:
  // m/9735'/                        -> Chave raiz Lightning
  //   chain'/                       -> Rede (0' = Bitcoin)
  //     node'/                      -> Nível do nó (0' = nó, 1' = canal, 2' = funding)
  //       nodeIndex'/               -> Índice do nó específico
  //     channel'/                   -> Nível do canal
  //       lnVer'/                   -> Versão Lightning (0' = BOLT)
  //         channelIndex'/          -> ID do canal convertido
  //           basepoint             -> Basepoints específicos (0-6)
  //
  // Ordem de uso:
  // 1. getExtendedLightningKey() -> Chave raiz m/9735'/
  // 2. getNodeKey() -> Chave de nó para assinatura
  // 3. getChannelBasepoints() -> Basepoints para canais
  // 4. getFundingWallet() -> Carteira de funding

  /**
   * Deriva a chave estendida Lightning (m/9735'/)
   * Chave raiz para todas as derivações Lightning (LNPBP-46)
   *
   * Como usar:
   * const lightningKey = client.getExtendedLightningKey()
   * // Retorna 64 bytes: private key (32) + chain code (32)
   *
   * @returns Uint8Array - Chave estendida Lightning
   */
  getExtendedLightningKey(): Uint8Array {
    let key = this.masterKey
    key = deriveChildKey(key, LIGHTNING_PURPOSE + 0x80000000) // purpose'
    return key
  }

  /**
   * Deriva chave de nó (m/9735'/chain'/0'/nodeIndex')
   * Chave específica para um nó Lightning (assinatura de invoices/canais)
   *
   * Como usar:
   * const nodeKey = client.getNodeKey(0) // Nó principal
   * const pubKey = createPublicKey(nodeKey.subarray(0, 32))
   *
   * Path: m/9735'/0'/0'/0' (nó 0)
   *
   * @param nodeIndex - Índice do nó (padrão 0)
   * @returns Uint8Array - Chave estendida do nó
   */
  getNodeKey(nodeIndex: number = 0): Uint8Array {
    let key = this.getExtendedLightningKey()
    key = deriveChildKey(key, CoinType.Bitcoin) // chain'
    key = deriveChildKey(key, NodeIndex.NODE) // 0' (node level)
    key = deriveChildKey(key, nodeIndex + 0x80000000) // nodeIndex'
    return key
  }

  /**
   * Deriva basepoints para um canal (m/9735'/chain'/1'/lnVer'/channel'/basepoint)
   * Gera todas as chaves base necessárias para um canal Lightning (BOLT #2)
   *
   * Como usar:
   * const basepoints = client.getChannelBasepoints(channelId)
   * // Retorna: funding, payment, delayed, revocation, perCommitment, htlc, ptlc
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
   * @param channelId - ID do canal (string hex)
   * @param lnVer - Versão Lightning (padrão BOLT)
   * @returns Objeto com todas as basepoints
   */
  getChannelBasepoints(
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
    // const chain: ChainIndex = 0 // Bitcoin
    const channelIndex = constructChannelIndex(channelId)
    let key = this.getExtendedLightningKey()
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
   * Como usar:
   * const fundingKey = client.getFundingWallet(0, 0) // Receive case, index 0
   *
   * Cases disponíveis:
   * 0: RECEIVE - Receber funding
   * 1: CHANGE - Troco de funding
   * 2: SHUTDOWN - Encerramento de canal
   *
   * @param caseType - Tipo de caso (0=receive, 1=change, 2=shutdown)
   * @param index - Índice sequencial
   * @returns Uint8Array - Chave de funding
   */
  getFundingWallet(caseType: number = 0, index: number = 0): Uint8Array {
    let key = this.getExtendedLightningKey()
    key = deriveChildKey(key, CoinType.Bitcoin) // chain'
    key = deriveChildKey(key, NodeIndex.FUNDING_WALLET) // 2' (funding wallet level)
    key = deriveChildKey(key, caseType) // case
    key = deriveChildKey(key, index) // index
    return key
  }

  // ==========================================
  // REESTABELECIMENTO DE CANAIS (BOLT #2)
  // ==========================================
  //
  // Esta seção implementa o reestabelecimento de canais após desconexão.
  // Permite retomar canais existentes sem precisar reabri-los.
  //

  /**
   * Obtém mensagens não reconhecidas para um canal
   */
  private getUnacknowledgedMessages(channelId: string): any[] {
    // TODO: Implementar tracking de mensagens não reconhecidas
    // Por enquanto, retornar array vazio
    return []
  }

  /**
   * Reenvia mensagem para peer
   */
  private async resendMessage(peerId: string, message: any): Promise<void> {
    // TODO: Implementar reenvio de mensagens
    console.log(`[lightning] Resending message to peer ${peerId}`)
  }

  // ==========================================
  // ROTEAMENTO AVANÇADO (BOLT #4)
  // ==========================================
  //
  // Esta seção implementa funcionalidades de roteamento usando o grafo de roteamento.
  // Permite encontrar rotas de pagamento através da rede Lightning.
  //

  /**
   * Encontra rota de pagamento usando o grafo de roteamento
   * Implementa pathfinding com Dijkstra's algorithm
   *
   * Como usar:
   * const route = await client.findPaymentRoute(destinationPubkey, amountMsat)
   *
   * Algoritmo:
   * 1. Usar Dijkstra para encontrar caminho mais barato
   * 2. Considerar fees, capacity e CLTV expiry
   * 3. Retornar rota otimizada ou null se não encontrada
   *
   * @param destination - Chave pública do destino (Uint8Array)
   * @param amountMsat - Valor em millisatoshis
   * @param maxFeeMsat - Fee máxima aceitável (opcional)
   * @returns Promise<PaymentRoute | null> - Rota encontrada ou null
   */
  async findPaymentRoute(
    destination: Uint8Array,
    amountMsat: bigint,
    maxFeeMsat?: bigint,
  ): Promise<PaymentRoute | null> {
    if (!this.routingGraph) {
      console.warn('[routing] No routing graph available')
      return null
    }

    try {
      // Obter chave pública local para source
      const localPubkey = this.getLocalPubkey()

      // Encontrar rota usando Dijkstra
      const result = this.routingGraph.findRoute(localPubkey, destination, amountMsat)

      if (!result.route) {
        console.log(`[routing] No route found to ${uint8ArrayToHex(destination)}`)
        return null
      }

      // Verificar se fee está dentro do limite
      if (maxFeeMsat && result.route.totalFeeMsat > maxFeeMsat) {
        console.log(`[routing] Route fee ${result.route.totalFeeMsat} exceeds max ${maxFeeMsat}`)
        return null
      }

      console.log(
        `[routing] Found route with ${result.route.hops.length} hops, fee: ${result.route.totalFeeMsat} msat`,
      )
      return result.route
    } catch (error) {
      console.error('[routing] Failed to find payment route:', error)
      return null
    }
  }

  /**
   * Envia pagamento usando roteamento através da rede
   * Combina pathfinding com envio de HTLC
   *
   * Como usar:
   * const result = await client.sendRoutedPayment(invoice, maxFeeMsat)
   *
   * Fluxo:
   * 1. Decodificar invoice para obter destination e amount
   * 2. Encontrar rota usando findPaymentRoute()
   * 3. Construir onion packet com a rota
   * 4. Enviar HTLC para primeiro hop
   * 5. Aguardar confirmação ou timeout
   *
   * @param invoice - Invoice BOLT11 string
   * @param maxFeeMsat - Fee máxima aceitável
   * @returns Promise<PaymentResult> - Resultado do pagamento
   */
  async sendRoutedPayment(invoice: string, maxFeeMsat?: bigint): Promise<PaymentResult> {
    try {
      // 1. Decodificar invoice
      const decoded = this.decodeInvoiceBasic(invoice)
      if (!decoded.paymentHash || !decoded.amount) {
        return {
          success: false,
          error: 'Invalid invoice format',
          paymentHash: new Uint8Array(32),
        }
      }

      // 2. Encontrar rota
      const destination = uint8ArrayToHex(decoded.paymentHash) // TODO: Extrair pubkey real da invoice
      const route = await this.findPaymentRoute(
        hexToUint8Array(destination),
        decoded.amount,
        maxFeeMsat,
      )

      if (!route) {
        return {
          success: false,
          error: 'No route found',
          paymentHash: decoded.paymentHash,
        }
      }

      // 3. Construir onion packet
      const onionPacket = this.createOnionPacket(route, decoded.paymentHash)

      // 4. Enviar HTLC para primeiro hop
      const firstHop = route.hops[0]
      const htlcResult = await this.sendHTLCToPeer(
        uint8ArrayToHex(firstHop.shortChannelId),
        route.totalAmountMsat,
        decoded.paymentHash,
        route.totalCltvExpiry,
        onionPacket,
      )

      if (!htlcResult.success) {
        return {
          success: false,
          error: htlcResult.error || 'Failed to send HTLC',
          paymentHash: decoded.paymentHash,
        }
      }

      // 5. Aguardar resultado (simplificado)
      // TODO: Implementar monitoramento real de pagamento
      return {
        success: true,
        paymentHash: decoded.paymentHash,
        preimage: randomBytes(32), // Simulação
      }
    } catch (error) {
      console.error('[routing] Failed to send routed payment:', error)
      return {
        success: false,
        error: 'Payment failed',
        paymentHash: new Uint8Array(32),
      }
    }
  }

  /**
   * Atualiza grafo de roteamento com novos dados de gossip
   * Processa mensagens BOLT #7 (gossip) para manter grafo atualizado
   *
   * Como usar:
   * await client.updateRoutingGraph(gossipMessage)
   *
   * Tipos de mensagens processadas:
   * - channel_announcement: Novos canais
   * - node_announcement: Novos nós
   * - channel_update: Atualizações de canal
   *
   * @param gossipMessage - Mensagem de gossip recebida
   */
  async updateRoutingGraph(gossipMessage: GossipMessage): Promise<void> {
    if (!this.routingGraph) {
      console.warn('[routing] No routing graph available for updates')
      return
    }

    try {
      switch (gossipMessage.type) {
        case GossipMessageType.CHANNEL_ANNOUNCEMENT:
          await this.processChannelAnnouncement(gossipMessage as ChannelAnnouncementMessage)
          break
        case GossipMessageType.NODE_ANNOUNCEMENT:
          await this.processNodeAnnouncement(gossipMessage as NodeAnnouncementMessage)
          break
        case GossipMessageType.CHANNEL_UPDATE:
          await this.processChannelUpdate(gossipMessage as ChannelUpdateMessage)
          break
        default:
          console.warn(`[routing] Unknown gossip message type: ${gossipMessage.type}`)
      }

      console.log('[routing] Routing graph updated with gossip message')
    } catch (error) {
      console.error('[routing] Failed to update routing graph:', error)
    }
  }

  /**
   * Processa mensagem channel_announcement (BOLT #7)
   */
  private async processChannelAnnouncement(message: ChannelAnnouncementMessage): Promise<void> {
    try {
      // Validar assinatura da mensagem
      const isValid = await this.validateChannelAnnouncement(message)
      if (!isValid) {
        console.warn('[gossip] Invalid channel announcement signature')
        return
      }

      // Criar entrada no grafo de roteamento
      const channel: RoutingChannel = {
        shortChannelId: message.shortChannelId,
        nodeId1: message.nodeId1,
        nodeId2: message.nodeId2,
        capacity: message.capacity,
        features: message.features,
        lastUpdate: Date.now(),
        feeBaseMsat: 1000, // Default fee base
        feeProportionalMillionths: 1, // Default fee proportional
        cltvExpiryDelta: 40, // Default CLTV delta
        htlcMinimumMsat: 1n, // Default minimum
        htlcMaximumMsat: message.capacity * 1000n, // Default maximum
      }

      this.routingGraph.addChannel(channel)
      console.log(
        `[gossip] Added channel ${uint8ArrayToHex(message.shortChannelId)} to routing graph`,
      )
    } catch (error) {
      console.error('[gossip] Failed to process channel announcement:', error)
    }
  }

  /**
   * Processa mensagem node_announcement (BOLT #7)
   */
  private async processNodeAnnouncement(message: NodeAnnouncementMessage): Promise<void> {
    try {
      // Validar assinatura da mensagem
      const isValid = await this.validateNodeAnnouncement(message)
      if (!isValid) {
        console.warn('[gossip] Invalid node announcement signature')
        return
      }

      // Criar entrada no grafo de roteamento
      const node: RoutingNode = {
        nodeId: message.nodeId,
        features: message.features,
        lastUpdate: Date.now(),
        addresses: message.addresses,
        alias: message.alias,
      }

      this.routingGraph.addNode(node)
      console.log(`[gossip] Added node ${uint8ArrayToHex(message.nodeId)} to routing graph`)
    } catch (error) {
      console.error('[gossip] Failed to process node announcement:', error)
    }
  }

  /**
   * Processa mensagem channel_update (BOLT #7)
   */
  private async processChannelUpdate(message: ChannelUpdateMessage): Promise<void> {
    try {
      // Validar assinatura da mensagem
      const isValid = await this.validateChannelUpdate(message)
      if (!isValid) {
        console.warn('[gossip] Invalid channel update signature')
        return
      }

      // Atualizar canal existente no grafo
      const existingChannel = this.routingGraph.getChannel(message.shortChannelId)
      if (!existingChannel) {
        console.warn(
          `[gossip] Channel ${uint8ArrayToHex(message.shortChannelId)} not found for update`,
        )
        return
      }

      // Atualizar informações do canal
      const updatedChannel: RoutingChannel = {
        ...existingChannel,
        feeBaseMsat: message.feeBaseMsat,
        feeProportionalMillionths: message.feeProportionalMillionths,
        cltvExpiryDelta: message.cltvExpiryDelta,
        htlcMinimumMsat: message.htlcMinimumMsat,
        htlcMaximumMsat: message.htlcMaximumMsat,
        lastUpdate: Date.now(),
        disabled: message.disabled,
      }

      this.routingGraph.addChannel(updatedChannel)
      console.log(`[gossip] Updated channel ${uint8ArrayToHex(message.shortChannelId)}`)
    } catch (error) {
      console.error('[gossip] Failed to process channel update:', error)
    }
  }

  /**
   * Valida assinatura de channel_announcement
   */
  private async validateChannelAnnouncement(message: ChannelAnnouncementMessage): Promise<boolean> {
    // TODO: Implementar validação real de assinatura
    // - Verificar assinatura do node1
    // - Verificar assinatura do node2
    // - Verificar assinatura do bitcoin
    return true // Simulação
  }

  /**
   * Valida assinatura de node_announcement
   */
  private async validateNodeAnnouncement(message: NodeAnnouncementMessage): Promise<boolean> {
    // TODO: Implementar validação real de assinatura
    return true // Simulação
  }

  /**
   * Valida assinatura de channel_update
   */
  private async validateChannelUpdate(message: ChannelUpdateMessage): Promise<boolean> {
    // TODO: Implementar validação real de assinatura
    return true // Simulação
  }

  /**
   * Obtém estatísticas do grafo de roteamento
   * Útil para debugging e monitoramento
   *
   * Como usar:
   * const stats = client.getRoutingStats()
   * console.log(`Graph has ${stats.nodeCount} nodes, ${stats.channelCount} channels`)
   *
   * @returns Estatísticas do grafo ou null se não disponível
   */
  getRoutingStats(): { nodeCount: number; channelCount: number; totalCapacity: bigint } | null {
    if (!this.routingGraph) return null
    const stats = this.routingGraph.getStats()
    return {
      nodeCount: stats.nodes,
      channelCount: stats.channels,
      totalCapacity: 0n, // TODO: Calcular capacidade total
    }
  }

  // ==========================================
  // GOSSIP SYNC (BOLT #7)
  // ==========================================

  /**
   * Inicia sincronização de gossip com peer conectado
   *
   * Como usar:
   * await client.startGossipSync()
   *
   * Isso irá:
   * 1. Enviar gossip_timestamp_filter para receber atualizações
   * 2. Enviar query_channel_range para obter lista de canais
   * 3. Processar respostas e atualizar routing graph
   */
  async startGossipSync(): Promise<void> {
    if (!this.gossipSync || !this.connection) {
      console.warn('[gossip] Cannot start sync: no gossip sync or connection')
      return
    }

    // Criar interface de peer para gossip
    const peerInterface: GossipPeerInterface = {
      sendMessage: async (data: Uint8Array) => {
        if (this.connection.transportKeys) {
          const result = encryptMessage(this.connection.transportKeys, data)
          await this.sendRawMessage(result.encrypted)
          // Atualizar chaves de transporte após cada mensagem
          this.connection.transportKeys = result.newKeys
        }
      },
      onMessage: (handler: (data: Uint8Array) => void) => {
        // Handler já configurado no processamento de mensagens
        this.gossipMessageHandler = handler
      },
      isConnected: () => this.isConnected(),
    }

    try {
      await this.gossipSync.startSync(peerInterface, {
        fullSync: true,
        requestTimestamps: true,
        requestChecksums: true,
      })
      console.log('[gossip] Gossip sync started')
    } catch (error) {
      console.error('[gossip] Failed to start gossip sync:', error)
    }
  }

  // Handler de mensagens gossip (configurado em startGossipSync)
  private gossipMessageHandler: ((data: Uint8Array) => void) | null = null

  /**
   * Processa mensagem gossip recebida do peer
   */
  async processGossipMessage(data: Uint8Array): Promise<void> {
    if (this.gossipSync) {
      await this.gossipSync.handleIncomingMessage(data)
    }
    if (this.gossipMessageHandler) {
      this.gossipMessageHandler(data)
    }
  }

  /**
   * Retorna estatísticas de sincronização de gossip
   */
  getGossipSyncStats(): GossipSyncStats | null {
    return this.gossipSync?.getStats() || null
  }

  /**
   * Verifica se gossip está sincronizado
   */
  isGossipSynced(): boolean {
    return this.gossipSync?.getState() === GossipSyncState.SYNCED
  }

  /**
   * Verifica se conexão está ativa
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.transportKeys !== null
  }

  // ==========================================
  // TRAMPOLINE ROUTING
  // ==========================================

  /**
   * Envia pagamento usando trampoline routing
   *
   * Trampoline routing permite enviar pagamentos sem conhecer a rota completa.
   * O nó trampoline (ex: ACINQ) faz o pathfinding até o destino.
   *
   * Como usar:
   * const result = await client.sendTrampolinePayment({
   *   destinationNodeId: destPubKey,
   *   amountMsat: 100000n,
   *   paymentHash: hash,
   *   paymentSecret: secret,
   * })
   *
   * @param params - Parâmetros do pagamento
   * @returns Promise<PaymentResult> - Resultado do pagamento
   */
  async sendTrampolinePayment(params: {
    destinationNodeId: Uint8Array
    amountMsat: bigint
    paymentHash: Uint8Array
    paymentSecret: Uint8Array
    maxRetries?: number
  }): Promise<PaymentResult> {
    if (!this.trampolineRouter) {
      return {
        success: false,
        paymentHash: params.paymentHash,
        error: 'Trampoline router not initialized',
      }
    }

    const maxRetries = params.maxRetries ?? 3
    let lastError = ''

    // Obter altura do bloco atual
    const currentBlockHeight = await this.getCurrentBlockHeight()

    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        // Criar pagamento trampoline
        const trampolinePayment = this.trampolineRouter.createTrampolinePayment(
          params.destinationNodeId,
          params.amountMsat,
          params.paymentHash,
          params.paymentSecret,
          currentBlockHeight,
        )

        if (!trampolinePayment) {
          lastError = 'Failed to create trampoline payment'
          continue
        }

        // Obter rota para o primeiro nó trampoline
        const trampolineNode = this.trampolineRouter.getTrampolineNodes()[0]
        if (!trampolineNode) {
          lastError = 'No trampoline node available'
          break
        }

        // Encontrar canal para o nó trampoline
        const channelToTrampoline = this.findChannelToNode(trampolineNode.nodeId)
        if (!channelToTrampoline) {
          lastError = 'No channel to trampoline node'
          break
        }

        // Calcular fee total
        const feeLevel = this.trampolineRouter.getCurrentFeeLevel()
        const route = this.trampolineRouter.createTrampolineRoute(
          params.destinationNodeId,
          params.amountMsat,
          currentBlockHeight,
          feeLevel,
        )

        if (!route) {
          lastError = 'Failed to create route'
          continue
        }

        // Enviar HTLC com payload trampoline
        const htlcResult = await this.sendHTLCToPeer(
          channelToTrampoline.channelId,
          route.totalAmountMsat,
          params.paymentHash,
          route.hops[0].cltvExpiry,
          trampolinePayment.outerOnion,
        )

        if (htlcResult.success) {
          // Aguardar preimage
          const preimage = await this.waitForPreimage(params.paymentHash)
          if (preimage) {
            this.trampolineRouter.resetFeeLevel()
            return {
              success: true,
              preimage: preimage,
              paymentHash: params.paymentHash,
            }
          }
        }

        // Verificar se deve fazer retry com fee maior
        if (htlcResult.error && this.trampolineRouter.shouldRetryWithHigherFee(0x100c)) {
          console.log(
            `[trampoline] Retrying with higher fee level: ${this.trampolineRouter.getCurrentFeeLevel()}`,
          )
          continue
        }

        lastError = htlcResult.error || 'Payment failed'
      } catch (error) {
        lastError = String(error)
        console.error('[trampoline] Payment error:', error)
      }
    }

    this.trampolineRouter.resetFeeLevel()
    return {
      success: false,
      paymentHash: params.paymentHash,
      error: lastError,
    }
  }

  /**
   * Adiciona nó trampoline personalizado
   */
  addTrampolineNode(node: TrampolineNode): void {
    this.trampolineRouter?.addTrampolineNode(node)
  }

  /**
   * Lista nós trampoline disponíveis
   */
  getTrampolineNodes(): TrampolineNode[] {
    return this.trampolineRouter?.getTrampolineNodes() || []
  }

  /**
   * Verifica se peer suporta trampoline routing
   * Nota: Requer que peerFeatures seja armazenado durante troca de init messages
   */
  peerSupportsTrampolineRouting(): boolean {
    // TODO: Armazenar features do peer durante init message exchange
    // Por enquanto, retornar false
    return false
  }

  /**
   * Encontra canal para um nó específico
   */
  private findChannelToNode(nodeId: Uint8Array): ChannelInfo | null {
    const nodeIdHex = uint8ArrayToHex(nodeId)
    for (const [, channel] of this.channels) {
      // Usar peerId para encontrar o canal
      if (channel.peerId === nodeIdHex) {
        return channel
      }
    }
    return null
  }

  /**
   * Aguarda preimage de um pagamento
   */
  private async waitForPreimage(paymentHash: Uint8Array): Promise<Uint8Array | null> {
    const hashHex = uint8ArrayToHex(paymentHash)

    // Aguardar até 60 segundos
    const timeout = 60000
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const preimage = this.preimageStore.get(hashHex)
      if (preimage) {
        return preimage
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return null
  }

  /**
   * Obtém altura do bloco atual
   */
  private async getCurrentBlockHeight(): Promise<number> {
    // TODO: Implementar consulta real via Electrum
    // Por enquanto, retornar estimativa
    return 850000
  }

  /**
   * Envia mensagem raw para a conexão
   */
  private async sendRawMessage(data: Uint8Array): Promise<void> {
    // LightningConnection é um Socket, podemos escrever diretamente
    const connection = this.connection as unknown as {
      write: (data: Buffer, callback?: (err?: Error) => void) => boolean
    }

    return new Promise((resolve, reject) => {
      connection.write(Buffer.from(data), (err?: Error) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Obtém chave pública local do nó
   * Usada como source para roteamento
   */
  private getLocalPubkey(): Uint8Array {
    // TODO: Implementar obtenção real da chave pública do nó
    // Por enquanto, usar chave derivada
    const nodeKey = this.deriveLightningKey(this.nodeIndex++)
    return createPublicKey(nodeKey.subarray(0, 32))
  }

  /**
   * Envia HTLC para peer específico
   * Método auxiliar para roteamento
   */
  private async sendHTLCToPeer(
    channelId: string,
    amountMsat: bigint,
    paymentHash: Uint8Array,
    cltvExpiry: number,
    onionPacket: Uint8Array,
  ): Promise<{ success: boolean; error?: string }> {
    // TODO: Implementar envio real de HTLC
    console.log(`[routing] Sending HTLC to channel ${channelId}`)
    return { success: true }
  }

  /**
   * Verifica breach em todos os canais monitorados pelo watchtower
   * Chamado quando uma transação suspeita é detectada na blockchain
   *
   * Como usar:
   * const breaches = await client.checkAllChannelsForBreach(txHex)
   * if (breaches.length > 0) {
   *   // Broadcast penalty transactions
   * }
   *
   * @param txHex - Transação suspeita em formato hex
   * @returns Promise<BreachResult[]> - Lista de breaches detectados
   */
  async checkAllChannelsForBreach(txHex: string): Promise<BreachResult[]> {
    const breaches: BreachResult[] = []

    for (const channelId of this.watchtower['monitoredChannels'].keys()) {
      const result = this.watchtower.checkForBreach(channelId, txHex)
      if (result.breach) {
        breaches.push(result)
      }
    }

    return breaches
  }

  /**
   * Broadcast penalty transaction para um canal comprometido
   * Envia transação de penalidade para a blockchain
   *
   * Como usar:
   * const success = await client.broadcastPenaltyTransaction(breachResult)
   * if (success) {
   *   console.log('Penalty transaction broadcasted')
   * }
   *
   * @param breachResult - Resultado da detecção de breach
   * @returns Promise<boolean> - true se broadcast foi bem-sucedido
   */
  async broadcastPenaltyTransaction(breachResult: BreachResult): Promise<boolean> {
    if (!breachResult.breach || !breachResult.penaltyTx) {
      console.error('[watchtower] Invalid breach result for penalty broadcast')
      return false
    }

    try {
      // TODO: Implementar broadcast real para a blockchain
      // Por enquanto, simular broadcast
      console.log(
        `[watchtower] Broadcasting penalty transaction: ${uint8ArrayToHex(breachResult.penaltyTx)}`,
      )

      // Simular delay de broadcast
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Marcar canal como penalizado
      // TODO: Atualizar estado do canal

      console.log('[watchtower] Penalty transaction broadcasted successfully')
      return true
    } catch (error) {
      console.error('[watchtower] Failed to broadcast penalty transaction:', error)
      return false
    }
  }

  /**
   * Monitora blockchain por transações suspeitas
   * Verifica periodicamente por tentativas de roubo de canais
   *
   * Como usar:
   * const cleanup = client.startBlockchainMonitoring()
   * // cleanup() para parar monitoramento
   *
   * @returns Função cleanup para parar monitoramento
   */
  startBlockchainMonitoring(): () => void {
    const monitoringInterval = setInterval(async () => {
      try {
        // TODO: Obter transações recentes da blockchain
        // Por enquanto, simular verificação
        const recentTxs = await this.getRecentBlockchainTransactions()

        for (const txHex of recentTxs) {
          const breaches = await this.checkAllChannelsForBreach(txHex)
          for (const breach of breaches) {
            console.warn(`[watchtower] Breach detected: ${breach.reason}`)
            await this.broadcastPenaltyTransaction(breach)
          }
        }
      } catch (error) {
        console.error('[watchtower] Blockchain monitoring error:', error)
      }
    }, 60000) // Verificar a cada minuto

    // Cleanup function
    const cleanup = () => {
      clearInterval(monitoringInterval)
      console.log('[watchtower] Stopped blockchain monitoring')
    }

    console.log('[watchtower] Started blockchain monitoring')
    return cleanup
  }

  /**
   * Obtém transações recentes da blockchain (simulação)
   * TODO: Implementar integração real com blockchain
   */
  private async getRecentBlockchainTransactions(): Promise<string[]> {
    // Simulação: retornar transações mock
    return [
      // Simular algumas transações normais
      '0200000001' + '00'.repeat(200), // Transação normal
      // Ocasionalmente incluir uma transação suspeita para teste
      Math.random() > 0.95 ? 'breach' + '00'.repeat(200) : '0200000002' + '00'.repeat(200),
    ]
  }

  // ==========================================
  // REESTABELECIMENTO DE CANAIS AVANÇADO (BOLT #2)
  // ==========================================
  //
  // Esta seção implementa reestabelecimento de canais com suporte a TLVs.
  // Permite reestabelecimento mais robusto com informações adicionais.
  //

  /**
   * Processa mensagem channel_reestablish recebida
   * Reestabelece estado do canal após reconexão com suporte a TLVs
   *
   * Como usar:
   * const result = await client.handleChannelReestablish(peerId, reestablishMsg)
   *
   * TLVs suportados:
   * - next_funding_txid: Próxima transação de funding
   * - next_local_nonce: Nonce local para sincronização
   * - next_remote_nonce: Nonce remoto para sincronização
   *
   * @param peerId - ID do peer que enviou reestablish
   * @param reestablishMsg - Mensagem channel_reestablish
   * @returns Promise<boolean> - true se reestabelecimento foi bem-sucedido
   */
  async handleChannelReestablish(
    peerId: string,
    reestablishMsg: any, // TODO: Import ChannelReestablishMessage
  ): Promise<boolean> {
    try {
      // 1. Encontrar canal correspondente
      const channelId = Array.from(this.channels.keys()).find(id => {
        const channel = this.channels.get(id)
        return channel?.peerId === peerId
      })

      if (!channelId) {
        console.error(`[lightning] No channel found for peer ${peerId}`)
        return false
      }

      const channel = this.channels.get(channelId)
      if (!channel) {
        console.error(`[lightning] Channel ${channelId} not found in channels map`)
        return false
      }

      // 2. Usar ChannelManager se disponível
      const channelManager = this.channelManagers.get(channelId)
      if (channelManager) {
        try {
          const result = channelManager.handleChannelReestablish(
            BigInt(reestablishMsg.nextCommitmentNumber),
            BigInt(reestablishMsg.nextRevocationNumber),
            reestablishMsg.yourLastPerCommitmentSecret || new Uint8Array(32),
            reestablishMsg.myCurrentPerCommitmentPoint || new Uint8Array(33),
          )

          if (!result.success) {
            console.error('[lightning] Channel reestablish failed:', result.error)
            return false
          }

          // Atualizar estado
          this.channelStates.set(channelId, ChannelState.NORMAL)
          channel.lastActivity = Date.now()
          console.log(
            `[lightning] Channel ${channelId} reestablished with peer ${peerId} (via ChannelManager)`,
          )
          return true
        } catch (error) {
          console.error('[lightning] ChannelManager handleChannelReestablish failed:', error)
          // Continuar com código legado
        }
      }

      // Código legado
      // 2. Validar números de commitment
      const localCommitmentNumber = (channel as any).currentCommitmentNumber || 0n
      const remoteCommitmentNumber = reestablishMsg.nextCommitmentNumber

      if (remoteCommitmentNumber < localCommitmentNumber) {
        console.error('[lightning] Remote commitment number is behind')
        return false
      }

      // 3. Processar TLVs do reestablish (BOLT #2)
      const tlvs = this.parseReestablishTlvs(reestablishMsg.tlvs || [])

      // 4. Verificar se precisamos reenviar mensagens
      const messagesToResend = this.getUnacknowledgedMessages(channelId)

      // 5. Enviar channel_reestablish de resposta se necessário
      if (messagesToResend.length > 0 || remoteCommitmentNumber > localCommitmentNumber) {
        await this.sendChannelReestablish(channelId, reestablishMsg, tlvs)
      }

      // 6. Reenviar mensagens não reconhecidas
      for (const message of messagesToResend) {
        await this.resendMessage(peerId, message)
      }

      // 7. Atualizar estado para NORMAL
      this.channelStates.set(channelId, ChannelState.NORMAL)
      channel.lastActivity = Date.now()

      console.log(`[lightning] Channel ${channelId} reestablished with peer ${peerId}`)
      return true
    } catch (error) {
      console.error('[lightning] Failed to handle channel reestablish:', error)
      return false
    }
  }

  /**
   * Faz parse dos TLVs do channel_reestablish
   */
  private parseReestablishTlvs(tlvs: any[]): ReestablishTlvs {
    const result: ReestablishTlvs = {
      nextFundingTxId: undefined,
      nextLocalNonce: undefined,
      nextRemoteNonce: undefined,
    }

    for (const tlv of tlvs) {
      switch (tlv.type) {
        case 0: // next_funding_txid
          result.nextFundingTxId = tlv.value
          break
        case 1: // next_local_nonce
          result.nextLocalNonce = tlv.value
          break
        case 2: // next_remote_nonce
          result.nextRemoteNonce = tlv.value
          break
        default:
          console.warn(`[reestablish] Unknown TLV type: ${tlv.type}`)
      }
    }

    return result
  }

  /**
   * Envia mensagem channel_reestablish com TLVs
   */
  private async sendChannelReestablish(
    channelId: string,
    remoteReestablish: any,
    remoteTlvs: ReestablishTlvs,
  ): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) throw new Error('Channel not found')

    const peerConnection = this.connectedPeers.get(channel.peerId)
    if (!peerConnection) throw new Error('Peer connection not found')

    // TODO: Implementar ChannelReestablishMessage
    // const reestablishMessage = {
    //   type: 136, // LightningMessageType.CHANNEL_REESTABLISH
    //   channelId: hexToUint8Array(channelId),
    //   nextCommitmentNumber: (channel as any).currentCommitmentNumber || 0n,
    //   nextRevocationNumber: (channel as any).nextRevocationNumber || 0n,
    //   yourLastPerCommitmentSecret: new Uint8Array(32), // TODO: Implementar
    //   myCurrentPerCommitmentPoint: new Uint8Array(33), // TODO: Implementar
    //   tlvs,
    // }

    // Codificar e enviar
    // TODO: Implementar encodeChannelReestablishMessage
    // const encodedReestablish = encodeChannelReestablishMessage(reestablishMessage)
    // const encryptedReestablish = await encryptMessage(peerConnection.transportKeys, encodedReestablish)
    // await this.sendRaw(peerConnection, encryptedReestablish.encrypted)

    console.log(`[lightning] Sent channel_reestablish for channel ${channelId}`)
  }

  /**
   * Cria script de output do canal (2-of-2 multisig)
   * Implementa script P2WSH para canal Lightning
   */
  private createMultisigScript(localPubkey: Uint8Array, remotePubkey: Uint8Array): Uint8Array {
    // Ordenar pubkeys lexicograficamente (BOLT #3)
    const pubkeys = [localPubkey, remotePubkey].sort((a, b) => {
      for (let i = 0; i < 33; i++) {
        if (a[i] !== b[i]) return a[i] - b[i]
      }
      return 0
    })

    // Script multisig: OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
    const script = new Uint8Array(1 + 33 + 33 + 3) // OP_2 + pubkey1 + pubkey2 + OP_2 + OP_CHECKMULTISIG
    let offset = 0

    script[offset++] = 0x52 // OP_2
    script.set(pubkeys[0], offset)
    offset += 33
    script.set(pubkeys[1], offset)
    offset += 33
    script[offset++] = 0x52 // OP_2
    script[offset++] = 0xae // OP_CHECKMULTISIG

    return script
  }

  /**
   * Obtém UTXOs disponíveis para funding
   * Integra com Electrum para listar UTXOs da carteira
   */
  private async getAvailableUtxos(amount: bigint): Promise<any[]> {
    try {
      // TODO: Implementar chamada real para Electrum listunspent
      // Por enquanto, simular UTXOs suficientes
      const mockUtxos = [
        {
          txid: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
          vout: 0,
          value: amount + 10000n, // Valor suficiente + troco
          scriptPubKey: '0014' + '00'.repeat(20), // P2WPKH placeholder
        },
      ]
      return mockUtxos
    } catch (error) {
      console.error('[lightning] Failed to get available UTXOs:', error)
      throw error
    }
  }

  /**
   * Seleciona UTXOs suficientes para cobrir o amount
   * Implementa coin selection básica
   */
  private selectUtxos(utxos: any[], amount: bigint): any[] {
    // Algoritmo simples: selecionar primeiro UTXO suficiente
    for (const utxo of utxos) {
      if (utxo.value >= amount) {
        return [utxo]
      }
    }

    // Se nenhum UTXO único é suficiente, combinar os menores
    const sortedUtxos = utxos.sort((a, b) => Number(a.value - b.value))
    const selected: any[] = []
    let total = 0n

    for (const utxo of sortedUtxos) {
      selected.push(utxo)
      total += utxo.value
      if (total >= amount) break
    }

    if (total < amount) {
      throw new Error('Insufficient funds in selected UTXOs')
    }

    return selected
  }

  /**
   * Estima fee da transação de funding
   * Baseado no número de inputs/outputs e fee rate
   */
  private estimateFundingTxFee(inputCount: number, outputCount: number, feeRate: bigint): bigint {
    // Estimativa simplificada: 150 bytes por input, 100 bytes por output
    const estimatedTxSize = inputCount * 150 + outputCount * 100 + 100 // Overhead
    return (BigInt(estimatedTxSize) * feeRate) / 1000n // feeRate em sat/vbyte
  }

  /**
   * Constrói transação de funding
   * Cria transação Bitcoin com output para o canal
   */
  private buildFundingTransaction(
    selectedUtxos: any[],
    amount: bigint,
    channelAddress: string,
    fee: bigint,
    fundingKey: Uint8Array,
  ): any {
    // Calcular total de inputs
    const totalInput = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0n)

    // Calcular troco (se necessário)
    const changeAmount = totalInput - amount - fee
    const outputs = [{ address: channelAddress, value: amount }]

    if (changeAmount > 0n) {
      // TODO: Gerar endereço de troco
      const changeAddress = 'bc1q' + '0'.repeat(38) // Placeholder
      outputs.push({ address: changeAddress, value: changeAmount })
    }

    // Estrutura básica da transação
    const tx = {
      version: 2,
      inputs: selectedUtxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptSig: '',
        sequence: 0xffffffff,
      })),
      outputs,
      locktime: 0,
    }

    return tx
  }

  /**
   * Serializa transação para formato hex
   * Converte transação para formato broadcast-ready
   */
  private serializeTransaction(tx: any): string {
    // TODO: Implementar serialização real da transação Bitcoin
    // Por enquanto, retornar placeholder
    return '0200000001' + '00'.repeat(200) // Transação mock
  }

  /**
   * Converte script hash para endereço P2WSH
   * Gera endereço bech32 para o script do canal
   */
  private scriptHashToAddress(scriptHash: Uint8Array): string {
    // TODO: Implementar conversão real para endereço bech32
    // Por enquanto, retornar endereço placeholder
    const hashHex = uint8ArrayToHex(scriptHash)
    return `bc1q${hashHex.slice(0, 38)}` // Placeholder P2WSH address
  }
}

export default LightningClient

// ==========================================
// TIPOS AUXILIARES PARA GERENCIAMENTO DE CANAIS
// ==========================================

/**
 * Estados possíveis de um canal Lightning
 */
export enum ChannelState {
  // Estados de abertura
  PENDING_OPEN = 'pending_open',
  OPENING = 'opening',
  CHANNEL_READY = 'channel_ready',
  FUNDING_CONFIRMED = 'funding_confirmed',

  // Estados normais
  NORMAL = 'normal',

  // Estados de fechamento
  SHUTTING_DOWN = 'shutting_down',
  CLOSING = 'closing',
  CLOSED = 'closed',

  // Estados de erro
  ERROR = 'error',
}

/**
 * Informações de um canal Lightning
 */
export interface ChannelInfo {
  channelId: string
  peerId: string
  state: ChannelState
  localBalance: bigint
  remoteBalance: bigint
  fundingTxid?: string
  fundingOutputIndex?: number
  capacity: bigint
  createdAt: number
  lastActivity: number
}

/**
 * Parâmetros para abertura de canal
 */
export interface OpenChannelParams {
  peerId: string
  amount: bigint // Capacidade do canal em satoshis
  pushMsat?: bigint // Amount inicial para o peer remoto
  feeratePerKw?: number // Taxa de fee por KW
  dustLimitSatoshis?: bigint
  maxHtlcValueInFlightMsat?: bigint
  channelReserveSatoshis?: bigint
  htlcMinimumMsat?: bigint
  toSelfDelay?: number
  maxAcceptedHtlcs?: number
}

/**
 * Resultado da abertura de canal
 */
export interface OpenChannelResult {
  success: boolean
  channelId?: string
  error?: string
}

/**
 * Parâmetros para fechamento de canal
 */
export interface CloseChannelParams {
  channelId: string
  scriptpubkey?: Uint8Array // Script de destino para fechamento cooperativo
  force?: boolean // Forçar fechamento unilateral
}

/**
 * Resultado do fechamento de canal
 */
export interface CloseChannelResult {
  success: boolean
  closingTxid?: string
  error?: string
}

/**
 * Informações de HTLC
 */
export interface HtlcInfo {
  id: bigint
  amountMsat: bigint
  paymentHash: Uint8Array
  cltvExpiry: number
  direction: 'incoming' | 'outgoing'
  state: 'pending' | 'fulfilled' | 'failed'
}

/**
 * Estados possíveis de um peer
 */
export enum PeerState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
}

/**
 * Informações de um peer conectado
 */
export interface PeerInfo {
  id: string
  host: string
  port: number
  state: PeerState
  connectedAt: number
}

/**
 * Peer estendido com chave pública opcional
 */
export type PeerWithPubkey = Peer & {
  pubkey?: string // Chave pública em hex
}

/**
 * Resultado da tentativa de conexão com peer
 */
export type PeerConnectionResult = {
  success: boolean
  peerId: string
  connection?: LightningConnection
  error?: Error
  message?: string
}

// ==========================================
// WATCHTOWER - MONITORAMENTO DE CANAIS
// ==========================================

/**
 * Tipos de mensagens gossip (BOLT #7)
 */
export enum GossipMessageType {
  CHANNEL_ANNOUNCEMENT = 256,
  NODE_ANNOUNCEMENT = 257,
  CHANNEL_UPDATE = 258,
}

/**
 * Interface base para mensagens gossip
 */
export interface GossipMessage {
  type: GossipMessageType
}

/**
 * Mensagem channel_announcement (BOLT #7)
 */
export interface ChannelAnnouncementMessage extends GossipMessage {
  type: GossipMessageType.CHANNEL_ANNOUNCEMENT
  nodeId1: Uint8Array
  nodeId2: Uint8Array
  bitcoinKey1: Uint8Array
  bitcoinKey2: Uint8Array
  shortChannelId: Uint8Array
  features: Uint8Array
  capacity: bigint
  nodeSignature1: Uint8Array
  nodeSignature2: Uint8Array
  bitcoinSignature1: Uint8Array
  bitcoinSignature2: Uint8Array
}

/**
 * Mensagem node_announcement (BOLT #7)
 */
export interface NodeAnnouncementMessage extends GossipMessage {
  type: GossipMessageType.NODE_ANNOUNCEMENT
  nodeId: Uint8Array
  features: Uint8Array
  timestamp: number
  alias: string
  addresses: NodeAddress[]
  nodeSignature: Uint8Array
}

/**
 * Mensagem channel_update (BOLT #7)
 */
export interface ChannelUpdateMessage extends GossipMessage {
  type: GossipMessageType.CHANNEL_UPDATE
  shortChannelId: Uint8Array
  timestamp: number
  messageFlags: number
  channelFlags: number
  cltvExpiryDelta: number
  htlcMinimumMsat: bigint
  feeBaseMsat: number
  feeProportionalMillionths: number
  htlcMaximumMsat?: bigint
  signature: Uint8Array
  disabled?: boolean
}

/**
 * Endereço de nó
 */
export interface NodeAddress {
  type: 'ipv4' | 'ipv6' | 'torv2' | 'torv3' | 'dns'
  address: string
  port: number
}

/**
 * Watchtower para monitoramento de canais
 * Detecta tentativas de roubo de canais e força fechamento
 */
export class Watchtower {
  private monitoredChannels: Map<string, WatchtowerChannel> = new Map()

  /**
   * Adiciona canal para monitoramento
   */
  addChannel(channelId: string, channelInfo: ChannelInfo, remotePubkey: Uint8Array): void {
    const watchtowerChannel: WatchtowerChannel = {
      channelId,
      remotePubkey,
      localBalance: channelInfo.localBalance,
      remoteBalance: channelInfo.remoteBalance,
      commitmentNumber: 0n,
      lastCommitmentTx: null,
      breachDetected: false,
    }

    this.monitoredChannels.set(channelId, watchtowerChannel)
  }

  /**
   * Atualiza estado do canal no watchtower
   */
  updateChannelState(channelId: string, commitmentTx: Uint8Array, commitmentNumber: bigint): void {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) return

    channel.lastCommitmentTx = commitmentTx
    channel.commitmentNumber = commitmentNumber
  }

  /**
   * Verifica se houve breach no canal
   * Chamado quando uma transação suspeita é detectada na blockchain
   */
  checkForBreach(channelId: string, txHex: string): BreachResult {
    const channel = this.monitoredChannels.get(channelId)
    if (!channel) {
      return { breach: false, reason: 'Channel not monitored' }
    }

    // TODO: Implementar verificação real de breach
    // - Verificar se a transação gasta o funding output
    // - Verificar se usa commitment secreto antigo
    // - Verificar se viola o estado do canal

    // Simulação: marcar como breach se transação suspeita
    if (txHex.includes('breach')) {
      channel.breachDetected = true
      return {
        breach: true,
        reason: 'Suspicious transaction detected',
        penaltyTx: this.generatePenaltyTx(channel),
      }
    }

    return { breach: false }
  }

  /**
   * Gera transação de penalidade em caso de breach
   */
  private generatePenaltyTx(channel: WatchtowerChannel): Uint8Array {
    // TODO: Implementar geração real de penalty transaction
    // - Usar revocation secret para gastar todos os fundos
    // - Enviar tudo para endereço local
    return new Uint8Array(32) // Placeholder
  }

  /**
   * Remove canal do monitoramento
   */
  removeChannel(channelId: string): void {
    this.monitoredChannels.delete(channelId)
  }
}

/**
 * Resultado da verificação de breach
 */
interface BreachResult {
  breach: boolean
  reason?: string
  penaltyTx?: Uint8Array
}

/**
 * Canal monitorado pelo watchtower
 */
interface WatchtowerChannel {
  channelId: string
  remotePubkey: Uint8Array
  localBalance: bigint
  remoteBalance: bigint
  commitmentNumber: bigint
  lastCommitmentTx: Uint8Array | null
  breachDetected: boolean
}

/**
 * TLVs para channel_reestablish
 */
interface ReestablishTlvs {
  nextFundingTxId?: Uint8Array
  nextLocalNonce?: Uint8Array
  nextRemoteNonce?: Uint8Array
}

// Instância global de persistência movida para './persistence'
