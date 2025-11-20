import { FriendlyTx, Tx, FriendlyTxType, FriendlyTxStatus } from '@/core/models/tx'
import { UTXO } from '@/lib/transactions'
import { WalletAccount } from '@/core/models/account'

const MINIMUM_CONFIRMATIONS = 6

function isConfirmed(tx: Tx, minConfirmations: number): boolean {
  return (tx.confirmations ?? 0) >= minConfirmations
}

function isPending(tx: Tx): boolean {
  return (tx.confirmations ?? 0) < 1
}

function isProcessing(tx: Tx): boolean {
  return (tx.confirmations ?? 0) > 0 && (tx.confirmations ?? 0) < 3
}

function getTransactionStatus(tx: Tx, minConfirmations: number): FriendlyTxStatus {
  if (isConfirmed(tx, minConfirmations)) {
    return 'confirmed'
  } else if (isPending(tx)) {
    return 'pending'
  } else if (isProcessing(tx)) {
    return 'processing'
  }
  return 'unknown'
}

export function getBalance(
  allTransactions: Tx[],
  walletAddresses: string[],
): {
  balance: number
  utxos: Tx[]
} {
  const addresses = new Set<string>(walletAddresses)
  const possibleUtxoKeys = new Set<string>()
  const spentUtxoKeys = new Set<string>()
  const txIdToTx = new Map<string, Tx>()
  const unspentTxIds = new Set<string>()

  // Primeiro, identificar todos os possíveis UTXOs criados para endereços da carteira
  for (const tx of allTransactions) {
    txIdToTx.set(tx.txid, tx)
    for (const vout of tx.vout) {
      if (addresses.has(vout.scriptPubKey.address)) {
        const utxoKey = `${tx.txid}:${vout.n}`
        possibleUtxoKeys.add(utxoKey)
      }
    }
  }

  // Segundo, marcar UTXOs que foram gastos
  for (const tx of allTransactions) {
    for (const vin of tx.vin) {
      const utxoKey = `${vin.txid}:${vin.vout}`
      if (possibleUtxoKeys.has(utxoKey)) {
        spentUtxoKeys.add(utxoKey)
      }
    }
  }

  // Calcular saldo e coletar txids de transações com UTXOs não gastos
  let balance = 0
  for (const utxoKey of possibleUtxoKeys) {
    if (!spentUtxoKeys.has(utxoKey)) {
      const [txid, voutStr] = utxoKey.split(':')
      const voutIndex = parseInt(voutStr, 10)
      const tx = txIdToTx.get(txid)
      if (tx) {
        const vout = tx.vout[voutIndex]
        balance += vout.value
        unspentTxIds.add(txid)
      }
    }
  }

  // Filtrar transações que têm UTXOs não gastos
  const utxos = Array.from(unspentTxIds)
    .map(txid => txIdToTx.get(txid)!)
    .filter(Boolean)

  return {
    balance,
    utxos,
  }
}

/**
 * Calcula corretamente o saldo e UTXOs de uma carteira
 * seguindo o modelo UTXO do Bitcoin
 */
export function calculateWalletBalance(accounts: WalletAccount[]): {
  balance: number
  utxos: UTXO[]
  spentUtxos: UTXO[]
} {
  const addresses = accounts.map(account => account.address)
  const allTransactions = accounts.flatMap(account => account.txs)

  const addressSet = new Set<string>(addresses)
  const utxoMap = new Map<string, UTXO>()
  const spentUtxoKeys = new Set<string>()

  // Primeiro, identificar todos os UTXOs criados para endereços da carteira
  for (const tx of allTransactions) {
    for (const vout of tx.vout) {
      if (addressSet.has(vout.scriptPubKey.address)) {
        const utxoKey = `${tx.txid}:${vout.n}`
        utxoMap.set(utxoKey, {
          txid: tx.txid,
          vout: vout.n,
          address: vout.scriptPubKey.address,
          value: vout.value,
          blocktime: tx.blocktime,
          confirmations: tx.confirmations || 0,
          isSpent: false,
          scriptPubKey: {
            asm: vout.scriptPubKey.asm,
            hex: vout.scriptPubKey.hex,
            reqSigs: vout.scriptPubKey.reqSigs,
            type: vout.scriptPubKey.type,
            address: vout.scriptPubKey.address,
            addresses: [vout.scriptPubKey.address],
          },
          // redeemScript: vout.redeemScript,
        })
      }
    }
  }

  // Segundo, marcar UTXOs que foram gastos
  for (const tx of allTransactions) {
    for (const vin of tx.vin) {
      const utxoKey = `${vin.txid}:${vin.vout}`
      if (utxoMap.has(utxoKey)) {
        spentUtxoKeys.add(utxoKey)
        const utxo = utxoMap.get(utxoKey)!
        utxo.isSpent = true
      }
    }
  }

  // Separar UTXOs gastos e não gastos
  const unspentUtxos: UTXO[] = []
  const spentUtxos: UTXO[] = []

  for (const utxo of utxoMap.values()) {
    if (utxo.isSpent) {
      spentUtxos.push(utxo)
    } else {
      unspentUtxos.push(utxo)
    }
  }

  // Calcular saldo total dos UTXOs não gastos
  const balance = unspentUtxos.reduce((sum, utxo) => sum + utxo.value, 0)

  return {
    balance,
    utxos: unspentUtxos,
    spentUtxos,
  }
}

export function getFriendlyTxs(addresses: string[], txs: Tx[], walletId: string): FriendlyTx[] {
  const allTxs = new Map<string, Tx>()
  const ourAddresses = new Set<string>()

  addresses.forEach(address => ourAddresses.add(address))
  txs.forEach(tx => {
    allTxs.set(tx.txid, tx)
  })

  const friendlyTxs: FriendlyTx[] = []

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
    let type: FriendlyTxType = net >= 0 ? 'received' : 'sent'
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
    const status = getTransactionStatus(tx, MINIMUM_CONFIRMATIONS)
    const date = new Date(tx.time * 1000).toISOString()

    friendlyTxs.push({
      walletId,
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
