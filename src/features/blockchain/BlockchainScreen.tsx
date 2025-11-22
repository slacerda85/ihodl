import { View, StyleSheet, useColorScheme } from 'react-native'

import colors from '@/ui/colors'
// import { useBlockchain } from '@/features/blockchain'
import { useSettings } from '@/features/settings'

export default function BlockchainScreen() {
  const colorScheme = useColorScheme()
  const { colorMode } = useSettings()
  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode
  const isDark = effectiveColorMode === 'dark'

  return <View style={[styles.container, isDark && styles.containerDark]}></View>
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
