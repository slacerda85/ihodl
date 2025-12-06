import colors from '@/ui/colors'
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native'

import { useCallback, useState } from 'react'
import { useRouter } from 'expo-router'
import { alpha } from '@/ui/utils'
import { useWallet } from '@/ui/features/wallet'
import { useSettings } from '@/ui/features/settings'
import Button from '@/ui/components/Button'
import { useActiveWallet, useWalletActions } from './WalletProviderV2'

export default function DeleteWallet() {
  const { deleteWallet } = useWalletActions()
  const activeWallet = useActiveWallet()

  const router = useRouter()
  const { isDark } = useSettings()

  const [submitting, setSubmitting] = useState<boolean>(false)

  const handleDeleteWallet = useCallback(() => {
    setSubmitting(true)
    if (activeWallet?.id) {
      deleteWallet(activeWallet.id)
    }
    setSubmitting(false)
    router.dismiss(2)
  }, [deleteWallet, router, activeWallet])

  if (!activeWallet) return null

  return (
    <View style={styles.modalContainer}>
      <Text style={[styles.modalText, isDark && styles.modalTextDark]}>
        {`Unlink wallet "${activeWallet.name}" from this app?`}
      </Text>
      <Button
        variant="solid"
        onPress={handleDeleteWallet}
        disabled={activeWallet == null || submitting}
        backgroundColor={colors.error}

        // style={[styles.button, isDark && styles.buttonDark]}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : null}
        <Text
          style={{
            // color: colors.white,
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
    backgroundColor: colors.error,
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
