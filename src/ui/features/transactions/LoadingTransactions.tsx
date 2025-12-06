import { View, Text, StyleSheet } from 'react-native'
import Skeleton from '@/ui/components/Skeleton'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'

interface LoadingTransactionsProps {
  isDark: boolean
  showTitle?: boolean
}

export default function LoadingTransactions({
  isDark,
  showTitle = true,
}: LoadingTransactionsProps) {
  return (
    <View>
      {showTitle && (
        <View style={{ paddingBottom: 8 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '600',
              color: alpha(colors.textSecondary.light, 0.7),
            }}
          >
            Transactions
          </Text>
        </View>
      )}
      {/* Fake date header */}
      <View style={[styles.dateContainer, isDark && styles.dateContainerDark]}>
        <Skeleton width={100} height={20} style={{ marginLeft: 8 }} />
      </View>
      {/* Fake transactions */}
      {Array.from({ length: 5 }).map((_, i) => (
        <View
          key={i}
          style={[styles.transactionPressable, isDark && styles.transactionsPressableDark]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Skeleton width={32} height={32} borderRadius={16} />
            <View>
              <Skeleton width={80} height={16} />
              <Skeleton width={120} height={14} style={{ marginTop: 4 }} />
            </View>
          </View>
          <Skeleton width={60} height={16} />
        </View>
      ))}
      {/* Another date header */}
      <View style={[styles.dateContainer, isDark && styles.dateContainerDark]}>
        <Skeleton width={100} height={20} style={{ marginLeft: 16, marginTop: 16 }} />
      </View>
      {/* More fake transactions */}
      {Array.from({ length: 3 }).map((_, i) => (
        <View
          key={`more-${i}`}
          style={[styles.transactionPressable, isDark && styles.transactionsPressableDark]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Skeleton width={32} height={32} borderRadius={16} />
            <View>
              <Skeleton width={80} height={16} />
              <Skeleton width={120} height={14} style={{ marginTop: 4 }} />
            </View>
          </View>
          <Skeleton width={60} height={16} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  dateContainer: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 16,
    backgroundColor: colors.background.light,
  },
  dateContainerDark: {
    backgroundColor: colors.background.dark,
  },
  transactionPressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.background.light,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  transactionsPressableDark: {
    backgroundColor: colors.background.dark,
    borderBottomColor: colors.border.dark,
  },
})
