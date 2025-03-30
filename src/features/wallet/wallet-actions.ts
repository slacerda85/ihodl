import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import Wallet from '@/shared/lib/bitcoin/wallet/wallet'
import storage from '../storage'
import { randomUUID } from 'expo-crypto'
import {
  AddressType,
  WalletProtocol,
  addressTypePath,
  OnchainAddressType,
  // LightningAddressType,
} from './wallet-models'

// Types
interface CreateWalletProps {
  mnemonic?: string
  accounts?: Record<WalletProtocol, AddressType[]>
}

type Accounts = Record<WalletProtocol, AddressType[]>
type Addresses = Record<WalletProtocol, Partial<Record<AddressType, string>>>

interface DerivedKeyInfo {
  accountKey?: any
  accountPubkey?: any
  nodeKey?: any
  nodePubkey?: any
  channels?: any[]
  invoicePath?: string
}

// Default configurations
const defaultAccounts: Accounts = {
  onchain: ['bip84', 'bip86'],
  lightning: ['lightning-node'],
}

const defaultAddresses: Addresses = {
  onchain: { bip84: '', bip86: '' },
  lightning: { 'lightning-node': '' },
}

/**
 * Creates a new wallet with specified or default account types
 */
export async function createWallet(options?: CreateWalletProps) {
  const { mnemonic, accounts = defaultAccounts } = options || {}

  const newWallet = new Wallet(undefined, mnemonic)
  const walletId = randomUUID()
  const addresses: Addresses = JSON.parse(JSON.stringify(defaultAddresses))
  const derivedKeys: Record<string, DerivedKeyInfo> = {}

  // Process onchain addresses
  if (accounts.onchain?.length) {
    processOnchainAddresses(newWallet, accounts.onchain, addresses, derivedKeys)
  }

  // Process lightning addresses
  if (accounts.lightning?.length) {
    processLightningAddresses(newWallet, accounts.lightning, addresses, derivedKeys)
  }

  // Save wallet to storage
  await storage.setItem(`wallet_${walletId}`, newWallet)

  return {
    id: walletId,
    mnemonic: newWallet.mnemonic,
    addresses,
    derivedKeys,
  }
}

/**
 * Processes and derives onchain addresses based on provided address types
 */
function processOnchainAddresses(
  wallet: Wallet,
  addressTypes: AddressType[],
  addresses: Addresses,
  derivedKeys: Record<string, DerivedKeyInfo>,
): void {
  addressTypes
    .filter(
      (type): type is OnchainAddressType =>
        type !== 'lightning-node' && Object.keys(addressTypePath).includes(type),
    )
    .forEach(addressType => {
      const path = addressTypePath[addressType]

      const accountNode = deriveFromPath(wallet.privateKey, wallet.chainCode, path)
      const account0 = deriveFromPath(accountNode.derivedKey, accountNode.derivedChainCode, '0/0')
      const account0Pubkey = createPublicKey(account0.derivedKey)
      const address = serializePublicKeyForSegWit(account0Pubkey)

      addresses.onchain[addressType] = address
      derivedKeys[addressType] = {
        accountKey: account0,
        accountPubkey: account0Pubkey,
      }
    })
}

/**
 * Processes and derives lightning addresses and node configuration
 */
function processLightningAddresses(
  wallet: Wallet,
  addressTypes: AddressType[],
  addresses: Addresses,
  derivedKeys: Record<string, DerivedKeyInfo>,
): void {
  // Check if lightning-node is included in the requested address types
  if (!addressTypes.includes('lightning-node')) {
    return
  }

  // Lightning Network typically uses BIP32 derivation paths
  // Common path for Lightning: m/84'/0'/0'/1 for key-spend
  const lightningBasePath = "m/84'/0'/0'/1"
  const lightningNode = deriveFromPath(wallet.privateKey, wallet.chainCode, lightningBasePath)
  const nodePubkey = createPublicKey(lightningNode.derivedKey)

  // The node ID in Lightning is derived from the node's public key
  const nodeId = nodePubkey.toString()

  addresses.lightning['lightning-node'] = nodeId
  derivedKeys.lightning = {
    nodeKey: lightningNode,
    nodePubkey,
    channels: [],
    invoicePath: "m/84'/0'/0'/3", // Reserved path for invoice keys
  }
}

async function getWallet(id: string): Promise<Wallet | undefined> {
  return storage.getItem<Wallet>(`wallet_${id}`)
}

// Lightning Network helper functions that could be implemented
export async function createLightningInvoice(walletId: string, amount: number, memo?: string) {
  const wallet = await getWallet(walletId)
  if (!wallet) throw new Error('Wallet not found')

  // Implementation would depend on your Lightning implementation
  // This is just a placeholder for the structure
  return {
    paymentRequest: 'lnbc...',
    amount,
    memo,
    timestamp: Date.now(),
  }
}

export async function openLightningChannel(walletId: string, peerNodeId: string, amount: number) {
  // Implementation would depend on your Lightning implementation
  // This would handle opening a new payment channel with a peer
  return {
    channelId: 'channel-id-placeholder',
    peerNodeId,
    capacity: amount,
    status: 'opening',
  }
}
