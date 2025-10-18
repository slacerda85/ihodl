import { TLSSocket, ConnectionOptions } from 'tls'
import net from 'net'
import { ElectrumMethod, ElectrumResponse, GetHistoryResult } from '@/models/electrum'
import { JsonRpcRequest } from '@/models/rpc'
import { randomUUID } from 'expo-crypto'
import { Tx } from '@/models/transaction'
import { fromBech32, toScriptHash } from '@/lib/address'
import zustandStorage from '@/lib/storage'
import { ElectrumPeer } from '@/models/electrum'

// Storage key for peers
const PEERS_STORAGE_KEY = 'electrum_peers'
const TRUSTED_PEERS_STORAGE_KEY = 'trusted_electrum_peers'

export const initialPeers /*  */ = [
  { host: 'electrum1.bluewallet.io', port: 443, rejectUnauthorized: false },
  { host: 'guichet.centure.cc', port: 50002, rejectUnauthorized: false },
  /* { host: 'electrum.blockstream.info', port: 50002, rejectUnauthorized: false }, */
  { host: 'api.ordimint.com', port: 50002, rejectUnauthorized: false },
]

// Connect to an Electrum server and return the socket
async function init() {
  try {
    const unsecure = new net.Socket()
    const socket = new TLSSocket(unsecure, { rejectUnauthorized: false })

    return socket
  } catch (error) {
    console.error('Error initializing ElectrumService:', error)
    throw error
  }
}

async function connect(): Promise<TLSSocket> {
  console.log('[electrum] connecting Electrum peers...')
  const peers: ConnectionOptions[] = []
  // First try trusted peers
  const trustedPeers = await readTrustedPeers()
  if (trustedPeers.length > 0) {
    console.log(`[electrum] Found ${trustedPeers.length} trusted peers`)
    peers.push(...trustedPeers)
  } else {
    // Fallback to initial peers
    peers.push(...initialPeers)
  }
  // Also add any stored peers for discovery
  const storedPeers = await readPeers()
  if (storedPeers.length > 0) {
    console.log(`[electrum] Found ${storedPeers.length} stored peers`)
    const formattedPeers = peersToConnectionOptions(storedPeers)
    peers.push(...formattedPeers)
  }

  const randomPeers = peers.sort(() => Math.random() - 0.5) // Shuffle the peers array

  // Try each server in the peers list
  for (const peer of randomPeers) {
    try {
      console.log(`[electrum] peer ${peer.host}:${peer.port}`)

      // Initialize the socket
      const socket = await init()

      // Connect to the peer
      await new Promise<void>((resolve, reject) => {
        const errorHandler = (e: Error) => {
          console.warn(`[electrum] Connection error to ${peer.host}:${peer.port}:`, e)
          reject(e)
        }

        const { host, port } = peer as { host: string; port: number }

        socket.connect({ host, port }, () => {
          socket.removeListener('error', errorHandler)
          console.log(`[electrum] connected to ${peer.host}:${peer.port}`)
          resolve()
        })

        socket.on('error', errorHandler)
      })

      // If we reach here, connection was successful
      return socket
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      console.warn(`[electrum] Failed to connect to ${peer.host}:${peer.port}`)
      // Continue to the next peer
    }
  }

  // If we've tried all peers and none worked
  throw new Error('[electrum] Failed to connect to any Electrum server')
}

// Close a socket connection
function close(socket: TLSSocket): void {
  if (socket && !socket.destroyed) {
    socket.end()
    socket.destroy()
    console.log('[electrum] Socket connection closed')
  }
}

/**
 * Gets available Electrum server peers from the network
 * @param socket Optional TLSSocket to reuse
 * @returns Array of Electrum peers
 */
