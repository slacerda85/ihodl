import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import Wallet from '@/shared/lib/bitcoin/wallet/wallet'

export function createWallet(mnemonic?: string) {
  const newWallet = new Wallet(undefined, mnemonic)

  // create bip84 account node
  const accountNode = deriveFromPath(newWallet.privateKey, newWallet.chainCode, "m/84'/0'/0'")
  const account0 = deriveFromPath(accountNode.derivedKey, accountNode.derivedChainCode, '0/0')
  const account0Pubkey = createPublicKey(account0.derivedKey)
  const account0Address = serializePublicKeyForSegWit(account0Pubkey)

  return {
    mnemonic,
    accountNode,
    account0Pubkey,
    account0Address,
  }
}
