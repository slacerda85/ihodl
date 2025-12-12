import {
  ElectrumMethod,
  ElectrumResponse,
  GetHistoryResult,
  ElectrumPeer,
  GetMerkleResult,
} from './types'
import { JsonRpcRequest } from '../rpc'
import { randomUUID } from 'expo-crypto'
import { Tx } from '@/core/models/transaction'
import { fromBech32, toScriptHash /* legacyToScriptHash */ } from '@/core/lib/address'
import { initialPeers } from './constants'
import electrumRepository from '@/core/repositories/electrum'
import { sha256 } from '@noble/hashes/sha2.js'
import { hexToUint8Array, uint8ArrayToHex } from '../utils/utils'
import { createElectrumSocket } from '@/core/lib/network/socket'
import { Connection } from '@/core/models/network'
import { ConnectionOptions } from 'react-native-tcp-socket/lib/types/Socket'

// Connect to an Electrum server and return the socket
async function connect(): Promise<Connection> {
  console.log('[electrum] connecting Electrum peers...')
  const peers: ConnectionOptions[] = []
  // First try trusted peers
  const trustedPeers = readTrustedPeers()
  if (trustedPeers.length > 0) {
    peers.push(...trustedPeers)
  } else {
    // Fallback to initial peers
    peers.push(...initialPeers)
  }

  const randomPeers = peers.sort(() => Math.random() - 0.5) // Shuffle the peers array

  // Try each server in the peers list
  let attempt = 0
  for (const peer of randomPeers) {
    try {
      // Use TCP socket for Electrum (non-TLS)
      const socket = await createElectrumSocket({ host: peer.host!, port: peer.port! }, 10000)

      // test socket by requesting server version
      const response = await callElectrumMethod<string>('server.version', ['ihodl', '1.4'], socket)

      console.log(
        `[electrum] Connected to Electrum server ${peer.host}:${peer.port} - Version: ${response.result}`,
      )

      // If we reach here, connection was successful
      return socket
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      attempt++
      console.warn(`[electrum] Failed to connect to ${peer.host}:${peer.port}, ${error}`)
      // backoff before next attempt with exponential backoff, max delay, and jitter
      if (attempt < randomPeers.length) {
        const baseDelay = 1000 // 1 second base
        const maxDelay = 30000 // 30 seconds max
        const exponentialDelay = Math.pow(2, attempt) * baseDelay
        const delay = Math.min(exponentialDelay, maxDelay)
        const jitter = Math.random() * 0.1 * delay // 10% jitter to avoid thundering herd
        await new Promise(resolve => setTimeout(resolve, delay + jitter))
      }
    }
  }

  // If we've tried all peers and none worked
  throw new Error('[electrum] Failed to connect to any Electrum server')
}

// Close a socket connection
function close(socket: Connection): void {
  if (socket && !socket.destroyed) {
    socket.end()
    socket.destroy()
    // console.log('[electrum] Socket connection closed')
  }
}

/**
 * Gets available Electrum server peers from the network
 * @param socket Optional TLSSocket to reuse
 * @returns Array of Electrum peers
 */
