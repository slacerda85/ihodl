import { Tx, UTXO } from './types'

/**
 * Calcula corretamente o saldo e UTXOs de uma carteira
 * seguindo o modelo UTXO do Bitcoin
 */
export function calculateWalletBalance(
  allTransactions: Tx[],
  walletAddresses: Set<string>,
): {
  balance: number
  utxos: UTXO[]
  spentUtxos: UTXO[]
} {
  const utxoMap = new Map<string, UTXO>()
  const spentUtxoKeys = new Set<string>()

  // Primeiro, identificar todos os UTXOs criados para endereços da carteira
  for (const tx of allTransactions) {
    for (const vout of tx.vout) {
      if (walletAddresses.has(vout.scriptPubKey.address)) {
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

/**
 * Determina os detalhes de uma transação (enviada/recebida/valor)
 * baseado no modelo UTXO correto
 */
export function analyzeTransaction(
  tx: Tx,
  walletAddresses: Set<string>,
  allTransactions: Tx[],
): {
  type: 'received' | 'sent' | 'self'
  netAmount: number
  totalInput: number
  totalOutput: number
  fee: number
  fromAddresses: string[]
  toAddresses: string[]
  walletAddresses: string[]
} {
  // Mapear transações por txid para lookup rápido
  const txMap = new Map<string, Tx>()
  for (const transaction of allTransactions) {
    txMap.set(transaction.txid, transaction)
  }

  // Calcular inputs da carteira
  let totalInputFromWallet = 0
  const fromAddresses: string[] = []

  for (const vin of tx.vin) {
    const prevTx = txMap.get(vin.txid)
    if (prevTx) {
      const prevVout = prevTx.vout[vin.vout]
      if (prevVout && walletAddresses.has(prevVout.scriptPubKey.address)) {
        totalInputFromWallet += prevVout.value
        if (!fromAddresses.includes(prevVout.scriptPubKey.address)) {
          fromAddresses.push(prevVout.scriptPubKey.address)
        }
      }
    }
  }

  // Calcular outputs para a carteira e externos
  let totalOutputToWallet = 0
  let totalOutputToExternal = 0
  const toWalletAddresses: string[] = []
  const toExternalAddresses: string[] = []

  for (const vout of tx.vout) {
    if (walletAddresses.has(vout.scriptPubKey.address)) {
      totalOutputToWallet += vout.value
      if (!toWalletAddresses.includes(vout.scriptPubKey.address)) {
        toWalletAddresses.push(vout.scriptPubKey.address)
      }
    } else {
      totalOutputToExternal += vout.value
      if (!toExternalAddresses.includes(vout.scriptPubKey.address)) {
        toExternalAddresses.push(vout.scriptPubKey.address)
      }
    }
  }

  // Determinar tipo de transação
  let type: 'received' | 'sent' | 'self'
  let netAmount: number

  if (totalInputFromWallet === 0 && totalOutputToWallet > 0) {
    // Recebida: sem inputs da carteira, mas com outputs para a carteira
    type = 'received'
    netAmount = totalOutputToWallet
  } else if (totalInputFromWallet > 0 && totalOutputToExternal === 0) {
    // Self-transfer: inputs da carteira, mas sem outputs externos
    type = 'self'
    netAmount = totalOutputToWallet - totalInputFromWallet // geralmente negativo (taxa)
  } else {
    // Enviada: inputs da carteira com outputs externos
    type = 'sent'
    netAmount = totalInputFromWallet - totalOutputToWallet // valor líquido enviado
  }

  // Calcular taxa aproximada (para transações enviadas)
  const totalInput = tx.vin.reduce((sum, vin) => {
    const prevTx = txMap.get(vin.txid)
    if (prevTx) {
      const prevVout = prevTx.vout[vin.vout]
      return sum + (prevVout?.value || 0)
    }
    return sum
  }, 0)

  const totalOutput = tx.vout.reduce((sum, vout) => sum + vout.value, 0)
  const fee = totalInput - totalOutput

  return {
    type,
    netAmount,
    totalInput: totalInputFromWallet,
    totalOutput: totalOutputToWallet,
    fee,
    fromAddresses,
    toAddresses: toExternalAddresses, // Sempre retorna endereços externos
    walletAddresses: toWalletAddresses, // Endereços da própria carteira
  }
}

/**
 * Processa todas as transações de uma carteira e retorna dados estruturados
 */
export function processWalletTransactions(allTransactions: Tx[], walletAddresses: Set<string>) {
  // Calcular saldo e UTXOs
  const { balance, utxos, spentUtxos } = calculateWalletBalance(allTransactions, walletAddresses)

  // Analisar cada transação
  const processedTransactions = allTransactions.map(tx => {
    const analysis = analyzeTransaction(tx, walletAddresses, allTransactions)
    return {
      tx,
      ...analysis,
    }
  })

  // Estatísticas
  const stats = {
    totalTransactions: allTransactions.length,
    receivedCount: processedTransactions.filter(t => t.type === 'received').length,
    sentCount: processedTransactions.filter(t => t.type === 'sent').length,
    selfCount: processedTransactions.filter(t => t.type === 'self').length,
    totalReceived: processedTransactions
      .filter(t => t.type === 'received')
      .reduce((sum, t) => sum + t.netAmount, 0),
    totalSent: processedTransactions
      .filter(t => t.type === 'sent')
      .reduce((sum, t) => sum + t.netAmount, 0),
  }

  return {
    balance,
    utxos,
    spentUtxos,
    transactions: processedTransactions,
    stats,
  }
}
