import { CoinType, Purpose } from '@/models/account'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  splitRootExtendedKey,
} from '@/lib/key'
import { connect, getTransactions } from './electrum'
import { createSegwitAddress } from './address'

import {
  MINIMUN_CONFIRMATIONS,
  TxHistory,
  UTXO,
  Tx,
  WalletTransaction,
  TransactionType,
  TransactionStatus,
} from '@/models/transaction'

interface GetTxHistoryParams {
  extendedKey: Uint8Array
  purpose?: Purpose
  coinType?: CoinType
  accountStartIndex?: number
  gapLimit?: number
}

interface GetTxHistoryResponse {
  txHistory: TxHistory[]
}

interface Vout {
  n: number
  value: number
  scriptPubKey: {
    address?: string
  }
}

interface Vin {
  txid: string
  vout: number
}

/**
 * Discovers addresses and txs based on account parameters.
 * @param extendedKey - The extended private key (bip32) to derive from.
 * @param purpose - The purpose of the account (default is 84 for Native SegWit).
 * @param coinType - The coin type of the account. Default is 0 (Bitcoin).
 * @param accountStartIndex - The starting account index (default is 0).
 * @param gapLimit - The gap limit for unused addresses (default is 20).
 * @returns An object containing the tx history.
 */
async function getTxHistory({
  extendedKey,
  purpose = 84,
  coinType = 0,
  accountStartIndex = 0,
  gapLimit = 20,
}: GetTxHistoryParams): Promise<GetTxHistoryResponse> {
  try {
    const txHistory: TxHistory[] = []

    // purpose
    const purposeIndex = createHardenedIndex(purpose)
    const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

    // coin type
    const coinTypeIndex = createHardenedIndex(coinType)
    const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

    // accountIndex
    const accountIndex = createHardenedIndex(accountStartIndex)
    const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)

    // receiving (change 0)
    const receivingIndex = 0
    const receivingExtendedKey = deriveChildPrivateKey(accountExtendedKey, receivingIndex)

    // change (change 1)
    const changeIndex = 1
    const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, changeIndex)

    // connect to electrum server
    const socket = await connect()

    // Scan receiving addresses
    const receivingTxHistory: TxHistory[] = []
    let consecutiveUnusedReceiving = 0
    let receivingIndexCount = 0
    while (consecutiveUnusedReceiving < gapLimit) {
      const addressIndexExtendedKey = deriveChildPrivateKey(
        receivingExtendedKey,
        receivingIndexCount,
      )
      const { privateKey } = splitRootExtendedKey(addressIndexExtendedKey)
      const addressIndexPublicKey = createPublicKey(privateKey)
      const receivingAddress = createSegwitAddress(addressIndexPublicKey)

      // Derive change address for the same index
      const changeAddressIndexExtendedKey = deriveChildPrivateKey(
        changeExtendedKey,
        receivingIndexCount,
      )
      const { privateKey: changePrivateKey } = splitRootExtendedKey(changeAddressIndexExtendedKey)
      const changeAddressIndexPublicKey = createPublicKey(changePrivateKey)
      const changeAddress = createSegwitAddress(changeAddressIndexPublicKey)

      const transactions = await getTransactions(receivingAddress, socket)
      if (transactions.length > 0) {
        receivingTxHistory.push({
          receivingAddress,
          changeAddress,
          index: receivingIndexCount,
          txs: transactions,
        })
        consecutiveUnusedReceiving = 0
      } else {
        consecutiveUnusedReceiving++
      }
      receivingIndexCount++
    }

    // Scan change addresses
    const changeTxHistory: TxHistory[] = []
    let consecutiveUnusedChange = 0
    let changeIndexCount = 0
    while (consecutiveUnusedChange < gapLimit) {
      const changeAddressIndexExtendedKey = deriveChildPrivateKey(
        changeExtendedKey,
        changeIndexCount,
      )
      const { privateKey: changePrivateKey } = splitRootExtendedKey(changeAddressIndexExtendedKey)
      const changeAddressIndexPublicKey = createPublicKey(changePrivateKey)
      const changeAddress = createSegwitAddress(changeAddressIndexPublicKey)

      const transactions = await getTransactions(changeAddress, socket)
      if (transactions.length > 0) {
        changeTxHistory.push({
          receivingAddress: '',
          changeAddress,
          index: changeIndexCount,
          txs: transactions,
        })
        consecutiveUnusedChange = 0
      } else {
        consecutiveUnusedChange++
      }
      changeIndexCount++
    }

    txHistory.push(...receivingTxHistory, ...changeTxHistory)

    return { txHistory }
  } catch (error) {
    throw new Error(`Failed to discover accounts: ${(error as Error).message}`)
  }
}

function calculateBalance(txHistory: TxHistory[]): {
  balance: number
  utxos: { address: string; utxos: UTXO[] }[]
} {
  const allTxs = new Map<string, Tx>()
  const ourAddresses = new Set<string>()
  const utxosByAddress = new Map<string, UTXO[]>()

  // Collect all addresses and transactions
  txHistory.forEach(history => {
    if (history.receivingAddress) ourAddresses.add(history.receivingAddress)
    if (history.changeAddress) ourAddresses.add(history.changeAddress)
    history.txs.forEach(tx => {
      allTxs.set(tx.txid, tx)
    })
  })

  // Initialize UTXO arrays for each address
  ourAddresses.forEach(addr => utxosByAddress.set(addr, []))

  let balance = 0

  allTxs.forEach((tx, txid) => {
    tx.vout.forEach(vout => {
      const addr = vout.scriptPubKey.address
      if (addr && ourAddresses.has(addr)) {
        const isSpent = Array.from(allTxs.values()).some(t =>
          t.vin.some(vin => vin.txid === txid && vin.vout === vout.n),
        )
        if (!isSpent) {
          const utxo: UTXO = {
            txid,
            vout: vout.n,
            address: addr,
            amount: vout.value,
            confirmations: tx.confirmations ?? 0,
            scriptPubKey: vout.scriptPubKey,
          }
          utxosByAddress.get(addr)!.push(utxo)
          balance += vout.value
        }
      }
    })
  })

  const utxos = Array.from(utxosByAddress, ([address, utxos]) => ({ address, utxos }))

  return { balance, utxos }
}