async function getPeers(socket?: Connection): Promise<ElectrumPeer[]> {
  try {
    console.log('[electrum] Fetching peers from server')
    const response = await callElectrumMethod<ElectrumPeer[]>('server.peers.subscribe', [], socket)
    // console.log(`[electrum] Received ${response.result?.length || 0} peers`)

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
      const socket = await createElectrumSocket({ host: peer.host!, port: peer.port! }, 5000)

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
 * @returns Object with trustedPeers and lastPeerUpdate data, or null if no update needed
 */
async function updateTrustedPeers(): Promise<{
  trustedPeers: ElectrumPeer[]
  lastPeerUpdate: number
} | null> {
  let socket: Connection | null = null
  try {
    console.log('[electrum] Updating trusted peers...')

    // Get stored trusted peers first
    const storedTrustedPeers = readTrustedPeers()

    // If we have recent trusted peers (less than 24 hours old), use them
    if (storedTrustedPeers.length >= 3) {
      const lastUpdate = electrumRepository.getLastPeerUpdate()
      const hoursSinceUpdate = lastUpdate ? (Date.now() - lastUpdate) / (1000 * 60 * 60) : 25

      if (hoursSinceUpdate < 24) {
        return null
      }
    }

    // Connect to get a socket for fetching peers
    socket = await connect()

    // Fetch fresh peers from the network
    const networkPeers = await getPeers(socket)

    // Convert network peers to connection options
    const networkConnectionOptions = electrumRepository.peersToConnectionOptions(networkPeers)

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
      // Save to repository
      electrumRepository.saveTrustedPeers(electrumPeers)
      electrumRepository.setLastPeerUpdate(timestamp)
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
 * Read saved trusted Electrum peers from repository
 * @returns Array of trusted peers or empty array if none found
 */
function readTrustedPeers(): ConnectionOptions[] {
  try {
    const storedPeers = electrumRepository.getTrustedPeers()
    if (storedPeers.length > 0) {
      // Convert ElectrumPeer format back to ConnectionOptions
      return electrumRepository.peersToConnectionOptions(storedPeers)
    } else {
      console.log('[electrum] No trusted peers in storage, using initial peers')
      return []
    }
  } catch (error) {
    console.error('[electrum] Error reading trusted peers from storage:', error)
    return []
  }
}

// Generic function to make Electrum calls
async function callElectrumMethod<T>(
  method: ElectrumMethod,
  params: unknown[] = [],
  existingSocket?: Connection,
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

      const dataHandler = (data: string | Buffer) => {
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

      const closeHandler = (hadError: boolean) => {
        if (!buffer.trim()) {
          cleanup()
          reject(new Error('Conexão fechada sem resposta'))
        }
      }

      // Function to clean up event listeners and close socket if needed
      const cleanup = () => {
        socket.removeListener('data', dataHandler)
        socket.removeListener('error', errorHandler)
        socket.removeListener('close', closeHandler)

        // Only close if we created this socket
        if (managedSocket) {
          close(socket)
        }
      }

      // Set up event handlers
      socket.on('data', dataHandler)
      socket.on('error', errorHandler)
      socket.on('close', closeHandler)
    } catch (error) {
      reject(error)
    }
  })
}

// Specific method implementations
async function getAddressTxHistory(
  address: string,
  socket?: Connection,
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
  socket?: Connection,
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

async function getBlockHash(
  height: number,
  socket?: Connection,
): Promise<ElectrumResponse<string>> {
  try {
    const data = await callElectrumMethod<string>('blockchain.block.header', [height], socket)
    const headerHex = data.result
    if (!headerHex || headerHex.length !== 160) {
      throw new Error('Invalid header')
    }
    const headerBytes = hexToUint8Array(headerHex)
    const blockHash = uint8ArrayToHex(sha256(sha256(headerBytes)))
    return { ...data, result: blockHash }
  } catch (error) {
    console.error('Erro ao buscar hash do bloco:', error)
    throw error
  }
}

async function getBlockHeader(height: number, socket?: Connection): Promise<ElectrumResponse<any>> {
  try {
    const data = await callElectrumMethod<any>('blockchain.block.header', [height], socket)
    return data
  } catch (error) {
    console.error('Erro ao buscar header do bloco:', error)
    throw error
  }
}

async function getMerkleProof(
  txid: string,
  height: number,
  socket?: Connection,
): Promise<ElectrumResponse<GetMerkleResult>> {
  try {
    const data = await callElectrumMethod<GetMerkleResult>(
      'blockchain.transaction.get_merkle',
      [txid, height],
      socket,
    )
    return data
  } catch (error) {
    console.error('Erro ao buscar prova de Merkle:', error)
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
  socket?: Connection,
  minConfirmations = 1,
  batchSize = 10,
): Promise<Tx[]> {
  // const startTime = Date.now()
  // console.log(`[electrum] fetching txs for address: ${address}`)

  // Create a socket if not provided to reuse for multiple calls
  const managedSocket = !socket
  let usedSocket: Connection | null = null

  try {
    usedSocket = socket || (await connect())

    // fetch tx history
    const historyResponse = await getAddressTxHistory(address, usedSocket)
    const history = historyResponse.result || []

    if (!history.length) {
      // console.log(`[electrum] No txs found for address: ${address}`)
      return []
    }

    // Process transactions in batches to avoid overwhelming the connection
    const transactions: Tx[] = []
    const errors: { txHash: string; error: Error }[] = []

    // Process history in batches
    for (let i = 0; i < history.length; i += batchSize) {
      // const batchStartTime = Date.now()
      const batch = history.slice(i, i + batchSize)

      const results = await Promise.allSettled(
        batch.map(async ({ tx_hash, height }) => {
          try {
            const { result: tx } = await getTransaction(tx_hash, true, usedSocket!)
            if (!tx) {
              throw new Error('No transaction data received')
            }
            return {
              hash: tx_hash,
              data: {
                ...tx,
                height,
              },
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.warn(`[electrum] Failed to fetch transaction ${tx_hash}: ${errorMsg}`)
            throw err // Re-throw to mark as rejected in allSettled
          }
        }),
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
    }

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
  socket?: Connection,
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
async function getBalance(address: string, socket?: Connection): Promise<number> {
  const startTime = Date.now()
  console.log(`[electrum] Getting balance for address: ${address}`)

  // Create a socket if not provided to reuse for multiple calls
  const managedSocket = !socket
  let usedSocket: Connection | null = null

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
async function estimateFeeRate(targetBlocks: number = 6, socket?: Connection): Promise<number> {
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
async function getRecommendedFeeRates(socket?: Connection): Promise<{
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

async function getMempoolTransactions(addresses: string[], socket?: Connection): Promise<Tx[]> {
  const managedSocket = !socket
  let usedSocket: Connection | null = null

  try {
    usedSocket = socket || (await connect())

    const mempoolTxs: Tx[] = []

    // Filter valid addresses
    const validAddresses = addresses.filter(
      addr => typeof addr === 'string' && addr.trim().length > 0,
    )

    // Check each valid address for mempool transactions
    for (const address of validAddresses) {
      let scripthash: string

      try {
        scripthash = toScriptHash(address)
      } catch {
        // Skip addresses that can't be converted to scripthash
        continue
      }

      try {
        const mempoolData = await callElectrumMethod<
          { tx_hash: string; height: number; fee?: number }[]
        >('blockchain.scripthash.get_mempool', [scripthash], usedSocket)

        if (!mempoolData.result?.length) {
          continue
        }

        // Get full transaction data for each mempool tx
        for (const mempoolTx of mempoolData.result) {
          const txData = await getTransaction(mempoolTx.tx_hash, true, usedSocket)

          if (txData.result) {
            const tx = txData.result
            tx.confirmations = 0
            tx.blocktime = Math.floor(Date.now() / 1000)
            mempoolTxs.push(tx)
          }
        }
      } catch {
        // Skip failed address queries silently
        continue
      }
    }

    return mempoolTxs
  } finally {
    if (managedSocket && usedSocket) {
      try {
        close(usedSocket)
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Broadcast a raw transaction to the Bitcoin network
 * @param rawTxHex - Raw transaction hex string
 * @param socket - Optional TLSSocket to reuse
 * @returns Promise resolving to transaction ID
 */
async function broadcastTransaction(rawTxHex: string, socket?: Connection): Promise<string> {
  try {
    const data = await callElectrumMethod<string>(
      'blockchain.transaction.broadcast',
      [rawTxHex],
      socket,
    )
    return data.result!
  } catch (error) {
    console.error('Error broadcasting transaction:', error)
    throw error
  }
}

/**
 * Get the current block height from the Electrum server
 * @param socket Optional socket to reuse
 * @returns Current block height
 */
async function getCurrentBlockHeight(socket?: Connection): Promise<number> {
  try {
    const data = await callElectrumMethod<any>('blockchain.headers.subscribe', [], socket)
    const result = data.result

    if (typeof result?.height === 'number') {
      return result.height
    }

    if (Array.isArray(result) && typeof result[0] === 'number') {
      return result[0]
    }

    throw new Error('Unexpected Electrum height response')
  } catch (error) {
    console.error('Error getting current block height:', error)
    throw error
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
  getBlockHeader,
  getMerkleProof,
  getTransactions,
  getTransactionsMultipleAddresses,
  getBalance,
  updateTrustedPeers,
  convertToElectrumPeers,
  testPeers,
  estimateFeeRate,
  getRecommendedFeeRates,
  getMempoolTransactions,
  broadcastTransaction,
  getCurrentBlockHeight,
}
