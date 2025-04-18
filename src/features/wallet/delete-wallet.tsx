import colors from '@/shared/theme/colors'
import { Button, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { useWallet } from './wallet-provider'
import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { alpha } from '@/shared/theme/utils'
import { deleteWallet } from '@/lib/wallet'

export default function DeleteWallet() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { wallets, selectedWalletId, setSelectedWalletId } = useWallet()

  const handleDeleteWallet = useCallback(async () => {
    await deleteWallet(selectedWalletId)
    setSelectedWalletId(wallets[0].walletId ?? '')
    router.dismiss(2)
  }, [router, selectedWalletId, setSelectedWalletId, wallets])

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalWrapper}>
        <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
          <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>Delete wallet</Text>
          <Text style={[styles.modalText, isDark && styles.modalTextDark]}>
            Are you sure you want to delete this wallet?
          </Text>
          <View style={styles.modalActions}>
            <Button title="Delete" onPress={handleDeleteWallet} />
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    // paddingBottom: 48,
    backgroundColor: alpha(colors.background.dark, 0.8),
  },
  modalWrapper: {
    padding: 16,
    // backgroundColor: colors.black,
    borderRadius: 8,
  },
  modalContent: {
    // width: '90%',
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  modalContentDark: {
    backgroundColor: alpha(colors.white, 0.1),
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
    marginBottom: 16,
  },
  modalTextDark: {
    color: colors.text.dark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
})
