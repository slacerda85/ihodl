import React, { useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useSettings } from '@/features/storage'
import colors from '@/ui/colors'

const OpenChannelScreen: React.FC = () => {
  const router = useRouter()
  const { isDark } = useSettings()

  useEffect(() => {
    Alert.alert(
      'Funcionalidade não disponível',
      'A abertura de canais não está disponível no modo SPV. Use um nó Lightning completo para esta funcionalidade.',
      [
        {
          text: 'Voltar',
          onPress: () => router.back(),
        },
      ],
    )
  }, [router])

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Abrir Canal Lightning</Text>
      <Text style={[styles.message, isDark && styles.messageDark]}>
        Esta funcionalidade não está disponível no modo SPV.
      </Text>
      <Text style={[styles.description, isDark && styles.descriptionDark]}>
        O modo SPV permite visualizar canais existentes, mas não criar novos canais ou fechar canais
        existentes. Para funcionalidades completas do Lightning Network, use um nó Lightning
        dedicado (LND, CLN, ou Eclair).
      </Text>
      <Pressable
        style={[styles.backButton, isDark && styles.backButtonDark]}
        onPress={() => router.back()}
      >
        <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Voltar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 16,
    textAlign: 'center',
  },
  titleDark: {
    color: colors.text.dark,
  },
  message: {
    fontSize: 18,
    color: colors.textSecondary.light,
    marginBottom: 16,
    textAlign: 'center',
  },
  messageDark: {
    color: colors.textSecondary.dark,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary.light,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  descriptionDark: {
    color: colors.textSecondary.dark,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
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

export default OpenChannelScreen
