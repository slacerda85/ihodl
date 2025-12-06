import { View, StyleSheet } from 'react-native'
import Skeleton from '@/ui/components/Skeleton'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'

interface UnifiedTransactionsLoadingProps {
  isDark: boolean
}

export default function UnifiedTransactionsLoading({ isDark }: UnifiedTransactionsLoadingProps) {
  return (
    <View style={styles.container}>
      {/* Header skeleton */}
      <View style={styles.header}>
        <Skeleton width={120} height={16} />
      </View>

      {/* Filter chips skeleton */}
      {/* <View style={styles.filtersContainer}>
        <View style={styles.chipRow}>
          <Skeleton width={80} height={32} borderRadius={16} />
          <Skeleton width={90} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
        </View>
      </View> */}

      {/* First date header */}
      <View style={[styles.dateContainer, isDark && styles.dateContainerDark]}>
        <Skeleton width={80} height={14} />
      </View>

      {/* Transaction items */}
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.transactionItem,
            isDark && styles.transactionItemDark,
            i === 0 && styles.first,
            i === 3 && styles.last,
          ]}
        >
          <View style={styles.transactionLeft}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={styles.transactionInfo}>
              <Skeleton width={70} height={16} />
              <Skeleton width={100} height={12} style={{ marginTop: 4 }} />
            </View>
          </View>
          <Skeleton width={80} height={16} />
        </View>
      ))}

      {/* Second date header */}
      <View style={[styles.dateContainer, isDark && styles.dateContainerDark, { marginTop: 16 }]}>
        <Skeleton width={80} height={14} />
      </View>

      {/* More transaction items */}
      {Array.from({ length: 3 }).map((_, i) => (
        <View
          key={`more-${i}`}
          style={[
            styles.transactionItem,
            isDark && styles.transactionItemDark,
            i === 0 && styles.first,
            i === 2 && styles.last,
          ]}
        >
          <View style={styles.transactionLeft}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={styles.transactionInfo}>
              <Skeleton width={70} height={16} />
              <Skeleton width={100} height={12} style={{ marginTop: 4 }} />
            </View>
          </View>
          <Skeleton width={80} height={16} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
  },
  filtersContainer: {
    paddingBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateContainer: {
    backgroundColor: colors.background.light,
    paddingVertical: 8,
  },
  dateContainerDark: {
    backgroundColor: colors.background.dark,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: alpha(colors.white, 0.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.textSecondary.light, 0.1),
  },
  transactionItemDark: {
    backgroundColor: alpha(colors.white, 0.08),
    borderBottomColor: alpha(colors.textSecondary.dark, 0.1),
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionInfo: {
    gap: 2,
  },
  first: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  last: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 0,
  },
})
