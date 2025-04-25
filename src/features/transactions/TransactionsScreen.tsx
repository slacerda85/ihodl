import { useEffect, useState } from 'react'
import { Text, View, Pressable, FlatList } from 'react-native'
import { getTxHistory } from '@/lib/transactions'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { TxHistory } from '@/models/transaction'
import useStore from '../store'

export default function TransactionsScreen() {
  const { wallets, selectedWalletId } = useStore()
  const selectedWallet = wallets.find(wallet => wallet.walletId === selectedWalletId)
  const [txHistory, setTxHistory] = useState<TxHistory[]>([])

  useEffect(() => {
    async function fetchTxHistory() {
      if (!selectedWallet) {
        console.error('No selected wallet found')
        return
      }

      const { seedPhrase, accounts } = selectedWallet
      const entropy = fromMnemonic(seedPhrase)
      const extendedKey = createRootExtendedKey(entropy)
      const { purpose, coinType, accountIndex } = accounts[0]
      const { balance, utxos, txHistory } = await getTxHistory({
        extendedKey,
        purpose,
        coinType,
        accountStartIndex: accountIndex,
      })

      setTxHistory(txHistory)
    }

    fetchTxHistory()
  }, [selectedWallet, selectedWalletId])

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Transactions</Text>
      <FlatList
        data={txHistory.flatMap(item => item.txs)} // Flatten the txs array from each TxHistory object
        keyExtractor={item => item.txid}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              // Handle transaction press
            }}
            style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc' }}
          >
            <Text>{item.txid}</Text>
            <Text>{item.vout.flatMap(i => i.value)}</Text>
          </Pressable>
        )}
      />
    </View>
  )
}
