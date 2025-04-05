import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import api from '@/shared/api'
import { Tx } from '@/shared/models/transaction'

export async function getAccountAddresses(
  accountNodePrivateKey: Uint8Array,
  accountNodeChainCode: Uint8Array,
  gapLimit: number = 20,
): Promise<{ receiving: string[]; change: string[] }> {
  const receiving: string[] = []
  const change: string[] = []

  // derive external chain node (for receiving addresses)
  const externalChainNode = deriveFromPath(accountNodePrivateKey, accountNodeChainCode, `0`)

  // generate receiving addresses up to gap limit
  for (let i = 0; i < gapLimit; i++) {
    const { derivedKey } = deriveFromPath(
      externalChainNode.derivedKey,
      externalChainNode.derivedChainCode,
      `${i}`,
    )

    const publicKey = createPublicKey(derivedKey)
    const address = serializePublicKeyForSegWit(publicKey)
    receiving.push(address)
  }

  // derive internal chain node (for change addresses)
  const internalChainNode = deriveFromPath(accountNodePrivateKey, accountNodeChainCode, `1`)

  // generate change addresses up to gap limit
  for (let i = 0; i < gapLimit; i++) {
    const { derivedKey } = deriveFromPath(
      internalChainNode.derivedKey,
      internalChainNode.derivedChainCode,
      `${i}`,
    )

    const publicKey = createPublicKey(derivedKey)
    const address = serializePublicKeyForSegWit(publicKey)
    change.push(address)
  }

  return { receiving, change }
}

export type DiscoveredAccount = {
  index: number
  discovered: DiscoveredAddressInfo[]
}

type DiscoveredAddressInfo = {
  address: string
  index: number
  txs: Tx[] // Transactions associated with the address
}

export type DiscoverResponse = {
  discoveredAccounts: DiscoveredAccount[]
}

export async function discover(
  privateKey: Uint8Array,
  chainCode: Uint8Array,
  purpose = 84,
  coinType = 0,
  gapLimit: number = 20,
): Promise<DiscoverResponse> {
  console.log('discover function called...')
  const discoveredAccounts: DiscoveredAccount[] = []
  let accountIndex = 0

  while (true) {
    console.log('Entered discover loop for Account:', accountIndex)
    // derive account node
    // bip 44 levels: m / purpose' / coin_type' / account' / change / address_index
    const accountNode = deriveFromPath(
      privateKey,
      chainCode,
      `m/${purpose}'/${coinType}'/${accountIndex}'`,
    )

    const scanChain = async (nodePrivateKey: Uint8Array, nodeChainCode: Uint8Array) => {
      const chainNode = deriveFromPath(
        nodePrivateKey,
        nodeChainCode,
        '0', // 0 for receiving addresses
      )

      console.log('Scanning chain node:', chainNode)
      const discovered: DiscoveredAddressInfo[] = []
      let consecutiveUnused = 0
      let index = 0

      // Continue scanning until we find gapLimit consecutive unused addresses
      while (consecutiveUnused < gapLimit) {
        console.log('Entered while consecutiveUnused < gapLimit:', consecutiveUnused)
        const { derivedKey } = deriveFromPath(
          chainNode.derivedKey,
          chainNode.derivedChainCode,
          `${index}`,
        )

        const publicKey = createPublicKey(derivedKey)
        const address = serializePublicKeyForSegWit(publicKey)

        console.log(`Scanning address of index ${index}`, address)
        const transactions = await api.transactions.getTransactions(address)
        console.log(`Transactions for address ${address}:`, transactions)
        if (transactions.length > 0) {
          console.log(`Found transactions for address ${address}`)
          discovered.push({
            address,
            index,
            txs: transactions, // Store transactions associated with the address
          })
          // Reset consecutive unused counter when we find a used address
          consecutiveUnused = 0
        } else {
          consecutiveUnused++
        }

        index++
      }

      return discovered
    }

    console.log('Scanning chain for account index:', accountIndex)
    const discoveredAddressInfo = await scanChain(
      accountNode.derivedKey,
      accountNode.derivedChainCode,
    )
    console.log('Discovered address info:', discoveredAddressInfo)
    const hasTransactions = discoveredAddressInfo.some(info => info.txs.length > 0)

    if (hasTransactions) {
      discoveredAccounts.push({
        index: accountIndex,
        discovered: discoveredAddressInfo,
      })
      accountIndex++
    } else {
      // If no transactions were found, we can stop scanning further accounts
      console.log('No transactions found for account index:', accountIndex)
      break
    }
  }

  return { discoveredAccounts }
}
