import { Text, View, StyleSheet, useColorScheme, ActivityIndicator } from 'react-native'

import colors from '@/ui/colors'
// import { useBlockchain } from '@/features/blockchain'
import { useSettings } from '@/features/settings'
import Button from '@/ui/Button'

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function BlockchainScreen() {
  const colorScheme = useColorScheme()
  const { colorMode } = useSettings()
  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode
  const isDark = effectiveColorMode === 'dark'

  // const { blockchainState, syncHeadersManually } = useBlockchain()
  // const { isSyncing, lastSyncedHeight, currentHeight, syncProgress } = blockchainState

  /* const progressPercentage = Math.round(syncProgress * 100)
  const syncedBlocks = lastSyncedHeight || 0
  const totalBlocks = currentHeight || 0

  // Estimativa aproximada: 80 bytes por header
  const estimatedSizeBytes = syncedBlocks * 80
  const estimatedSizeFormatted = formatBytes(estimatedSizeBytes) */

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* <View style={styles.content}>
       
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>
            Blockchain Sync Status
          </Text>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPercentage}%` },
                  isSyncing && styles.progressFillActive,
                ]}
              />
            </View>
            <Text style={[styles.progressText, isDark && styles.progressTextDark]}>
              {progressPercentage}%
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={[styles.statusLabel, isDark && styles.statusLabelDark]}>Status:</Text>
            <View style={styles.statusValue}>
              {isSyncing ? (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.statusText, styles.statusTextSyncing]}>
                    Synchronizing...
                  </Text>
                </>
              ) : (
                <Text style={[styles.statusText, styles.statusTextSynced]}>Synced</Text>
              )}
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>Latest Block:</Text>
            <Text style={[styles.infoValue, isDark && styles.infoValueDark]}>
              {totalBlocks.toLocaleString()}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>Synced Block:</Text>
            <Text style={[styles.infoValue, isDark && styles.infoValueDark]}>
              {syncedBlocks.toLocaleString()}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>Storage Used:</Text>
            <Text style={[styles.infoValue, isDark && styles.infoValueDark]}>
              {estimatedSizeFormatted}
            </Text>
          </View>
        </View>

        <Button
          variant="solid"
          backgroundColor={isSyncing ? colors.background.light : colors.primary}
          glassStyle={styles.button}
          disabled={isSyncing}
          onPress={syncHeadersManually}
        >
          <Text style={[styles.buttonText, isSyncing && styles.buttonTextDisabled]}>
            {isSyncing ? 'Synchronizing...' : 'Sync Now'}
          </Text>
        </Button>

        <View style={styles.infoContainer}>
          <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
            The blockchain headers are synchronized to verify transactions and maintain network
            security. This process runs automatically in the background.
          </Text>
          <Text style={[styles.spvText, isDark && styles.spvTextDark]}>
            SPV (Simplified Payment Verification) mode: Only block headers are downloaded, providing
            fast synchronization while maintaining security through proof-of-work validation.
          </Text>
        </View>
      </View> */}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardDark: {
    backgroundColor: colors.background.dark,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 20,
  },
  cardTitleDark: {
    color: colors.text.dark,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.background.light,
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressFillActive: {
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    minWidth: 50,
    textAlign: 'right',
  },
  progressTextDark: {
    color: colors.text.dark,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary.light,
    marginRight: 8,
  },
  statusLabelDark: {
    color: colors.textSecondary.dark,
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusTextSyncing: {
    color: colors.primary,
  },
  statusTextSynced: {
    color: colors.success,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  infoLabelDark: {
    color: colors.textSecondary.dark,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
  },
  infoValueDark: {
    color: colors.text.dark,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: colors.background.light,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  buttonTextDisabled: {
    color: colors.textSecondary.light,
  },
  infoContainer: {
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
  spvText: {
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
    marginTop: 8,
  },
  spvTextDark: {
    color: colors.primary,
  },
})