async function getPeers(socket?: TLSSocket): Promise<ElectrumPeer[]> {
  try {
    console.log('[electrum] Fetching peers from server')
    const response = await callElectrumMethod<ElectrumPeer[]>('server.peers.subscribe', [], socket)
    console.log(`[electrum] Received ${response.result?.length || 0} peers`)

    // filter peers with SSL (s) or TCP (t) support
    const filteredPeers = response.result?.filter(peer => {
      const features = peer[2]
      return features?.some(f => f.startsWith('s') || f.startsWith('t'))
    })

    return filteredPeers || []
  } catch (error) {
    console.error('[electrum] Error fetching peers:', error)
    throw error
  }
}

/**
 * Save trusted Electrum peers to secure storage
 * @param peers Array of trusted peers to save
 */
async function saveTrustedPeers(peers: ConnectionOptions[]): Promise<void> {
  try {
    console.log(`[electrum] Saving ${peers.length} trusted peers to storage`)
    const peersJson = JSON.stringify(peers)
    await zustandStorage.setItem(TRUSTED_PEERS_STORAGE_KEY, peersJson)
  } catch (error) {
    console.error('[electrum] Error saving trusted peers to storage:', error)
    throw error
  }
}

/**
 * Test peers for consistency by checking blockchain height
 * @param peers Array of peers to test
 * @returns Array of trusted peers that gave consistent responses
 */
async function testPeers(peers: ConnectionOptions[]): Promise<ConnectionOptions[]> {
  console.log(`[electrum] Testing ${peers.length} peers for consistency...`)

  const results: { peer: ConnectionOptions; height: number; error?: Error }[] = []

  // Test each peer concurrently
  const promises = peers.map(async peer => {
    try {
      const socket = await init()
      await new Promise<void>((resolve, reject) => {
        socket.connect({ host: peer.host!, port: peer.port! }, () => resolve())
        socket.on('error', reject)
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      })

      const response = await callElectrumMethod<{ height: number }>(
        'blockchain.headers.subscribe',
        [],
        socket,
      )
      const height = response.result?.height || 0

      close(socket)
      return { peer, height }
    } catch (error) {
      console.warn(`[electrum] Peer ${peer.host}:${peer.port} failed:`, error)
      return { peer, height: -1, error: error as Error }
    }
  })

  const testResults = await Promise.allSettled(promises)

  testResults.forEach(result => {
    if (result.status === 'fulfilled') {
      results.push(result.value)
    } else {
      console.error('[electrum] Test failed:', result.reason)
    }
  })

  // Group by height
  const heightGroups: { [height: number]: ConnectionOptions[] } = {}
  results.forEach(({ peer, height, error }) => {
    if (!error && height > 0) {
      if (!heightGroups[height]) heightGroups[height] = []
      heightGroups[height].push(peer)
    }
  })

  // Find the most common height
  let maxCount = 0
  let trustedPeers: ConnectionOptions[] = []
  for (const height in heightGroups) {
    const count = heightGroups[height].length
    if (count > maxCount && count >= 2) {
      // At least 2 peers agree
      maxCount = count
      trustedPeers = heightGroups[height]
    }
  }

  console.log(`[electrum] Found ${trustedPeers.length} trusted peers with consistent height`)
  return trustedPeers
}

/**
 * Update the list of trusted peers by testing available peers
 */
