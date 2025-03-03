interface RpcConfig {
  host: string
  port: number
  user: string
  password: string
  timeout?: number
}

interface RpcRequest {
  method: string
  params?: any[]
}

class BitcoinRPC {
  private config: RpcConfig
  private id: number = 1

  constructor(config: RpcConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    }
  }

  private encodeToBase64(str: string): string {
    // Convert string to Uint8Array
    const encoder = new TextEncoder()
    const data = encoder.encode(str)

    // Base64 encoding table
    const b64Table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''

    // Process three bytes at a time
    for (let i = 0; i < data.length; i += 3) {
      const byte1 = data[i]
      const byte2 = data[i + 1]
      const byte3 = data[i + 2]

      result += b64Table[byte1 >> 2]
      result += b64Table[((byte1 & 3) << 4) | (byte2 >> 4)]
      result += i + 1 < data.length ? b64Table[((byte2 & 15) << 2) | (byte3 >> 6)] : '='
      result += i + 2 < data.length ? b64Table[byte3 & 63] : '='
    }

    return result
  }

  private getAuthHeader(): string {
    const credentials = `${this.config.user}:${this.config.password}`
    return `Basic ${this.encodeToBase64(credentials)}`
  }

  async call<T = any>(request: RpcRequest): Promise<T> {
    const { method, params = [] } = request

    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getAuthHeader(),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.id++,
          method,
          params,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(`Bitcoin RPC Error: ${JSON.stringify(data.error)}`)
      }

      return data.result
    } catch (error) {
      console.error(`Bitcoin RPC Error (${method}):`, error)
      throw error
    }
  }

  // Bitcoin RPC Methods
  async getBlockchainInfo(): Promise<any> {
    return this.call({ method: 'getblockchaininfo' })
  }

  async getBalance(address: string, minconf: number = 1): Promise<number> {
    return this.call({
      method: 'getreceivedbyaddress',
      params: [address, minconf],
    })
  }

  async importPublicKey(pubkey: string, label: string = ''): Promise<void> {
    return this.call({
      method: 'importpubkey',
      params: [pubkey, label],
    })
  }

  async listReceivedByAddress(address?: string): Promise<any> {
    const params: (number | boolean | string)[] = [1, true]
    if (address) params.push(address)

    return this.call({
      method: 'listreceivedbyaddress',
      params,
    })
  }

  async createWallet(walletName: string, disablePrivateKeys: boolean = false): Promise<any> {
    return this.call({
      method: 'createwallet',
      params: [walletName, disablePrivateKeys],
    })
  }

  async loadWallet(name: string): Promise<any> {
    return this.call({
      method: 'loadwallet',
      params: [name],
    })
  }

  async importDescriptors(descriptors: any[]): Promise<any> {
    return this.call({
      method: 'importdescriptors',
      params: [descriptors],
    })
  }
}

// Export configured instance
export const bitcoinRPC = new BitcoinRPC({
  host: process.env.BITCOIN_RPC_HOST || 'localhost',
  port: Number(process.env.BITCOIN_RPC_PORT) || 8332,
  user: process.env.BITCOIN_RPC_USER || 'user',
  password: process.env.BITCOIN_RPC_PASSWORD || 'password',
})

// Export class for custom instances
export { BitcoinRPC }
