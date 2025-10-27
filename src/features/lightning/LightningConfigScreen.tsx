import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useLightning, useLightningChannels, useSettings } from '@/features/storage'
import colors from '@/ui/colors'
import ContentContainer from '@/ui/ContentContainer'

const LightningConfigScreen: React.FC = () => {
  const router = useRouter()
  const { spvEnabled } = useLightning()
  const { channels, activeChannelsCount } = useLightningChannels()
  const { isDark } = useSettings()

  return (
    <ContentContainer>
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, isDark && styles.titleDark]}>Lightning SPV</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          Conectado automaticamente a provedores Lightning para pagamentos instantâneos
        </Text>

        {/* Status Section */}
        <View style={[styles.statusSection, isDark && styles.statusSectionDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Status</Text>

          <View style={[styles.statusIndicator, spvEnabled && styles.statusActive]}>
            <Text style={styles.statusText}>{spvEnabled ? 'CONECTADO' : 'DESCONECTADO'}</Text>
          </View>

          {spvEnabled && (
            <View style={styles.statsContainer}>
              <Text style={[styles.statsText, isDark && styles.statsTextDark]}>
                Canais: {channels.length} | Ativos: {activeChannelsCount}
              </Text>
            </View>
          )}
        </View>

        {/* Info Section */}
        <View style={[styles.infoContainer, isDark && styles.infoContainerDark]}>
          <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>Como funciona</Text>
          <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
            • Usa roteamento trampoline para pagamentos eficientes{'\n'}• Conecta automaticamente a
            LSPs confiáveis{'\n'}• Sem necessidade de executar nó Lightning local{'\n'}• Ideal para
            dispositivos móveis
          </Text>
        </View>

        {/* Back Button */}
        <TouchableOpacity
          style={[styles.backButton, isDark && styles.backButtonDark]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Voltar</Text>
        </TouchableOpacity>
      </ScrollView>
    </ContentContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background.light,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  titleDark: {
    color: colors.text.dark,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 24,
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },
  statusSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusSectionDark: {
    backgroundColor: colors.background.dark,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  section: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  sectionDark: {
    backgroundColor: colors.background.dark,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 16,
  },
  sectionDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  statusIndicator: {
    padding: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.error,
  },
  statusActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsContainer: {
    marginTop: 12,
  },
  statsText: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  statsTextDark: {
    color: colors.textSecondary.dark,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginTop: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  toggleLabelDark: {
    color: colors.text.dark,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.primary,
  },
  loadingTextDark: {
    color: colors.primary,
  },
  infoContainer: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoContainerDark: {
    backgroundColor: colors.background.dark,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 8,
  },
  infoTitleDark: {
    color: colors.text.dark,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
  backButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonDark: {
    backgroundColor: colors.primary,
  },
  backButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButtonTextDark: {
    color: colors.white,
  },
})

export default LightningConfigScreen
