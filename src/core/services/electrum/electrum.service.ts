import tls, { ConnectionOptions, TLSSocket } from 'tls'
// import * as bitcoin from 'bitcoinjs-lib'
import { ElectrumMethod, ElectrumResponse, GetHistoryResult } from '@/core/models/electrum'
import { JsonRpcRequest } from '@/core/models/rpc'
import { randomUUID } from 'expo-crypto'
import { Tx } from '@/core/models/transaction'
import { addressToScriptHash } from '../../../shared/lib/bitcoin/address'

export const peers: ConnectionOptions[] = [
  { host: 'electrum.coinb.in', port: 50002, rejectUnauthorized: false },
  {
    host: 'electrumx.electricnewyear.net',
    port: 50002,
    rejectUnauthorized: false,
  },
  { host: 'guichet.centure.cc', port: 50002, rejectUnauthorized: false },
  { host: 'electrum1.bluewallet.io', port: 443, rejectUnauthorized: false },
  { host: 'electrum.blockchain.info', port: 50002, rejectUnauthorized: false },
]

export default class ElectrumService {
  // Connect to an Electrum server and return the socket
  static async connect(): Promise<TLSSocket> {
    let lastError: Error | null | unknown = null

    // Try connecting to peers one by one
    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i]
      console.log(
        `[ElectrumService] Attempting to connect to Electrum server: ${peer.host}:${peer.port} (${i + 1}/${peers.length})`,
      )

