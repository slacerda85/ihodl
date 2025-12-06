import { UnifiedTransactionsScreen } from '@/ui/features/transactions'
import { View } from 'react-native'

/**
 * Transactions Route
 *
 * Usa a tela unificada que suporta múltiplos ativos:
 * - Bitcoin On-chain
 * - Lightning Network
 * - RGB Assets (futuro)
 */
export default function TransactionsRoute() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, flex: 1 }}>
      <UnifiedTransactionsScreen />
    </View>
  )
}