async function updateTrustedPeers(): Promise<void> {
  let socket: TLSSocket | null = null
  try {
    console.log('[electrum] Updating trusted peers...')

    // Connect to get a socket for fetching peers
    socket = await connect()
    console.log('[electrum] Connected to Electrum server for peer discovery')

    // Fetch fresh peers from the network
    const networkPeers = await getPeers(socket)
    console.log(`[electrum] Fetched ${networkPeers.length} peers from network`)

    // Convert network peers to connection options
    const networkConnectionOptions = peersToConnectionOptions(networkPeers)
    console.log(
      `[electrum] Converted ${networkConnectionOptions.length} network peers to connection options`,
    )

    // Get all available peers (initial + stored + network)
    const allPeers: ConnectionOptions[] = [...initialPeers, ...networkConnectionOptions]

    // Add stored peers if any
    const storedPeers = await readPeers()
    if (storedPeers.length > 0) {
      const storedConnectionOptions = peersToConnectionOptions(storedPeers)
      allPeers.push(...storedConnectionOptions)
      console.log(`[electrum] Added ${storedConnectionOptions.length} stored peers`)
    }

    console.log(`[electrum] Total peers to test: ${allPeers.length}`)

    // Test peers for consistency
    const trustedPeers = await testPeers(allPeers)

    if (trustedPeers.length > 0) {
      await saveTrustedPeers(trustedPeers)
      console.log(`[electrum] Updated trusted peers: ${trustedPeers.length} peers`)
    } else {
      console.warn('[electrum] No trusted peers found, keeping existing')
    }
  } catch (error) {
    console.error('[electrum] Error updating trusted peers:', error)
  } finally {
    // Close the socket
    if (socket) {
      try {
        close(socket)
      } catch (closeError) {
        console.error('[electrum] Error closing socket:', closeError)
      }
    }
  }
}

/**
 * Read saved trusted Electrum peers from secure storage
 * @returns Array of trusted peers or empty array if none found
 */
async function readTrustedPeers(): Promise<ConnectionOptions[]> {
  try {
    const peersJson = await zustandStorage.getItem(TRUSTED_PEERS_STORAGE_KEY)
    if (!peersJson) {
      console.log('[electrum] No trusted peers found in storage')
      return []
    }

    const peers = JSON.parse(peersJson) as ConnectionOptions[]
    console.log(`[electrum] Read ${peers.length} trusted peers from storage`)
    return peers
  } catch (error) {
    console.error('[electrum] Error reading trusted peers from storage:', error)
    return []
  }
}

/**
 * Read saved Electrum peers from secure storage
 * @returns Array of saved Electrum peers or empty array if none found
 */
async function readPeers(): Promise<ElectrumPeer[]> {
  try {
    const peersJson = await zustandStorage.getItem(PEERS_STORAGE_KEY)
    if (!peersJson) {
      console.log('[electrum] No peers found in storage')
      return []
    }

    const peers = JSON.parse(peersJson) as ElectrumPeer[]
    console.log(`[electrum] Read ${peers.length} peers from storage`)
    return peers
  } catch (error) {
    console.error('[electrum] Error reading peers from storage:', error)
    return []
  }
}

/**
 * Convert Electrum peer format to connection options
 */
function peersToConnectionOptions(peers: ElectrumPeer[]): {
  host: string
  port: number
  rejectUnauthorized: boolean
}[] {
  return peers
    .filter(peer => {
      const features = peer[2]
      // Filter peers with SSL (s) or TCP (t) support
      return features?.some(f => f.startsWith('s') || f.startsWith('t'))
    })
    .map(peer => {
      const host = peer[1] // Use hostname
      const features = peer[2]

      // Prefer SSL over TCP
      const sslFeature = features.find(f => f.startsWith('s'))
      const tcpFeature = features.find(f => f.startsWith('t'))

      // Extract port number
      let port = 50002 // Default SSL port
      if (sslFeature && sslFeature.length > 1) {
        port = parseInt(sslFeature.substring(1), 10)
      } else if (tcpFeature && tcpFeature.length > 1) {
        port = parseInt(tcpFeature.substring(1), 10)
      }

      return { host, port, rejectUnauthorized: false }
    })
}

/**
 * Update the active peers list with peers from storage
 */
/* async function refreshPeersList(): Promise<void> {
  try {
    const storedPeers = await readPeers()

    if (storedPeers?.length > 0) {
      const connectionOptions = peersToConnectionOptions(storedPeers)

      if (connectionOptions.length > 0) {
        // Update the module's peers array
        initialPeers.length = 0 // Clear existing peers
        connectionOptions.forEach(option => initialPeers.push(option))
        console.log(`[electrum] Refreshed active peers list with ${initialPeers.length} peers`)
      } else {
        console.warn('[electrum] No valid connection options found in stored peers')
      }
    } else {
      console.log('[electrum] No peers in storage to refresh from')
    }
  } catch (error) {
    console.error('[electrum] Error refreshing peers list:', error)
  }
} */

