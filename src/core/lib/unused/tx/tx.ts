import { FriendlyTx, Tx, FriendlyTxType, FriendlyTxStatus } from '@/core/models/transaction'
import { Utxo } from '@/core/models/transaction'
// import { WalletAccount } from '@/core/models/account'

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

/**
 * Deduplica transações por txid, mantendo a com mais confirmações.
 */
function deduplicateTxs(txs: Tx[]): Tx[] {
  const txMap = new Map<string, Tx>()
  txs.forEach(tx => {
    const existing = txMap.get(tx.txid)
    if (!existing || (tx.confirmations ?? 0) > (existing.confirmations ?? 0)) {
      txMap.set(tx.txid, tx)
    }
  })
  return Array.from(txMap.values())
}

/**
 * Remove endereços duplicados do array de endereços da carteira.
 */
function deduplicateAddresses(addresses: string[]): string[] {
  return Array.from(new Set(addresses))
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
 * Versão reescrita e otimizada para calcular o saldo da carteira.
 * Usa abordagem funcional moderna, processando UTXOs de forma eficiente.
 */
function calculateWalletBalance(
  allTransactions: Tx[],
  walletAddresses: Set<string>,
): {
  balance: number
  utxos: Utxo[]
} {
  // Deduplicar transações
  const uniqueTxs = deduplicateTxs(allTransactions)

  // Etapa 1: Coletar todas as chaves de UTXOs que foram gastos
  const spentUtxoKeys = new Set<string>()
  uniqueTxs.forEach(tx => {
    tx.vin.forEach(vin => {
      spentUtxoKeys.add(`${vin.txid}:${vin.vout}`)
    })
  })

  // Etapa 2: Coletar UTXOs não gastos da carteira
  const unspentUtxos = uniqueTxs.flatMap(tx =>
    tx.vout
      .map((vout, index) => ({
        key: `${tx.txid}:${index}`,
        utxo: {
          txid: tx.txid,
          vout: index,
          address: vout.scriptPubKey.address,
          scriptPubKey: vout.scriptPubKey,
          amount: vout.value,
          confirmations: tx.confirmations ?? 0,
          blocktime: tx.blocktime,
          isSpent: false,
        } as Utxo,
      }))
      .filter(({ key, utxo }) => walletAddresses.has(utxo.address) && !spentUtxoKeys.has(key))
      .map(({ utxo }) => utxo),
  )

  // Etapa 3: Calcular saldo total
  const balance = unspentUtxos.reduce((sum, utxo) => sum + utxo.amount, 0)

  return { balance, utxos: unspentUtxos }
}

export function getFriendlyTxs(addresses: string[], txs: Tx[], walletId: string): FriendlyTx[] {
  // Cria um mapa de todas as transações para acesso rápido por txid
  const allTxs = new Map<string, Tx>()
  // Conjunto de endereços da nossa carteira para verificação rápida
  const ourAddresses = new Set(deduplicateAddresses(addresses))

  // Mapeia todas as transações fornecidas
  txs.forEach(tx => {
    allTxs.set(tx.txid, tx)
  })

  // Lista para armazenar as transações amigáveis resultantes
  const friendlyTxs: FriendlyTx[] = []

  // Processa cada transação para extrair informações relevantes
  allTxs.forEach((tx, txid) => {
    // Valor total dos inputs que vêm dos nossos endereços
    let ourInputsValue = 0
    // Valor total de todos os inputs da transação (necessário para calcular a taxa)
    let totalInputsValue = 0
    // Endereços dos nossos inputs
    const ourInputAddresses: string[] = []
    // Endereços dos inputs externos
    const externalInputAddresses: string[] = []

    // Processa cada input da transação
    tx.vin.forEach(vin => {
      // Busca a transação anterior que criou este output
      const prevTx = allTxs.get(vin.txid)
      if (prevTx) {
        // Obtém o output específico referenciado pelo input
        const prevVout = prevTx.vout[vin.vout]
        if (prevVout && prevVout.scriptPubKey.address) {
          // Soma ao valor total dos inputs
          totalInputsValue += prevVout.value
          const prevAddr = prevVout.scriptPubKey.address
          // Verifica se o endereço é nosso
          if (ourAddresses.has(prevAddr)) {
            // Soma ao valor dos nossos inputs
            ourInputsValue += prevVout.value
            // Coleta o endereço do nosso input
            ourInputAddresses.push(prevAddr)
          } else {
            // Coleta o endereço do input externo
            externalInputAddresses.push(prevAddr)
          }
        }
      }
    })

    // Valor total dos outputs que vão para os nossos endereços
    let ourOutputsValue = 0
    // Endereços dos nossos outputs
    const ourOutputAddresses: string[] = []
    // Endereços dos outputs externos (destinos)
    const toAddresses: string[] = []

    // Processa cada output da transação
    tx.vout.forEach(vout => {
      const addr = vout.scriptPubKey.address
      if (addr) {
        // Verifica se o endereço é nosso
        if (ourAddresses.has(addr)) {
          // Soma ao valor dos nossos outputs
          ourOutputsValue += vout.value
          // Coleta o endereço do nosso output
          ourOutputAddresses.push(addr)
        } else {
          // Coleta o endereço do output externo
          toAddresses.push(addr)
        }
      }
    })

    // Calcula o valor líquido para a nossa carteira (outputs - inputs nossos)
    const net = ourOutputsValue - ourInputsValue
    // Determina o tipo da transação baseado no valor líquido
    let type: FriendlyTxType = net >= 0 ? 'received' : 'sent'
    // Valor absoluto do movimento (sempre positivo)
    let amount = Math.abs(net)
    // Se é uma transferência interna (inputs e outputs nossos, valor líquido zero), trata como 'sent'
    if (ourInputsValue > 0 && ourOutputsValue > 0 && net === 0) {
      type = 'sent' // Self-transfer, treat as sent.
    }

    // Determina o endereço de origem
    const fromAddress =
      ourInputsValue > 0 ? ourInputAddresses[0] || '' : externalInputAddresses[0] || 'Unknown'

    // Determina o endereço de destino
    const toAddress =
      ourInputsValue > 0
        ? toAddresses[0] || ourOutputAddresses[0] || ''
        : ourOutputAddresses[0] || ''

    // Calcula o valor total de todos os outputs da transação
    const totalOutputsValue = tx.vout.reduce((sum, vout) => sum + vout.value, 0)
    // Calcula a taxa da transação (inputs - outputs), apenas se houver inputs
    let fee: number | null = null
    if (totalInputsValue > 0) {
      fee = totalInputsValue - totalOutputsValue
    }

    // Número de confirmações da transação
    const confirmations = tx.confirmations ?? 0
    // Status da transação baseado nas confirmações
    const status = getTransactionStatus(tx, MINIMUM_CONFIRMATIONS)
    // Data da transação em formato ISO
    const date = new Date(tx.time * 1000).toISOString()

    // Adiciona a transação amigável à lista
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

  // Ordena as transações por data decrescente (mais recentes primeiro)
  friendlyTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return friendlyTxs
}

/**
 * Versão reescrita da função getFriendlyTxs com lógica corrigida e código mais limpo.
 * Calcula corretamente o amount como o valor transferido (sem incluir a taxa) e usa padrões modernos.
 */
export function getFriendlyTransactions(
  addresses: string[],
  txs: Tx[],
  walletId: string,
): FriendlyTx[] {
  // Deduplicar endereços para evitar cálculos errados por duplicatas
  const uniqueAddresses = deduplicateAddresses(addresses)

  // Conjunto para verificação rápida de endereços da carteira
  const addressSet = new Set(uniqueAddresses)

  // Deduplicar transações
  const uniqueTxs = deduplicateTxs(txs)

  // Mapa para acesso rápido às transações por txid (usando as únicas)
  const txMap = new Map(uniqueTxs.map(tx => [tx.txid, tx]))

  // Processa cada transação usando map para um estilo mais funcional
  const friendlyTxs = uniqueTxs.map(tx => {
    // Processa os inputs: calcula valores e classifica como nossos ou externos
    const inputs = tx.vin
      .map(vin => {
        const prevTx = txMap.get(vin.txid)
        if (!prevTx) return null
        const prevOut = prevTx.vout[vin.vout]
        if (!prevOut?.scriptPubKey.address) return null
        return {
          value: prevOut.value,
          address: prevOut.scriptPubKey.address,
          isOurs: addressSet.has(prevOut.scriptPubKey.address),
        }
      })
      .filter(Boolean) as { value: number; address: string; isOurs: boolean }[]

    // Valores totais dos inputs
    const totalInputValue = inputs.reduce((sum, i) => sum + i.value, 0)
    const ourInputValue = inputs.filter(i => i.isOurs).reduce((sum, i) => sum + i.value, 0)

    // Processa os outputs: calcula valores e classifica como nossos ou externos
    const outputs = tx.vout
      .map(vout => ({
        value: vout.value,
        address: vout.scriptPubKey.address,
        isOurs: vout.scriptPubKey.address ? addressSet.has(vout.scriptPubKey.address) : false,
      }))
      .filter(o => o.address)

    // Valores dos outputs
    const ourOutputValue = outputs.filter(o => o.isOurs).reduce((sum, o) => sum + o.value, 0)
    const externalOutputValue = outputs.filter(o => !o.isOurs).reduce((sum, o) => sum + o.value, 0)

    // Determina o tipo baseado nos inputs
    const isSent = ourInputValue > 0
    const type: FriendlyTxType = isSent ? 'sent' : 'received'

    // Amount: valor transferido externamente
    const amount = isSent ? externalOutputValue : ourOutputValue

    // Fee: apenas para pagamentos (sent), diferença total inputs - total outputs
    const totalOutputValue = outputs.reduce((sum, o) => sum + o.value, 0)
    const fee = isSent ? totalInputValue - totalOutputValue : null

    // Endereços
    const ourInputs = inputs.filter(i => i.isOurs)
    const externalInputs = inputs.filter(i => !i.isOurs)
    const externalOutputs = outputs.filter(o => !o.isOurs)

    const fromAddress = isSent
      ? ourInputs[0]?.address || ''
      : externalInputs[0]?.address || 'Unknown'
    const toAddress = isSent ? externalOutputs[0]?.address || '' : ourInputs[0]?.address || ''

    // Outros campos
    const confirmations = tx.confirmations ?? 0
    const status = getTransactionStatus(tx, MINIMUM_CONFIRMATIONS)
    const date = new Date(tx.time * 1000).toISOString()

    // Retorna o objeto FriendlyTx
    return {
      walletId,
      txid: tx.txid,
      date,
      type,
      fromAddress,
      toAddress,
      amount,
      status,
      fee,
      confirmations,
    }
  })

  // Ordena por data decrescente (mais recentes primeiro)
  return friendlyTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
