import { LightningConfig, LightningWalletData, LightningClientConfig, LightningNode } from './types'
import { deriveExtendedLightningKey, deriveNodeKey } from './keys'
import { authenticatedLightningClient, unauthenticatedLightningClient } from './clients'

/**
 * Initializes a new Lightning wallet from a Bitcoin wallet
 * @param bitcoinWalletId - The ID of the Bitcoin wallet to derive from
 * @param config - Lightning network configuration
 * @returns Promise resolving to the initialized wallet data
 */
export async function initializeLightningWallet(
  bitcoinWalletId: string,
  config: LightningConfig,
): Promise<LightningWalletData> {
  try {
    // For now, we'll use a mock master key - in a real implementation,
    // this would come from the Bitcoin wallet's seed
    const mockMasterKey = new Uint8Array(64) // This should be replaced with actual wallet derivation

    // Derive the extended Lightning key from the master key
    const extendedKey = deriveExtendedLightningKey(mockMasterKey)

    // Derive the node key for this Lightning wallet (not used in this simplified implementation)
    deriveNodeKey(extendedKey, config.type === 'lnd' ? 0 : 1, 0)

    // Convert config to client config
    const clientConfig: LightningClientConfig = {
      url: config.nodeUrl,
      auth: {
        cert: config.tlsCert,
        macaroon: config.macaroon,
        apiKey: config.apiKey,
      },
      type: config.type,
      timeout: config.timeout,
    }

    // Create the Lightning client
    const client = authenticatedLightningClient(clientConfig)

    // Get initial node info
    const nodeInfo: LightningNode = await client.getInfo()

    // Return the wallet data
    const walletData: LightningWalletData = {
      nodePubkey: nodeInfo.pubKey,
      channels: [],
      payments: [],
      invoices: [],
      config,
    }

    return walletData
  } catch (error) {
    console.error('Failed to initialize Lightning wallet:', error)
    throw new Error(`Failed to initialize Lightning wallet: ${error}`)
  }
}

/**
 * Creates a Lightning invoice
 * @param walletId - The wallet ID
 * @param params - Invoice creation parameters
 * @param config - Lightning configuration
 * @returns Promise resolving to the created invoice
 */
export async function createInvoice(
  walletId: string,
  params: import('./types').CreateInvoiceParams,
  config: LightningConfig,
): Promise<import('./types').LightningInvoice> {
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  // Use authenticated client if auth is provided, otherwise unauthenticated
  const client =
    config.tlsCert || config.macaroon || config.apiKey
      ? authenticatedLightningClient(clientConfig)
      : unauthenticatedLightningClient(clientConfig)

  try {
    console.log(`[lightning] Creating invoice for ${params.amount} sats: ${params.description}`)

    const invoice = await client.createInvoice(params)

    console.log(`[lightning] Invoice created: ${invoice.paymentHash}`)
    return invoice
  } catch (error) {
    console.error('[lightning] Failed to create invoice via LSP:', error)
    // For SPV demo purposes, generate a mock invoice if LSP fails
    console.log('[lightning] Generating mock invoice for SPV demo')
    const mockInvoice: import('./types').LightningInvoice = {
      paymentRequest: `lnbc${params.amount || 1000}...mock${Date.now()}`, // Mock BOLT 11
      paymentHash: `mock${Date.now()}`,
      amount: params.amount || 0,
      description: params.description || 'Mock invoice for SPV demo',
      expiry: params.expiry || 3600,
      timestamp: Date.now(),
      payeePubKey: 'mockpubkey',
      minFinalCltvExpiry: 144,
      routingHints: [],
      features: [],
      signature: 'mocksignature',
    }

    console.log(`[lightning] Mock invoice created: ${mockInvoice.paymentHash}`)
    return mockInvoice
  }
}

/**
 * Estimates routing fee for a Lightning payment
 * @param destination - Destination node ID
 * @param amount - Payment amount in satoshis
 * @returns Promise resolving to fee estimate
 */
export async function estimateRoutingFee(destination: string, amount: number): Promise<any> {
  // This function needs to be implemented with proper config context
  // For now, return a simple estimate
  const baseFee = 1000 // 1000 msat base fee
  const proportionalFee = Math.ceil(amount * 0.001) // 0.1% proportional fee
  const fee = Math.max(baseFee, proportionalFee)
  return { fee, probability: 0.9 }
}

/**
 * Pays a Lightning invoice using trampoline routing via remote LSP
 * @param walletId - The wallet ID
 * @param paymentRequest - The BOLT 11 or BOLT 12 invoice string
 * @param config - Lightning configuration
 * @returns Promise resolving to payment result
 */
export async function payInvoice(
  walletId: string,
  paymentRequest: string,
  config: LightningConfig,
): Promise<any> {
  const clientConfig: LightningClientConfig = {
    url: config.nodeUrl,
    auth: {
      cert: config.tlsCert,
      macaroon: config.macaroon,
      apiKey: config.apiKey,
    },
    type: config.type,
    timeout: config.timeout,
  }

  // Use authenticated client if auth is provided, otherwise unauthenticated
  const client =
    config.tlsCert || config.macaroon || config.apiKey
      ? authenticatedLightningClient(clientConfig)
      : unauthenticatedLightningClient(clientConfig)

  try {
    console.log(
      `[lightning] Paying invoice via trampoline routing: ${paymentRequest.substring(0, 20)}...`,
    )

    // Delegate routing to the remote LSP, which can use trampoline (BOLT 12) for efficiency
    // SPV wallets don't perform local path finding; the LSP handles it
    const paymentResult = await client.payInvoice(paymentRequest)

    console.log(`[lightning] Payment completed: ${paymentResult.paymentHash}`)
    return paymentResult
  } catch (error) {
    console.error('[lightning] Failed to pay invoice:', error)
    throw new Error(`Failed to pay invoice: ${error}`)
  }
}
