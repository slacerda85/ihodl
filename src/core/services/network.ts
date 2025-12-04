import { Connection, Peer } from '@/core/models/network'
import { connect as connectElectrum } from '@/core/lib/electrum'
import { LightningClientConfig, ChannelOpeningFeeConfig } from '@/core/models/lightning/client'
import LightningWorker from '@/core/lib/lightning/worker'

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
  async createLightningWorker(
    masterKey: Uint8Array,
    network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
    peer?: Peer,
    peerPubKey?: Uint8Array,
    channelFeeConfig?: ChannelOpeningFeeConfig,
  ): Promise<LightningWorker> {
    const config: LightningClientConfig = {
      peer: peer || { host: '127.0.0.1', port: 9735 },
      peerPubKey,
    }

    return await LightningWorker.create(config, masterKey, network, channelFeeConfig)
  }
}

export const networkService = new NetworkService()
export default networkService
