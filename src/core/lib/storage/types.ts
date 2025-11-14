import { ElectrumPeer } from '../electrum/types'

export interface StorageData {
  trustedPeers?: ElectrumPeer[]
  lastPeerUpdate?: number | null
}
