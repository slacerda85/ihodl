import { Connection } from '@/core/models/network'
import { connect } from '@/core/lib/electrum'

interface NetworkServiceInterface {
  connect(): Promise<Connection>
}

class NetworkService implements NetworkServiceInterface {
  async connect(): Promise<Connection> {
    const socket = await connect()
    return socket
  }
}

export const networkService = new NetworkService()
export default networkService