export type UIFriendlyTransaction = WalletTransaction & {
  fee: number | null
  confirmations: number | null
}

export async function getFriendlyTransactions(
  txHistory: TxHistory[],
  params: GetTxHistoryParams,
): Promise<UIFriendlyTransaction[]> {
  const allTxs = new Map<string, Tx>()
  const ourAddresses = new Set<string>()

  txHistory.forEach(history => {
    if (history.receivingAddress) ourAddresses.add(history.receivingAddress)
    if (history.changeAddress) ourAddresses.add(history.changeAddress)
    history.txs.forEach(tx => {
      allTxs.set(tx.txid, tx)
    })
  })

  const friendlyTxs: UIFriendlyTransaction[] = []

  allTxs.forEach((tx, txid) => {
    let ourInputsValue = 0
    let totalInputsValue = 0
    const ourInputAddresses: string[] = []
    const nonOurInputAddresses: string[] = []

    tx.vin.forEach(vin => {
      const prevTx = allTxs.get(vin.txid)
      if (prevTx) {
        const prevVout = prevTx.vout[vin.vout]
        if (prevVout && prevVout.scriptPubKey.address) {
          totalInputsValue += prevVout.value
          const prevAddr = prevVout.scriptPubKey.address
          if (ourAddresses.has(prevAddr)) {
            ourInputsValue += prevVout.value
            ourInputAddresses.push(prevAddr)
          } else {
            nonOurInputAddresses.push(prevAddr)
          }
        }
      }
    })

    let ourOutputsValue = 0
    const ourOutputAddresses: string[] = []
    const toAddresses: string[] = []
    let nonOurOutputsValue = 0

    tx.vout.forEach(vout => {
      const addr = vout.scriptPubKey.address
      if (addr) {
        if (ourAddresses.has(addr)) {
          ourOutputsValue += vout.value
          ourOutputAddresses.push(addr)
        } else {
          nonOurOutputsValue += vout.value
          toAddresses.push(addr)
        }
      }
    })

    const net = ourOutputsValue - ourInputsValue
    let type: TransactionType = net >= 0 ? 'received' : 'sent'
    let amount = Math.abs(net)
    if (ourInputsValue > 0 && ourOutputsValue > 0 && net === 0) {
      type = 'sent' // Self-transfer, treat as sent.
    }

    const fromAddress =
      ourInputsValue > 0 ? ourInputAddresses[0] || '' : nonOurInputAddresses[0] || 'Unknown'

    const toAddress =
      ourInputsValue > 0
        ? toAddresses[0] || ourOutputAddresses[0] || ''
        : ourOutputAddresses[0] || ''

    let fee: number | null = null
    if (ourInputsValue > 0) {
      const totalOutputsValue = ourOutputsValue + nonOurOutputsValue
      fee = totalInputsValue - totalOutputsValue
    }

    const confirmations = tx.confirmations ?? 0
    const status = getTransactionStatus(tx, MINIMUN_CONFIRMATIONS)
    const date = new Date(tx.time * 1000).toISOString()

    friendlyTxs.push({
      txid,
      date,
      type,
      fromAddress,
      toAddress,
      amount,
      status,
      fee,
      confirmations,
    })
  })

  // Sort by date descending (most recent first).
  friendlyTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return friendlyTxs
}

function isSpent(txHistory: Tx[], utxo: UTXO): boolean {
  return txHistory.some(tx => tx.vin.some(vin => vin.txid === utxo.txid && vin.vout === utxo.vout))
}

function isReceived(txHistory: Tx[], utxo: UTXO): boolean {
  return txHistory.some(tx =>
    tx.vout.some(vout => vout.n === utxo.vout && vout.scriptPubKey.address === utxo.address),
  )
}

function isChangeAddress(txHistory: Tx[], utxo: UTXO, changeAddress: string): boolean {
  return txHistory.some(tx =>
    tx.vout.some(vout => vout.scriptPubKey.address === changeAddress && vout.n === utxo.vout),
  )
}

function isConfirmed(tx: Tx, minConfirmations: number): boolean {
  return (tx.confirmations ?? 0) >= minConfirmations
}

function isPending(tx: Tx): boolean {
  return (tx.confirmations ?? 0) < 1
}

function isProcessing(tx: Tx): boolean {
  return (tx.confirmations ?? 0) > 0 && (tx.confirmations ?? 0) < 3
}

function getTransactionStatus(tx: Tx, minConfirmations: number): TransactionStatus {
  if (isConfirmed(tx, minConfirmations)) {
    return 'confirmed'
  } else if (isPending(tx)) {
    return 'pending'
  } else if (isProcessing(tx)) {
    return 'processing'
  }
  return 'unknown'
}

export { getTxHistory, calculateBalance }
