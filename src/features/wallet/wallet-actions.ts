import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import Wallet from '@/shared/lib/bitcoin/wallet/wallet'
import storage from '../storage'
import { randomUUID } from 'expo-crypto'

export async function createWallet(mnemonic?: string) {
  const newWallet = new Wallet(undefined, mnemonic)

  // create bip84 account node
  const accountNode = deriveFromPath(newWallet.privateKey, newWallet.chainCode, "m/84'/0'/0'")
  const account0 = deriveFromPath(accountNode.derivedKey, accountNode.derivedChainCode, '0/0')
  const account0Pubkey = createPublicKey(account0.derivedKey)
  const account0Address = serializePublicKeyForSegWit(account0Pubkey)

  // save wallet to storage
  await storage.setItem(`wallet_${randomUUID()}`, newWallet)

  return {
    mnemonic,
    accountNode,
    account0Pubkey,
    account0Address,
  }
}

async function getWallet(id: string): Promise<Wallet | undefined> {
  return storage.getItem<Wallet>(`wallet_${id}`)
}
