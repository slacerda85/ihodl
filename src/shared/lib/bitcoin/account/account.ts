import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import api from '@/shared/api'
import { Tx } from '@/core/models/transaction'
import ElectrumService from '@/core/services/electrum'

type AddressInfo = {
  index: number
  address: string
  txs?: Tx[] // Transactions associated with the address
}

export async function getAccountAddresses(
  accountNodePrivateKey: Uint8Array,
  accountNodeChainCode: Uint8Array,
  gapLimit: number = 20,
): Promise<{
  addresses: AddressInfo[]
}> {
  const addresses: AddressInfo[] = []

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
    addresses.push({
      index: i,
      address,
    })
  }

  return { addresses }
}

export type DiscoveredAccount = {
  purpose: number
  coinType: number
  accountIndex: number
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
  multiAccount = false,
  accountIndex = 0,
): Promise<DiscoverResponse> {
  const discoveredAccounts: DiscoveredAccount[] = []
  do {
    // derive account node
    // bip 44 levels: m / purpose' / coin_type' / account' / change / address_index
    const accountNode = deriveFromPath(
      privateKey,
      chainCode,
      `m/${purpose}'/${coinType}'/${accountIndex}'`,
    )

    async function scanChain(nodePrivateKey: Uint8Array, nodeChainCode: Uint8Array) {
      const chainNode = deriveFromPath(
        nodePrivateKey,
        nodeChainCode,
        '0', // 0 for receiving addresses
      )

      console.log('Scanning chain node:', chainNode)
      const discovered: DiscoveredAddressInfo[] = []
      let consecutiveUnused = 0
      let index = 0

      // connect to Electrum server
      // const socket = await ElectrumService.connect()

      /* if (!socket) {
        throw new Error('Failed to connect to Electrum server')
      } */

      // Continue scanning until we find gapLimit consecutive unused addresses
      while (consecutiveUnused < gapLimit) {
        const { derivedKey } = deriveFromPath(
          chainNode.derivedKey,
          chainNode.derivedChainCode,
          `${index}`,
        )
        const publicKey = createPublicKey(derivedKey)
        const address = serializePublicKeyForSegWit(publicKey)
        console.log(`Scanning address of index ${index}`, address)
        const transactions = await ElectrumService.getTransactions(address)
        // const transactions = await api.transactions.getTransactions(address)
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

      // socket.end()
      return discovered
    }
    const discoveredAddressInfo = await scanChain(
      accountNode.derivedKey,
      accountNode.derivedChainCode,
    )

    const hasTransactions = discoveredAddressInfo.some(info => info.txs.length > 0)

    if (hasTransactions) {
      discoveredAccounts.push({
        purpose,
        coinType,
        accountIndex,
        discovered: discoveredAddressInfo,
      })
      accountIndex++
    } else {
      // If no transactions were found, we can stop scanning further accounts
      console.log('No transactions found for account index:', accountIndex)
      break
    }
  } while (multiAccount)

  return { discoveredAccounts }
}

export async function newDiscover(
  privateKey: Uint8Array,
  chainCode: Uint8Array,
  purpose = 84,
  coinType = 0,
  gapLimit: number = 20,
  multiAccount = false,
  accountIndex = 0,
): Promise<DiscoverResponse> {
  const accountNode = deriveFromPath(
    privateKey,
    chainCode,
    `m/${purpose}'/${coinType}'/${accountIndex}'`,
  )

  const { addresses } = await getAccountAddresses(
    accountNode.derivedKey,
    accountNode.derivedChainCode,
    gapLimit,
  )

  const discovered: DiscoveredAddressInfo[] = []

  const transactions = await api.transactions.getTransactionsMultiple(
    addresses.toSorted(a => a.index).map(a => a.address),
  )
  addresses.forEach(({ address, index }) => {
    const txs = transactions.filter(tx =>
      tx.vout.some(vout => vout.scriptPubKey.address?.includes(address)),
    )
    if (txs.length > 0) {
      discovered.push({
        address,
        index,
        txs,
      })
    }
  })

  const hasTransactions = discovered.some(info => info.txs.length > 0)
  if (!hasTransactions) {
    return { discoveredAccounts: [] }
  }
  const discoveredAccounts: DiscoveredAccount[] = []

  discoveredAccounts.push({
    purpose,
    coinType,
    accountIndex,
    discovered,
  })
  return { discoveredAccounts }
}
