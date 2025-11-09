import colors from '@/ui/colors'
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native'

import { useCallback, useState } from 'react'
import { useRouter } from 'expo-router'
// import { deleteWallet } from '@/lib/wallet'
import { alpha } from '@/ui/utils'
import { useWallet } from '@/features/wallet'
import { useSettings } from '@/features/settings'
import Button from '@/ui/Button'

export default function DeleteWallet() {
  const { activeWalletId, wallets, unlinkWallet } = useWallet()
  const walletName = wallets.find(w => w.walletId === activeWalletId)?.walletName

  const router = useRouter()
  const { isDark } = useSettings()

  const [submitting, setSubmitting] = useState<boolean>(false)

  const handleDeleteWallet = useCallback(async () => {
    setSubmitting(true)
    if (activeWalletId) {
      await unlinkWallet(activeWalletId)
    }
    setSubmitting(false)
    setTimeout(() => router.dismiss(2), 0)
  }, [unlinkWallet, router, activeWalletId])

  if (!activeWalletId) return null

  return (
    <View style={styles.modalContainer}>
      <Text style={[styles.modalText, isDark && styles.modalTextDark]}>
        {`Unlink wallet "${walletName}" from this app?`}
      </Text>
      <Button
        onPress={handleDeleteWallet}
        disabled={activeWalletId == null || submitting}
        style={{
          backgroundColor: colors.error,
          padding: 16,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 12,
        }}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : null}
        <Text
          style={{
            color: colors.white,
            fontSize: 16,
            textAlign: 'center',
          }}
        >
          {submitting ? 'Deleting...' : 'Delete'}
        </Text>
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    padding: 16,
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
