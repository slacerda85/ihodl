import { View, StyleSheet } from 'react-native'
import Skeleton from '@/ui/components/Skeleton'

export default function LoadingWalletBalance() {
  return (
    <View style={styles.balanceSection}>
      <View style={styles.skeletonContainer}>
        <Skeleton height={30} width="50%" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  balanceSection: {
    paddingTop: 16,
    alignItems: 'center',
  },
  skeletonContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
})