/**
 * Update peers list - fetches new peers and updates storage
 * @param socket Optional TLSSocket to reuse
 * @returns Array of updated peers
 */
/* async function updatePeers(socket?: TLSSocket): Promise<{ success: boolean }> {
  console.log('[electrum] Updating peer list')

  // Create a socket if not provided
  const managedSocket = !socket
  let usedSocket: TLSSocket | null = null

  try {
    usedSocket = socket || (await connect())
    const peers = await getPeers(usedSocket)

    if (peers.length > 0) {
      await savePeers(peers)
      // await refreshPeersList() // Update active peers list
      console.log(`[electrum] Successfully updated ${peers.length} peers`)
    } else {
      console.warn('[electrum] Received empty peer list, not updating storage')
    }

    return { success: true }
  } catch (error) {
    console.error('[electrum] Error updating peers:', error)
    throw error
  } finally {
    // Close socket if we created it
    if (managedSocket && usedSocket) {
      try {
        close(usedSocket)
      } catch (closeError) {
        console.error('[electrum] Error closing socket:', closeError)
      }
    }
  }
} */

// Generic function to make Electrum calls
async function callElectrumMethod<T>(
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
      const socket = existingSocket || (await connect())

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
          close(socket)
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
async function getAddressTxHistory(
  address: string,
  socket?: TLSSocket,
): Promise<ElectrumResponse<GetHistoryResult[]>> {
  try {
    const scripthash = toScriptHash(address)
    const data = await callElectrumMethod<GetHistoryResult[]>(
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

async function getTransaction(
  tx_hash: string,
  verbose: boolean = false,
  // blockHash?: string,
  socket?: TLSSocket,
): Promise<ElectrumResponse<Tx>> {
  try {
    const data = await callElectrumMethod<Tx>(
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

async function getBlockHash(height: number, socket?: TLSSocket): Promise<ElectrumResponse<string>> {
  try {
    const data = await callElectrumMethod<string>('blockchain.block.get_header', [height], socket)
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
async function getTransactions(
  address: string,
  socket?: TLSSocket,
  minConfirmations = 3,
  batchSize = 10,
): Promise<Tx[]> {
  // const startTime = Date.now()
  // console.log(`[electrum] fetching txs for address: ${address}`)

  // Create a socket if not provided to reuse for multiple calls
  const managedSocket = !socket
  let usedSocket: TLSSocket | null = null

  try {
    usedSocket = socket || (await connect())
    // Get transaction history for address

    const historyResponse = await getAddressTxHistory(address, usedSocket)
    const history = historyResponse.result || []

    if (!history.length) {
      // console.log(`[electrum] No txs found for address: ${address}`)
      return []
    }

    // console.log(`[electrum] Found ${history.length} txs, retrieving details...`)

    // Process transactions in batches to avoid overwhelming the connection
    const transactions: Tx[] = []
    const errors: { txHash: string; error: Error }[] = []

    // Process history in batches
    for (let i = 0; i < history.length; i += batchSize) {
      // const batchStartTime = Date.now()
      const batch = history.slice(i, i + batchSize)
      /* console.log(
        `[electrum] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(history.length / batchSize)} (${batch.length} transactions)`,
      ) */

      const results = await Promise.allSettled(
        batch.map(({ tx_hash }) =>
          getTransaction(tx_hash, true, usedSocket!).then(response => ({
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
              `[electrum] Skipping transaction ${txHash} with only ${confirmations} confirmations`,
            )
          }
        } else {
          console.error(`[electrum] Failed to fetch transaction ${txHash}:`, result.reason)
          errors.push({ txHash, error: result.reason })
        }
      })

      // console.log(`[electrum] Batch processed in ${Date.now() - batchStartTime}ms`)
    }

    /* const successRate = history.length
      ? ((history.length - errors.length) / history.length) * 100
      : 100
    console.log(
      `[electrum] Processed ${history.length} transactions with ${errors.length} errors ` +
        `(${successRate.toFixed(2)}% success rate)`,
    )
    console.log(`[electrum] Returning ${transactions.length} confirmed transactions`)

    if (errors.length > 0) {
      console.warn(
        `[electrum] ${errors.length} transactions failed to fetch:`,
        errors.map(e => e.txHash).join(', '),
      )
    }

    const totalTime = Date.now() - startTime
    console.log(`[electrum] getTransactions completed in ${totalTime}ms`) */

    return transactions
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(
      `[electrum] Error fetching transactions for address ${address}: ${errorMsg}`,
      error,
    )
    throw new Error(`Failed to fetch transactions: ${errorMsg}`)
  } finally {
    // Close socket if we created it
    if (managedSocket && usedSocket) {
      try {
        console.log('[electrum] Closing managed socket connection')
        close(usedSocket)
      } catch (closeError) {
        console.error('[electrum] Error closing socket:', closeError)
      }
    }
  }
}

async function getTransactionsMultipleAddresses(
  addresses: string[],
  socket?: TLSSocket,
  minConfirmations = 3,
): Promise<Tx[]> {
  const allTransactions: Tx[] = []

  for await (const address of addresses) {
    try {
      const transactions = await getTransactions(address, socket, minConfirmations)
      allTransactions.push(...transactions)
    } catch (error) {
      console.error(`[electrum] Error fetching transactions for address ${address}:`, error)
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
async function getBalance(address: string, socket?: TLSSocket): Promise<number> {
  const startTime = Date.now()
  console.log(`[electrum] Getting balance for address: ${address}`)

  // Create a socket if not provided to reuse for multiple calls
  const managedSocket = !socket
  let usedSocket: TLSSocket | null = null

  try {
    usedSocket = socket || (await connect())
    console.log(
      `[electrum] Connected to Electrum server${managedSocket ? ' (new connection)' : ' (reusing connection)'}`,
    )

    // Get the scripthash for the address
    const scripthash = fromBech32(address)
    console.log(`[electrum] Converted address to scripthash: ${scripthash}`)

    // Use blockchain.scripthash.get_balance for direct balance calculation
    // This is more efficient than manually iterating through transactions
    console.log(`[electrum] Fetching balance for scripthash: ${scripthash}`)
    const balanceData = await callElectrumMethod<{
      confirmed: number
      unconfirmed: number
    }>('blockchain.scripthash.get_balance', [scripthash], usedSocket)

    // Convert from satoshis to BTC
    const confirmedSats = balanceData.result?.confirmed || 0
    const unconfirmedSats = balanceData.result?.unconfirmed || 0
    const totalSats = confirmedSats + unconfirmedSats
    const balance = totalSats / 100000000

    console.log(
      `[electrum] Balance retrieved: ${balance} BTC ` +
        `(${confirmedSats} confirmed sats, ${unconfirmedSats} unconfirmed sats)`,
    )

    const totalTime = Date.now() - startTime
    console.log(`[electrum] getBalance completed in ${totalTime}ms`)

    return balance
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[electrum] Error fetching balance for address ${address}: ${errorMsg}`, error)
    throw new Error(`Failed to fetch balance: ${errorMsg}`)
  } finally {
    // Close socket if we created it
    if (managedSocket && usedSocket) {
      try {
        console.log('[electrum] Closing managed socket connection')
        close(usedSocket)
      } catch (closeError) {
        console.error('[electrum] Error closing socket:', closeError)
      }
    }
  }
}

export {
  connect,
  getPeers,
  readPeers,
  close,
  callElectrumMethod,
  getAddressTxHistory,
  getTransaction,
  getBlockHash,
  getTransactions,
  getTransactionsMultipleAddresses,
  getBalance,
  updateTrustedPeers,
}
