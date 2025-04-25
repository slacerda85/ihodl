import colors from '@/shared/theme/colors'
import { Pressable, StyleSheet, Text, useColorScheme, View, ActivityIndicator } from 'react-native'

import { useCallback, useState } from 'react'
import { useRouter } from 'expo-router'
// import { deleteWallet } from '@/lib/wallet'
import { alpha } from '@/shared/theme/utils'
import useStore from '../store'

export default function DeleteWallet() {
  const { deleteWallet } = useStore()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { selectedWalletId /* revalidateWallets, revalidateSelectedWalletId */ } = useStore()
  const [submitting, setSubmitting] = useState<boolean>(false)

  const handleDeleteWallet = useCallback(async () => {
    try {
      setSubmitting(true)
      if (!selectedWalletId) return
      deleteWallet(selectedWalletId)
      // await revalidateWallets()
      // await revalidateSelectedWalletId()
      router.dismiss(2)
    } catch (error) {
      console.error('Error deleting wallet:', error)
    } finally {
      setSubmitting(false)
    }
  }, [deleteWallet, router, selectedWalletId])

  return (
    <View style={styles.modalContainer}>
      <Text style={[styles.modalText, isDark && styles.modalTextDark]}>
        Are you sure you want to delete this wallet?
      </Text>
      <Pressable
        style={[styles.button, styles.buttonFirst, styles.buttonLast, isDark && styles.buttonDark]}
        onPress={handleDeleteWallet}
      >
        {submitting ? <ActivityIndicator color={colors.error} /> : null}
        <Text
          style={{
            color: colors.error,
            fontSize: 16,
            textAlign: 'center',
          }}
        >
          {submitting ? 'Deleting...' : 'Delete'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalTitleDark: {
    color: colors.text.dark,
  },
  modalText: {
    fontSize: 18,
    marginBottom: 16,
  },
  modalTextDark: {
    color: colors.text.dark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    backgroundColor: colors.white,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  buttonFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  buttonLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
})
