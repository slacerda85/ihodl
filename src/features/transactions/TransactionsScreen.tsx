import { useState } from 'react'
import { Text, View, Pressable, FlatList } from 'react-native'
import useCache from '../cache'
import { useWallet } from '../wallet/WalletProvider'

export default function TransactionsScreen() {
  const { selectedWallet } = useWallet()
  const [selectedPurpose, setSelectedPurpose] = useState(84)

  const [selectedCoinType, setSelectedCoinType] = useState(0)

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Transactions</Text>
      {/* <FlatList
        data={txHistory}
        keyExtractor={(item) => item.txid}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              // Handle transaction press
            }}
            style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc' }}
          >
            <Text>{item.txid}</Text>
            <Text>{item.amount}</Text>
          </Pressable>
        )}
      /> */}
    </View>
  )
}
