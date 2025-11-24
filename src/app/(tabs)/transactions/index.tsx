import TransactionsScreen from '@/ui/features/transactions/TransactionsScreen'
import { View } from 'react-native'

export default function TransactionsRoute() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      <TransactionsScreen />
    </View>
  )
}
