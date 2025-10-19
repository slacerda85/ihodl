import { TLSSocket, ConnectionOptions } from 'tls'
import net from 'net'
import { ElectrumMethod, ElectrumResponse, GetHistoryResult } from '@/models/electrum'
import { JsonRpcRequest } from '@/models/rpc'
import { randomUUID } from 'expo-crypto'
import { Tx } from '@/models/transaction'
import { fromBech32, toScriptHash, legacyToScriptHash } from '@/lib/address'
import { ElectrumPeer } from '@/models/electrum'

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

async function connect(state?: { electrum: { trustedPeers: ElectrumPeer[] } }): Promise<TLSSocket> {
  console.log('[electrum] connecting Electrum peers...')
  const peers: ConnectionOptions[] = []
  // First try trusted peers
  const trustedPeers = await readTrustedPeers(state)
  if (trustedPeers.length > 0) {
    console.log(`[electrum] Found ${trustedPeers.length} trusted peers`)
    peers.push(...trustedPeers)
  } else {
    // Fallback to initial peers
    peers.push(...initialPeers)
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
 * Convert trusted peers to ElectrumPeer format for storage
 * @param peers Array of trusted peers to convert
 * @returns Array of ElectrumPeer objects for storage
 */
function convertToElectrumPeers(peers: ConnectionOptions[]): ElectrumPeer[] {
  try {
    console.log(`[electrum] Converting ${peers.length} trusted peers to storage format`)
    // Convert ConnectionOptions to ElectrumPeer format for store
    const electrumPeers: ElectrumPeer[] = peers
      .filter(peer => peer.host && peer.port)
      .map(peer => [peer.host!, peer.host!, ['s', peer.port!.toString()]])
    return electrumPeers
  } catch (error) {
    console.error('[electrum] Error converting trusted peers to storage format:', error)
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
 * @param state Optional state to read current trusted peers and last update time
 * @returns Object with trustedPeers and lastPeerUpdate data, or null if no update needed
 */
async function updateTrustedPeers(state?: {
  electrum: { trustedPeers: ElectrumPeer[]; lastPeerUpdate: number | null }
}): Promise<{ trustedPeers: ElectrumPeer[]; lastPeerUpdate: number } | null> {
  let socket: TLSSocket | null = null
  try {
    console.log('[electrum] Updating trusted peers...')

    // Get stored trusted peers first
    const storedTrustedPeers = await readTrustedPeers(state)
    console.log(`[electrum] Found ${storedTrustedPeers.length} stored trusted peers`)

    // If we have recent trusted peers (less than 24 hours old), use them
    if (storedTrustedPeers.length >= 3) {
      const lastUpdate = await getLastPeerUpdateTime(state)
      const hoursSinceUpdate = lastUpdate ? (Date.now() - lastUpdate) / (1000 * 60 * 60) : 25

      if (hoursSinceUpdate < 24) {
        console.log(
          `[electrum] Using recent trusted peers (${hoursSinceUpdate.toFixed(1)} hours old)`,
        )
        return null
      }
    }

    // Connect to get a socket for fetching peers
    socket = await connect(state)
    console.log('[electrum] Connected to Electrum server for peer discovery')

    // Fetch fresh peers from the network
    const networkPeers = await getPeers(socket)
    console.log(`[electrum] Fetched ${networkPeers.length} peers from network`)

    // Convert network peers to connection options
    const networkConnectionOptions = peersToConnectionOptions(networkPeers)
    console.log(
      `[electrum] Converted ${networkConnectionOptions.length} network peers to connection options`,
    )

    // Combine all available peers, removing duplicates
    const allPeersSet = new Set<string>()
    const allPeers: ConnectionOptions[] = []

    // Add initial peers first
    initialPeers.forEach(peer => {
      const key = `${peer.host}:${peer.port}`
      if (!allPeersSet.has(key)) {
        allPeersSet.add(key)
        allPeers.push(peer)
      }
    })

    // Add stored trusted peers
    storedTrustedPeers.forEach(peer => {
      const key = `${peer.host}:${peer.port}`
      if (!allPeersSet.has(key)) {
        allPeersSet.add(key)
        allPeers.push(peer)
      }
    })

    // Add network peers
    networkConnectionOptions.forEach(peer => {
      const key = `${peer.host}:${peer.port}`
      if (!allPeersSet.has(key)) {
        allPeersSet.add(key)
        allPeers.push(peer)
      }
    })

    console.log(`[electrum] Total unique peers available: ${allPeers.length}`)

    // Prioritize testing: stored trusted peers first, then initial peers, then network peers
    const priorityPeers = [
      ...storedTrustedPeers,
      ...initialPeers.filter(
        peer => !storedTrustedPeers.some(tp => tp.host === peer.host && tp.port === peer.port),
      ),
      ...networkConnectionOptions.slice(0, 20), // Limit network peers to avoid too many tests
    ]

    // Remove duplicates from priority list
    const priorityPeersSet = new Set<string>()
    const uniquePriorityPeers = priorityPeers.filter(peer => {
      const key = `${peer.host}:${peer.port}`
      if (!priorityPeersSet.has(key)) {
        priorityPeersSet.add(key)
        return true
      }
      return false
    })

    // Test up to 15 peers (or all if less available)
    const peersToTest = uniquePriorityPeers.slice(0, 15)
    console.log(`[electrum] Selected ${peersToTest.length} peers to test for consistency`)

    // Test selected peers for consistency
    const trustedPeers = await testPeers(peersToTest)

    if (trustedPeers.length > 0) {
      const electrumPeers = convertToElectrumPeers(trustedPeers)
      const timestamp = Date.now()
      console.log(
        `[electrum] Prepared data for storage: ${trustedPeers.length} peers, timestamp: ${timestamp}`,
      )
      return { trustedPeers: electrumPeers, lastPeerUpdate: timestamp }
    } else {
      console.warn('[electrum] No trusted peers found, keeping existing')
      return null
    }
  } catch (error) {
    console.error('[electrum] Error updating trusted peers:', error)
    return null
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
 * Get the timestamp of the last peer update
 * @param state Optional state to read from store
 * @returns The timestamp or null if not found
 */
async function getLastPeerUpdateTime(state?: {
  electrum: { lastPeerUpdate: number | null }
}): Promise<number | null> {
  try {
    if (state) {
      return state.electrum.lastPeerUpdate
    } else {
      console.warn('[electrum] No state provided, cannot read last peer update time from store')
      return null
    }
  } catch (error) {
    console.error('[electrum] Error reading last peer update time:', error)
    return null
  }
}

/**
 * Read saved trusted Electrum peers from secure storage
 * @param state Optional state to read from store
 * @returns Array of trusted peers or empty array if none found
 */
async function readTrustedPeers(state?: {
  electrum: { trustedPeers: ElectrumPeer[] }
}): Promise<ConnectionOptions[]> {
  try {
    if (state) {
      // Convert ElectrumPeer format back to ConnectionOptions
      return state.electrum.trustedPeers.map(peer => ({
        host: peer[1], // hostname
        port: parseInt(
          peer[2].find(f => f.startsWith('s') || f.startsWith('t'))?.substring(1) || '50002',
        ),
        rejectUnauthorized: false,
      }))
    } else {
      console.warn('[electrum] No state provided, cannot read trusted peers from store')
      return []
    }
  } catch (error) {
    console.error('[electrum] Error reading trusted peers from storage:', error)
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
  minConfirmations = 1,
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
  minConfirmations = 1,
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

// Estimate fee rate for different confirmation targets
// Returns fee rate in sat/vB for the given number of blocks
async function estimateFeeRate(targetBlocks: number = 6, socket?: TLSSocket): Promise<number> {
  const startTime = Date.now()
  let usedSocket = socket
  const managedSocket = !socket

  try {
    usedSocket = socket || (await connect())
    console.log(
      `[electrum] Connected to Electrum server${managedSocket ? ' (new connection)' : ' (reusing connection)'}`,
    )

    console.log(`[electrum] Estimating fee rate for ${targetBlocks} block confirmation target`)

    // Use blockchain.estimatefee to get fee rate in BTC/kB
    const feeData = await callElectrumMethod<number>(
      'blockchain.estimatefee',
      [targetBlocks],
      usedSocket,
    )

    // Convert from BTC/kB to sat/vB
    // Electrum returns fee in BTC per kilobyte, we need satoshis per vbyte
    const feeBtcPerKb = feeData.result || 0.00001 // fallback to 1 sat/vB if no data
    const feeSatPerVb = Math.ceil((feeBtcPerKb * 100000000) / 1000) // BTC to sats, then /1000 for per vbyte

    // Ensure minimum fee rate of 1 sat/vB
    const finalFeeRate = Math.max(1, feeSatPerVb)

    console.log(`[electrum] Estimated fee rate: ${finalFeeRate} sat/vB for ${targetBlocks} blocks`)

    const totalTime = Date.now() - startTime
    console.log(`[electrum] estimateFeeRate completed in ${totalTime}ms`)

    return finalFeeRate
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[electrum] Error estimating fee rate: ${errorMsg}`, error)

    // Return a reasonable fallback fee rate
    const fallbackFeeRate = targetBlocks <= 1 ? 10 : targetBlocks <= 3 ? 5 : 2
    console.log(`[electrum] Using fallback fee rate: ${fallbackFeeRate} sat/vB`)
    return fallbackFeeRate
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

// Get recommended fee rates for different priority levels
async function getRecommendedFeeRates(socket?: TLSSocket): Promise<{
  slow: number
  normal: number
  fast: number
  urgent: number
}> {
  try {
    console.log('[electrum] Fetching recommended fee rates for all priorities')

    // Estimate fees for different confirmation targets
    const [slow, normal, fast, urgent] = await Promise.all([
      estimateFeeRate(144, socket), // ~24 hours (slow)
      estimateFeeRate(6, socket), // ~1 hour (normal)
      estimateFeeRate(2, socket), // ~20 minutes (fast)
      estimateFeeRate(1, socket), // ~10 minutes (urgent)
    ])

    const rates = { slow, normal, fast, urgent }
    console.log('[electrum] Recommended fee rates:', rates)

    return rates
  } catch (error) {
    console.error('[electrum] Error fetching recommended fee rates:', error)

    // Return conservative fallback rates
    return {
      slow: 1,
      normal: 2,
      fast: 5,
      urgent: 10,
    }
  }
}

async function getMempoolTransactions(addresses: string[]): Promise<Tx[]> {
  const socket = await connect()

  try {
    const mempoolTxs: Tx[] = []

    // Filter and validate addresses
    const validAddresses = addresses.filter(addr => {
      if (typeof addr !== 'string' || !addr.trim()) {
        console.warn('[electrum] Skipping invalid address:', addr)
        return false
      }
      return true
    })

    console.log(
      `[electrum] Processing ${validAddresses.length} valid addresses out of ${addresses.length} total`,
    )

    // Check each valid address for mempool transactions
    for (const address of validAddresses) {
      try {
        console.log(`[electrum] Checking mempool for address: ${address}`)

        let scripthash: string

        try {
          // Try toScriptHash first (works with Bech32 addresses)
          scripthash = toScriptHash(address)
        } catch (bech32Error) {
          try {
            // Fallback to legacyToScriptHash (for legacy P2PKH addresses)
            scripthash = legacyToScriptHash(address)
          } catch (legacyError) {
            console.warn(
              `[electrum] Failed to convert address ${address} to scripthash:`,
              bech32Error,
              legacyError,
            )
            continue
          }
        }

        console.log(`[electrum] Using scripthash: ${scripthash}`)

        // Get mempool transactions for this scripthash
        const mempoolData = await callElectrumMethod<
          { tx_hash: string; height: number; fee?: number }[]
        >('blockchain.scripthash.get_mempool', [scripthash], socket)

        if (mempoolData.result && mempoolData.result.length > 0) {
          console.log(`[electrum] Found ${mempoolData.result.length} mempool txs for ${address}`)
          // Get full transaction data for each mempool tx
          for (const mempoolTx of mempoolData.result) {
            try {
              const txData = await getTransaction(mempoolTx.tx_hash, true, socket)

              if (txData.result) {
                const tx = txData.result
                // Mark as unconfirmed (height = 0 for mempool)
                tx.confirmations = 0
                tx.blocktime = Math.floor(Date.now() / 1000) // Current time as blocktime
                mempoolTxs.push(tx)
              }
            } catch (error) {
              console.warn(`[electrum] Failed to get mempool tx ${mempoolTx.tx_hash}:`, error)
            }
          }
        } else {
          console.log(`[electrum] No mempool txs found for ${address}`)
        }
      } catch (error) {
        console.warn(`[electrum] Failed to get mempool for address ${address}:`, error)
      }
    }

    console.log(`[electrum] Total mempool transactions found: ${mempoolTxs.length}`)
    return mempoolTxs
  } finally {
    close(socket)
  }
}

export {
  connect,
  getPeers,
  readTrustedPeers,
  close,
  callElectrumMethod,
  getAddressTxHistory,
  getTransaction,
  getBlockHash,
  getTransactions,
  getTransactionsMultipleAddresses,
  getBalance,
  updateTrustedPeers,
  convertToElectrumPeers,
  testPeers,
  estimateFeeRate,
  getRecommendedFeeRates,
  getMempoolTransactions,
}
