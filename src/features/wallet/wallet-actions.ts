import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import Wallet from '@/shared/lib/bitcoin/wallet/wallet'
import storage from '../storage'
import { randomUUID } from 'expo-crypto'

export type AddressType = BitcoinAddressType | LightningAddressType
export type BitcoinAddressType = 'bip44' | 'bip49' | 'bip84' | 'bip86'
export type LightningAddressType = 'lightning-node'
export type WalletProtocol = 'onchain' | 'lightning'

interface WalletOptions {
  mnemonic?: string
  accounts?: Record<WalletProtocol, AddressType[]>
}

export async function createWallet(options: WalletOptions = {}) {
  const {
    mnemonic,
    accounts = { onchain: ['bip84', 'bip86'], lightning: ['lightning-node'] as AddressType[] },
  } = options

  const newWallet = new Wallet(undefined, mnemonic)
  const walletId = randomUUID()
  const addresses: Record<WalletProtocol, Record<AddressType, string>> = {} as any
  const derivedKeys: Record<string, any> = {}

  // Process Bitcoin on-chain addresses
  accounts['onchain'].forEach(addressType => {
    let path: string
    // let addressPrefix: string

    switch (addressType) {
      case 'bip44': // Legacy addresses (P2PKH)
        path = "m/44'/0'/0'"
        // addressPrefix = 'btc-legacy'
        break
      case 'bip49': // SegWit-compatible (P2SH-P2WPKH)
        path = "m/49'/0'/0'"
        // addressPrefix = 'btc-segwit-compat'
        break
      case 'bip84': // Native SegWit (P2WPKH)
        path = "m/84'/0'/0'"
        // addressPrefix = 'btc-segwit'
        break
      case 'bip86': // Taproot (P2TR)
        path = "m/86'/0'/0'"
        // addressPrefix = 'btc-taproot'
        break
      default:
        path = "m/84'/0'/0'"
      // addressPrefix = 'btc-segwit'
    }

    const accountNode = deriveFromPath(newWallet.privateKey, newWallet.chainCode, path)
    const account0 = deriveFromPath(accountNode.derivedKey, accountNode.derivedChainCode, '0/0')
    const account0Pubkey = createPublicKey(account0.derivedKey)
    const address = serializePublicKeyForSegWit(account0Pubkey)

    addresses['onchain'][addressType] = address
    derivedKeys[addressType] = {
      accountKey: account0,
      accountPubkey: account0Pubkey,
    }
  })

  // Initialize Lightning Network keys and configuration if requested
  if (accounts['lightning'].length > 0) {
    // Lightning Network typically uses BIP32 derivation paths
    // Common path for Lightning: m/84'/0'/0'/1 for key-spend and m/84'/0'/0'/2 for hash-spend
    const lightningBasePath = "m/84'/0'/0'/1"
    const lightningNode = deriveFromPath(
      newWallet.privateKey,
      newWallet.chainCode,
      lightningBasePath,
    )
    const nodePubkey = createPublicKey(lightningNode.derivedKey)

    // The node ID in Lightning is derived from the node's public key
    // This is a placeholder - actual implementation would depend on your Lightning library
    const nodeId = nodePubkey.toString()

    addresses['lightning']['lightning-node'] = nodeId
    derivedKeys['lightning'] = {
      nodeKey: lightningNode,
      nodePubkey,
      // Additional fields that might be needed for Lightning
      channels: [],
      // Reserved path for invoice keys (commonly m/84'/0'/0'/3)
      invoicePath: "m/84'/0'/0'/3",
    }
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
