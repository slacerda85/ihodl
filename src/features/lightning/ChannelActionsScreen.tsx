import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useLightningChannels, useSettings } from '@/features/storage'
import colors from '@/ui/colors'
import ContentContainer from '@/ui/ContentContainer'

export default function ChannelActionsScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const router = useRouter()
  const { channels } = useLightningChannels()
  const { isDark } = useSettings()

  // Find the channel from the store
  const channel = channels.find(c => c.channelId === channelId) || null

  const handleCloseChannel = async (force: boolean = false) => {
    if (!channel) return

    Alert.alert(
      'Funcionalidade Indisponível',
      'Fechar canais não é suportado no modo SPV. Use um nó Lightning completo para gerenciar canais.',
      [{ text: 'OK' }],
    )
  }

  const handleCancel = () => {
    router.back()
  }

  if (!channel) {
    return (
      <ContentContainer>
        <View style={styles.container}>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
            Canal não encontrado
          </Text>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={styles.actionButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </ContentContainer>
    )
  }

  return (
    <ContentContainer>
      <View style={styles.container}>
        <Text style={[styles.title, isDark && styles.titleDark]}>Ações do Canal</Text>

        <View style={styles.channelInfo}>
          <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>ID do Canal:</Text>
          <Text style={[styles.infoValue, isDark && styles.infoValueDark]} selectable>
            {channel.channelId}
          </Text>

          <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>Peer:</Text>
          <Text style={[styles.infoValue, isDark && styles.infoValueDark]} selectable>
            {channel.remotePubkey}
          </Text>

          <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>Status:</Text>
          <Text style={[styles.infoValue, isDark && styles.infoValueDark]}>{channel.status}</Text>
        </View>

        <View style={styles.actionsContainer}>
          {channel.status === 'active' && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.closeButton]}
                onPress={() => handleCloseChannel(false)}
              >
                <Text style={styles.actionButtonText}>Fechar Canal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.forceCloseButton]}
                onPress={() => handleCloseChannel(true)}
              >
                <Text style={styles.actionButtonText}>Forçar Fechamento</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={styles.actionButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ContentContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.light,
    textAlign: 'center',
  },
  titleDark: {
    color: colors.text.dark,
  },
  channelInfo: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  channelInfoDark: {
    backgroundColor: colors.background.dark,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
  },
  infoLabelDark: {
    color: colors.textSecondary.dark,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text.light,
    fontFamily: 'monospace',
  },
  infoValueDark: {
    color: colors.text.dark,
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: '#FF9800',
  },
  forceCloseButton: {
    backgroundColor: colors.error,
  },
  cancelButton: {
    backgroundColor: colors.textSecondary.light,
  },
  cancelButtonDark: {
    backgroundColor: colors.textSecondary.dark,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 18,
    color: colors.error,
    textAlign: 'center',
  },
  errorTextDark: {
    color: colors.error,
  },
})
