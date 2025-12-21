import { Connection, Peer } from '@/core/models/network'
import { connect as connectElectrum } from '@/core/lib/electrum'
import { LightningClientConfig, ChannelOpeningFeeConfig } from '@/core/models/lightning/client'
import LightningWorker from '@/core/lib/lightning/worker'

// Reexporta o tipo para consumo pela UI via camada de services (evita imports diretos da lib)
export type { LightningWorker }

interface NetworkServiceInterface {
  connect(): Promise<Connection>
  createLightningWorker(
    masterKey: Uint8Array,
    network?: 'mainnet' | 'testnet' | 'regtest',
    peer?: Peer,
    peerPubKey?: Uint8Array,
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ): Promise<LightningWorker>
}

class NetworkService implements NetworkServiceInterface {
  // Método de compatibilidade - conecta on-chain por padrão
  async connect(): Promise<Connection> {
    return await this.connectOnChain()
  }

  // onChain connection using Electrum protocol
  async connectOnChain(): Promise<Connection> {
    const socket = await connectElectrum()
    return socket
  }

  // Cria um LightningWorker completo para operações de carteira
  /**
   * Factory interna para criar instâncias de LightningWorker.
   *
   * IMPORTANTE: Este método deve ser usado APENAS internamente pelo WorkerService.
   * Para obter o worker Lightning da aplicação, use `lightningStore.getWorker()`.
   *
   * @internal Uso exclusivo do ln-worker-service.ts
   * @see docs/lightning-worker-consolidation-plan.md - Fase 1.4
   */
  async createLightningWorker(
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    peer?: Peer,
    peerPubKey?: Uint8Array,
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ): Promise<LightningWorker> {
    // ACINQ trampoline node - reliable for incoming connections
    const fallbackPeer: Peer = { host: '13.248.222.197', port: 9735 }
    const fallbackPeerPubKey = new Uint8Array([
      0x03, 0x93, 0x38, 0x84, 0xaa, 0xf1, 0xd6, 0xb1, 0x08, 0x39, 0x7e, 0x5e, 0xfe, 0x5c, 0x86,
      0xbc, 0xf2, 0xd8, 0xca, 0x8d, 0x2f, 0x70, 0x0e, 0xda, 0x99, 0xdb, 0x92, 0x14, 0xfc, 0x27,
      0x12, 0xb1, 0x34,
    ]) // ACINQ trampoline node pubkey
    const config: LightningClientConfig = {
      peer: peer || fallbackPeer,
      peerPubKey: peerPubKey || fallbackPeerPubKey,
    }

    return await LightningWorker.create(config, masterKey, network, channelFeeConfig)
  }
}

export const networkService = new NetworkService()
export default networkService