      try {
        // Create a promise for this specific connection attempt
        const socket = await new Promise<TLSSocket>((resolve, reject) => {
          const socket = tls.connect(peer, () => {
            console.log(`[ElectrumService] Connected to ${peer.host}:${peer.port}`)
            resolve(socket)
          })

          socket.on('error', err => {
            console.error(
              `[ElectrumService] Connection failed to ${peer.host}:${peer.port}: ${err.message}`,
            )
            if (!socket.destroyed) {
              socket.destroy()
            }
            reject(err)
          })
        })

        console.log(`[ElectrumService] Successfully connected to ${peer.host}:${peer.port}`)
        return socket
      } catch (error) {
        lastError = error
        // Continue to next peer
      }
    }

    // If we get here, all peers failed
    throw new Error(
      `Failed to connect to any Electrum server after trying all available peers. Last error: ${lastError || 'Unknown error'}`,
    )
  }

  // Close a socket connection
  static close(socket: TLSSocket): void {
    if (socket && !socket.destroyed) {
      socket.end()
    }
  }

  // Generic function to make Electrum calls
  static async callElectrumMethod<T>(
    method: ElectrumMethod,
    params: unknown[] = [],
    existingSocket?: TLSSocket,
  ): Promise<ElectrumResponse<T>> {
    const id = randomUUID()
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: id,
      method: method,
      params: params,
    }

    // Track if we created the socket or are using an existing one
    const managedSocket = !existingSocket

    return new Promise(async (resolve, reject) => {
      try {
        // Use provided socket or create a new one
        const socket = existingSocket || (await this.connect())

        socket.write(JSON.stringify(request) + '\n')

        let buffer = ''

        const dataHandler = (data: Buffer) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Mantém o restante no buffer

          lines.forEach(line => {
            if (line.trim()) {
              try {
                const response = JSON.parse(line)
                if (response.id === id) {
                  cleanup()

                  if (response.error) {
                    reject(new Error(response.error.message))
                  } else {
                    resolve(response)
                  }
                }
              } catch (e) {
                console.error('Erro ao parsear JSON:', line, e)
              }
            }
          })
        }

        const errorHandler = (err: Error) => {
          console.error(`Erro na conexão Electrum (${method}):`, err)
          cleanup()
          reject(err)
        }

        const endHandler = () => {
          if (!buffer.trim()) {
            cleanup()
            reject(new Error('Conexão fechada sem resposta'))
          }
        }

        // Function to clean up event listeners and close socket if needed
        const cleanup = () => {
          socket.removeListener('data', dataHandler)
          socket.removeListener('error', errorHandler)
          socket.removeListener('end', endHandler)

          // Only close if we created this socket
          if (managedSocket) {
            this.close(socket)
          }
        }

        // Set up event handlers
        socket.on('data', dataHandler)
        socket.on('error', errorHandler)
        socket.on('end', endHandler)
      } catch (error) {
        reject(error)
      }
    })
  }

  // Specific method implementations
  static async getAddressTxHistory(
    address: string,
    socket?: TLSSocket,
  ): Promise<ElectrumResponse<GetHistoryResult[]>> {
    try {
      const scripthash = addressToScriptHash(address)
      const data = await this.callElectrumMethod<GetHistoryResult[]>(
        'blockchain.scripthash.get_history',
        [scripthash],
        socket,
      )
      return data
    } catch (error) {
      console.error('Erro ao buscar histórico de transações do endereço:', error)
      throw error
    }
  }

  static async getTransaction(
    tx_hash: string,
    verbose: boolean = false,
    // blockHash?: string,
    socket?: TLSSocket,
  ): Promise<ElectrumResponse<Tx>> {
    try {
      const data = await this.callElectrumMethod<Tx>(
        'blockchain.transaction.get',
        [tx_hash, verbose],
        socket,
      )
      return data
    } catch (error) {
      console.error('Erro ao buscar saldo do endereço:', error)
      throw error
    }
  }

  static async getBlockHash(height: number, socket?: TLSSocket): Promise<ElectrumResponse<string>> {
    try {
      const data = await this.callElectrumMethod<string>(
        'blockchain.block.get_header',
        [height],
        socket,
      )
      return data
    } catch (error) {
      console.error('Erro ao buscar hash do bloco:', error)
      throw error
    }
  }
  /**
   * Get all transactions for an address with minimum confirmations
   * Uses parallel processing with controlled batch sizes for efficiency
   * @param address Bitcoin address to query
   * @param socket Optional TLSSocket to reuse
   * @param minConfirmations Minimum number of confirmations required (default: 3)
   * @param batchSize Number of transaction requests to process in parallel (default: 10)
   */
  static async getTransactions(
    address: string,
    socket?: TLSSocket,
    minConfirmations = 3,
    batchSize = 10,
  ): Promise<Tx[]> {
    const startTime = Date.now()
    console.log(`[ElectrumService] Getting transactions for address: ${address}`)

    // Create a socket if not provided to reuse for multiple calls
    const managedSocket = !socket
    let usedSocket: TLSSocket | null = null

    try {
      usedSocket = socket || (await this.connect())
      console.log(
        `[ElectrumService] Connected to Electrum server${managedSocket ? ' (new connection)' : ' (reusing connection)'}`,
      )

      // Get transaction history for address
      console.log(`[ElectrumService] Fetching transaction history for address: ${address}`)
      const historyResponse = await this.getAddressTxHistory(address, usedSocket)
      const history = historyResponse.result || []

      if (!history.length) {
        console.log(`[ElectrumService] No transaction history found for address: ${address}`)
        return []
      }

      console.log(
        `[ElectrumService] Found ${history.length} transactions in history, retrieving details...`,
      )

      // Process transactions in batches to avoid overwhelming the connection
      const transactions: Tx[] = []
      const errors: { txHash: string; error: Error }[] = []

      // Process history in batches
      for (let i = 0; i < history.length; i += batchSize) {
        const batchStartTime = Date.now()
        const batch = history.slice(i, i + batchSize)
        console.log(
          `[ElectrumService] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(history.length / batchSize)} (${batch.length} transactions)`,
        )

        const results = await Promise.allSettled(
          batch.map(({ tx_hash }) =>
            this.getTransaction(tx_hash, true, usedSocket!).then(response => ({
              hash: tx_hash,
              data: response.result,
            })),
          ),
        )

        // Process results from this batch
        results.forEach((result, index) => {
          const txHash = batch[index].tx_hash

          if (result.status === 'fulfilled') {
            const tx = result.value.data
            const confirmations = tx.confirmations || 0

            if (confirmations >= minConfirmations) {
              transactions.push(tx)
            } else {
              console.log(
                `[ElectrumService] Skipping transaction ${txHash} with only ${confirmations} confirmations`,
              )
            }
          } else {
            console.error(`[ElectrumService] Failed to fetch transaction ${txHash}:`, result.reason)
            errors.push({ txHash, error: result.reason })
          }
        })

        console.log(`[ElectrumService] Batch processed in ${Date.now() - batchStartTime}ms`)
      }

      const successRate = history.length
        ? ((history.length - errors.length) / history.length) * 100
        : 100
      console.log(
        `[ElectrumService] Processed ${history.length} transactions with ${errors.length} errors ` +
          `(${successRate.toFixed(2)}% success rate)`,
      )
      console.log(`[ElectrumService] Returning ${transactions.length} confirmed transactions`)

      if (errors.length > 0) {
        console.warn(
          `[ElectrumService] ${errors.length} transactions failed to fetch:`,
          errors.map(e => e.txHash).join(', '),
        )
      }

      const totalTime = Date.now() - startTime
      console.log(`[ElectrumService] getTransactions completed in ${totalTime}ms`)

      return transactions
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[ElectrumService] Error fetching transactions for address ${address}: ${errorMsg}`,
        error,
      )
      throw new Error(`Failed to fetch transactions: ${errorMsg}`)
    } finally {
      // Close socket if we created it
      if (managedSocket && usedSocket) {
        try {
          console.log('[ElectrumService] Closing managed socket connection')
          this.close(usedSocket)
        } catch (closeError) {
          console.error('[ElectrumService] Error closing socket:', closeError)
        }
      }
    }
  }

  static async getTransactionsMultipleAddresses(
    addresses: string[],
    socket?: TLSSocket,
    minConfirmations = 3,
  ): Promise<Tx[]> {
    const allTransactions: Tx[] = []

    for await (const address of addresses) {
      try {
        const transactions = await this.getTransactions(address, socket, minConfirmations)
        allTransactions.push(...transactions)
      } catch (error) {
        console.error(
          `[ElectrumService] Error fetching transactions for address ${address}:`,
          error,
        )
      }
    }

    return allTransactions
  }

  /**
   * Get balance for a Bitcoin address
   * Returns balance in BTC (not satoshis)
   * @param address Bitcoin address to query
   * @param socket Optional TLSSocket to reuse
   * @returns Promise with balance in BTC
   */
  static async getBalance(address: string, socket?: TLSSocket): Promise<number> {
    const startTime = Date.now()
    console.log(`[ElectrumService] Getting balance for address: ${address}`)

    // Create a socket if not provided to reuse for multiple calls
    const managedSocket = !socket
    let usedSocket: TLSSocket | null = null

    try {
      usedSocket = socket || (await this.connect())
      console.log(
        `[ElectrumService] Connected to Electrum server${managedSocket ? ' (new connection)' : ' (reusing connection)'}`,
      )

      // Get the scripthash for the address
      const scripthash = addressToScriptHash(address)
      console.log(`[ElectrumService] Converted address to scripthash: ${scripthash}`)

      // Use blockchain.scripthash.get_balance for direct balance calculation
      // This is more efficient than manually iterating through transactions
      console.log(`[ElectrumService] Fetching balance for scripthash: ${scripthash}`)
      const balanceData = await this.callElectrumMethod<{
        confirmed: number
        unconfirmed: number
      }>('blockchain.scripthash.get_balance', [scripthash], usedSocket)

      // Convert from satoshis to BTC
      const confirmedSats = balanceData.result?.confirmed || 0
      const unconfirmedSats = balanceData.result?.unconfirmed || 0
      const totalSats = confirmedSats + unconfirmedSats
      const balance = totalSats / 100000000

      console.log(
        `[ElectrumService] Balance retrieved: ${balance} BTC ` +
          `(${confirmedSats} confirmed sats, ${unconfirmedSats} unconfirmed sats)`,
      )

      const totalTime = Date.now() - startTime
      console.log(`[ElectrumService] getBalance completed in ${totalTime}ms`)

      return balance
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[ElectrumService] Error fetching balance for address ${address}: ${errorMsg}`,
        error,
      )
      throw new Error(`Failed to fetch balance: ${errorMsg}`)
    } finally {
      // Close socket if we created it
      if (managedSocket && usedSocket) {
        try {
          console.log('[ElectrumService] Closing managed socket connection')
          this.close(usedSocket)
        } catch (closeError) {
          console.error('[ElectrumService] Error closing socket:', closeError)
        }
      }
    }
  }
}
