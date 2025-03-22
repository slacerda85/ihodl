import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key/key'
import { BitcoinRPC } from '../rpc'

type ListReceivedByAddressResponse = {
  address: string
  amount: number
  confirmations: number
  label: string
  txids: string[]
}

export async function discover(
  privateKey: Buffer,
  chainCode: Buffer,
  purpose = 84,
  coinType = 0,
  gapLimit: number = 20,
) {
  const accounts = []
  let accountIndex = 0

  while (true) {
    // derive first account node
    const accountNode = deriveFromPath(
      privateKey,
      chainCode,
      `${purpose}'/${coinType}'/${accountIndex}'/0`,
    )
    // derive external chain node
    const externalChainNode = deriveFromPath(
      accountNode.derivedKey,
      accountNode.derivedChainCode,
      `0`,
    ) // this turns previous "m/84'/0'/0'/0" into "m/84'/0'/0'/0/0"

    // scan addresses of the external chain
    let usedAddresses = 0
    for (let i = 0; i < gapLimit; i++) {
      const { derivedKey } = deriveFromPath(
        externalChainNode.derivedKey,
        externalChainNode.derivedChainCode,
        `${i}`,
      )

      const publicKey = createPublicKey(derivedKey)
      const address = serializePublicKeyForSegWit(publicKey)

      // Simulate checking for transactions (replace with actual transaction check)
      const hasTransactions = await checkForTransactions(address)

      if (hasTransactions) {
        usedAddresses++
      } else {
        break
      }
    }

    if (usedAddresses === 0) {
      break
    }

    accounts.push({
      accountIndex,
      usedAddresses,
    })

    accountIndex++
  }

  return accounts
}

async function checkForTransactions(address: string): Promise<boolean> {
  const rpc = new BitcoinRPC({
    host: process.env.RPC_HOST as string,
    port: Number(process.env.RPC_PORT),
    user: process.env.RPC_USER as string,
    password: process.env.RPC_PASSWORD as string,
  })
  const list = await rpc.listReceivedByAddress(address)

  return list.length > 0
}

export async function getBalance(address: string): Promise<number> {
  const balance = await getBalance(address)
  return balance
}

export async function getBalancesPerAddress(
  privateKey: Buffer,
  chainCode: Buffer,
  purpose = 84,
  coinType = 0,
  gapLimit = 20,
): Promise<Record<string, number>> {
  const balances: Record<string, number> = {}
  let accountIndex = 0

  while (true) {
    const accountNode = deriveFromPath(
      privateKey,
      chainCode,
      `${purpose}'/${coinType}'/${accountIndex}'`,
    )

    const externalChainNode = deriveFromPath(
      accountNode.derivedKey,
      accountNode.derivedChainCode,
      `0`,
    )

    let usedAddresses = 0
    for await (const addressIndex of Array.from({ length: gapLimit }, (_, i) => i)) {
      const { derivedKey } = deriveFromPath(
        externalChainNode.derivedKey,
        externalChainNode.derivedChainCode,
        `${addressIndex}`,
      )

      const publicKey = createPublicKey(derivedKey)
      const address = serializePublicKeyForSegWit(publicKey)

      const balance = await getBalance(address)
      if (balance > 0) {
        balances[address] = balance
        usedAddresses++
      }
    }

    if (usedAddresses === 0) {
      break
    }

    accountIndex++
  }

  return balances
}

export async function getReceivedByAddress(
  privateKey: Buffer,
  chainCode: Buffer,
  purpose = 84,
  coinType = 0,
  gapLimit = 20,
): Promise<ListReceivedByAddressResponse[]> {
  const balances: ListReceivedByAddressResponse[] = []
  let accountIndex = 0

  while (true) {
    const accountNode = deriveFromPath(
      privateKey,
      chainCode,
      `${purpose}'/${coinType}'/${accountIndex}'`,
    )

    const externalChainNode = deriveFromPath(
      accountNode.derivedKey,
      accountNode.derivedChainCode,
      `0`,
    )

    let usedAddresses = 0
    for (let addressIndex = 0; addressIndex < gapLimit; addressIndex++) {
      const { derivedKey } = deriveFromPath(
        externalChainNode.derivedKey,
        externalChainNode.derivedChainCode,
        `${addressIndex}`,
      )

      const publicKey = createPublicKey(derivedKey)
      const address = serializePublicKeyForSegWit(publicKey)

      // create HD wallet in rpc
      const walletName = 'hd_wallet'

      const rpc = new BitcoinRPC({
        host: process.env.RPC_HOST as string,
        port: Number(process.env.RPC_PORT),
        user: process.env.RPC_USER as string,
        password: process.env.RPC_PASSWORD as string,
      })

      // create wallet
      await rpc.createWallet(walletName, true)

      const list = await rpc.listReceivedByAddress(address)
      if (list.length > 0) {
        balances.push(...list)
        usedAddresses++
      }
    }

    if (usedAddresses === 0) {
      break
    }

    accountIndex++
  }

  return balances
}
