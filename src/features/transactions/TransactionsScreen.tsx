import { Text, View, Pressable, FlatList } from 'react-native'
import useStore from '../store'

export default function TransactionsScreen() {
  const getTransactions = useStore(state => state.getTransactions)

  const txHistory = getTransactions()

  if (!txHistory) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No transactions found</Text>
      </View>
    )
  }

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
