/**
 * Channel Splice Screen
 *
 * Interface para adicionar ou remover fundos de um canal existente
 * usando Splice-In e Splice-Out (requer suporte a Interactive TX v2)
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useLightningChannels, useLightningBalance } from '../hooks'
import { useActiveColorMode } from '@/ui/features/app-provider'
import type { Channel, Satoshis } from '../types'

// ==========================================
// TYPES
// ==========================================

type SpliceType = 'in' | 'out'

interface SplicePreview {
  currentCapacity: Satoshis
  newCapacity: Satoshis
  spliceDelta: Satoshis
  estimatedFee: Satoshis
}

// ==========================================
// HELPERS
// ==========================================

function formatSatoshis(sats: Satoshis | number): string {
  const value = typeof sats === 'bigint' ? Number(sats) : sats
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(8)} BTC`
  }
  return `${value.toLocaleString()} sats`
}

function btcToSats(btcStr: string): Satoshis {
  const num = parseFloat(btcStr)
  if (isNaN(num) || num <= 0) return 0n as Satoshis
  return BigInt(Math.round(num * 100_000_000)) as Satoshis
}

function calculateSplicePreview(
  currentCapacity: Satoshis,
  spliceAmount: Satoshis,
  spliceType: SpliceType,
  feeRate: number,
): SplicePreview {
  const txSize = 150
  const estimatedFee = BigInt(Math.round(txSize * feeRate)) as Satoshis
  const spliceDelta = spliceType === 'in' ? spliceAmount : (-spliceAmount as unknown as Satoshis)
  const newCapacity = (currentCapacity + spliceDelta) as Satoshis

  return {
    currentCapacity,
    newCapacity: newCapacity > 0n ? newCapacity : (0n as Satoshis),
    spliceDelta,
    estimatedFee,
  }
}

// ==========================================
// MAIN COMPONENT
// ==========================================

interface ChannelSpliceScreenProps {
  channelId: string
  currentCapacity?: Satoshis
}

export default function ChannelSpliceScreen({
  channelId,
  currentCapacity: initialCapacity,
}: ChannelSpliceScreenProps) {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const balance = useLightningBalance()
  const channels = useLightningChannels()

  // Find channel info
  const channel = useMemo(() => {
    return channels.find((c: Channel) => c.channelId === channelId)
  }, [channels, channelId])

  const currentCapacity = useMemo(() => {
    return initialCapacity ?? channel?.capacitySat ?? (0n as Satoshis)
  }, [initialCapacity, channel?.capacitySat])

  // Form state
  const [spliceType, setSpliceType] = useState<SpliceType>('in')
  const [amount, setAmount] = useState('')
  const [feeRate, setFeeRate] = useState('10')
  const [destination, setDestination] = useState('')

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Derived values
  const spliceAmount = useMemo(() => btcToSats(amount), [amount])
  const feeRateNum = useMemo(() => parseFloat(feeRate) || 10, [feeRate])

  const preview = useMemo(
    () => calculateSplicePreview(currentCapacity, spliceAmount, spliceType, feeRateNum),
    [currentCapacity, spliceAmount, spliceType, feeRateNum],
  )

  // Colors
  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const bgColor = colors.background[colorMode]
  const cardBg = colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white

  // ==========================================
  // VALIDATION
  // ==========================================

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (spliceAmount <= 0n) {
      newErrors.amount = 'Valor deve ser maior que zero'
    }

    if (spliceType === 'out') {
      const ourBalance = channel?.localBalanceSat ?? (0n as Satoshis)
      if (spliceAmount > ourBalance) {
        newErrors.amount = 'Valor excede seu saldo no canal'
      }

      if (!destination.trim()) {
        newErrors.destination = 'Endereço de destino é obrigatório'
      } else if (!destination.startsWith('bc1') && !destination.startsWith('tb1')) {
        newErrors.destination = 'Endereço Bitcoin inválido'
      }
    }

    if (spliceType === 'in') {
      const availableBalance = BigInt(balance) / 1000n
      if (spliceAmount > availableBalance) {
        newErrors.amount = 'Saldo on-chain insuficiente'
      }
    }

    if (spliceAmount > 0n && spliceAmount < 1000n) {
      newErrors.amount = 'Valor mínimo é 1.000 sats'
    }

    if (preview.newCapacity < 20000n) {
      newErrors.amount = 'Capacidade resultante mínima é 20.000 sats'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [
    spliceAmount,
    spliceType,
    channel?.localBalanceSat,
    destination,
    balance,
    preview.newCapacity,
  ])

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleSplice = useCallback(async () => {
    if (!validateForm()) return

    setIsLoading(true)
    try {
      // TODO: Implement actual splice via LightningService
      // await spliceChannel({ channelId, type: spliceType, amount: spliceAmount, ... })

      Alert.alert(
        'Splice Iniciado',
        spliceType === 'in'
          ? `Adicionando ${formatSatoshis(spliceAmount)} ao canal`
          : `Removendo ${formatSatoshis(spliceAmount)} do canal`,
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch {
      Alert.alert('Erro', 'Não foi possível realizar o splice. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }, [validateForm, spliceType, spliceAmount, router])

  // ==========================================
  // RENDER
  // ==========================================

  if (!channel) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={textColor} />
          </Pressable>
          <Text style={[styles.title, { color: textColor }]}>Canal não encontrado</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="exclamationmark.circle" size={64} color={secondaryColor} />
          <Text style={[styles.emptyText, { color: secondaryColor }]}>
            Este canal não foi encontrado.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bgColor }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={textColor} />
        </Pressable>
        <Text style={[styles.title, { color: textColor }]}>Splice Canal</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Channel Info Card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.channelHeader}>
            <IconSymbol name="bolt.fill" size={24} color={colors.primary} />
            <View style={styles.channelInfo}>
              <Text style={[styles.channelLabel, { color: secondaryColor }]}>Canal</Text>
              <Text style={[styles.channelId, { color: textColor }]} numberOfLines={1}>
                {channelId.substring(0, 16)}...
              </Text>
            </View>
          </View>
          <View style={styles.capacityRow}>
            <Text style={[styles.capacityLabel, { color: secondaryColor }]}>Capacidade Atual</Text>
            <Text style={[styles.capacityValue, { color: textColor }]}>
              {formatSatoshis(currentCapacity)}
            </Text>
          </View>
        </View>

        {/* Splice Type Toggle */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Tipo de Splice</Text>
          <View style={styles.toggleContainer}>
            <Pressable
              style={[
                styles.toggleButton,
                spliceType === 'in' && { backgroundColor: colors.success },
              ]}
              onPress={() => setSpliceType('in')}
            >
              <IconSymbol
                name="plus.circle.fill"
                size={20}
                color={spliceType === 'in' ? colors.white : textColor}
              />
              <Text
                style={[
                  styles.toggleText,
                  { color: spliceType === 'in' ? colors.white : textColor },
                ]}
              >
                Splice-In
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.toggleButton,
                spliceType === 'out' && { backgroundColor: colors.warning },
              ]}
              onPress={() => setSpliceType('out')}
            >
              <IconSymbol
                name="minus.circle.fill"
                size={20}
                color={spliceType === 'out' ? colors.white : textColor}
              />
              <Text
                style={[
                  styles.toggleText,
                  { color: spliceType === 'out' ? colors.white : textColor },
                ]}
              >
                Splice-Out
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.spliceDescription, { color: secondaryColor }]}>
            {spliceType === 'in'
              ? 'Adiciona fundos on-chain ao canal, aumentando sua capacidade'
              : 'Remove fundos do canal para um endereço Bitcoin on-chain'}
          </Text>
        </View>

        {/* Amount Input */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.inputLabel, { color: textColor }]}>
            {spliceType === 'in' ? 'Valor a Adicionar' : 'Valor a Remover'}
          </Text>
          <View
            style={[
              styles.inputContainer,
              { borderColor: errors.amount ? colors.error : alpha(textColor, 0.2) },
            ]}
          >
            <TextInput
              style={[styles.input, { color: textColor }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.001"
              placeholderTextColor={alpha(textColor, 0.4)}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.inputSuffix, { color: secondaryColor }]}>BTC</Text>
          </View>
          {errors.amount && (
            <Text style={[styles.errorText, { color: colors.error }]}>{errors.amount}</Text>
          )}

          {/* Quick Amount Buttons */}
          <View style={styles.quickAmounts}>
            {['0.001', '0.005', '0.01', '0.05'].map(preset => (
              <Pressable
                key={preset}
                style={[styles.quickButton, { borderColor: alpha(textColor, 0.2) }]}
                onPress={() => setAmount(preset)}
              >
                <Text style={[styles.quickButtonText, { color: textColor }]}>{preset} BTC</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Destination (Splice-Out only) */}
        {spliceType === 'out' && (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.inputLabel, { color: textColor }]}>Endereço de Destino</Text>
            <View
              style={[
                styles.inputContainer,
                { borderColor: errors.destination ? colors.error : alpha(textColor, 0.2) },
              ]}
            >
              <TextInput
                style={[styles.input, { color: textColor }]}
                value={destination}
                onChangeText={setDestination}
                placeholder="bc1q..."
                placeholderTextColor={alpha(textColor, 0.4)}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.destination && (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.destination}</Text>
            )}
          </View>
        )}

        {/* Preview Card */}
        {spliceAmount > 0n && (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Previsão</Text>

            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: secondaryColor }]}>Capacidade Atual</Text>
              <Text style={[styles.previewValue, { color: textColor }]}>
                {formatSatoshis(preview.currentCapacity)}
              </Text>
            </View>

            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: secondaryColor }]}>
                {spliceType === 'in' ? 'Adicionando' : 'Removendo'}
              </Text>
              <Text
                style={[
                  styles.previewValue,
                  { color: spliceType === 'in' ? colors.success : colors.warning },
                ]}
              >
                {spliceType === 'in' ? '+' : '-'} {formatSatoshis(spliceAmount)}
              </Text>
            </View>

            <View style={styles.previewDivider} />

            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: textColor }]}>Nova Capacidade</Text>
              <Text style={[styles.previewValueLarge, { color: colors.primary }]}>
                {formatSatoshis(preview.newCapacity)}
              </Text>
            </View>

            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: secondaryColor }]}>Taxa Estimada</Text>
              <Text style={[styles.previewValue, { color: textColor }]}>
                ~{formatSatoshis(preview.estimatedFee)}
              </Text>
            </View>
          </View>
        )}

        {/* Advanced Options */}
        <Pressable
          style={[styles.advancedToggle, { borderColor: alpha(textColor, 0.2) }]}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={[styles.advancedToggleText, { color: secondaryColor }]}>
            Opções Avançadas
          </Text>
          <IconSymbol
            name={showAdvanced ? 'chevron.up' : 'chevron.down'}
            size={20}
            color={secondaryColor}
          />
        </Pressable>

        {showAdvanced && (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.inputLabel, { color: textColor }]}>Taxa de Fee (sat/vB)</Text>
            <View style={[styles.inputContainer, { borderColor: alpha(textColor, 0.2) }]}>
              <TextInput
                style={[styles.input, { color: textColor }]}
                value={feeRate}
                onChangeText={setFeeRate}
                placeholder="10"
                placeholderTextColor={alpha(textColor, 0.4)}
                keyboardType="number-pad"
              />
              <Text style={[styles.inputSuffix, { color: secondaryColor }]}>sat/vB</Text>
            </View>

            <View style={styles.feePresets}>
              {[
                { label: 'Lento', value: '5' },
                { label: 'Normal', value: '10' },
                { label: 'Rápido', value: '25' },
              ].map(preset => (
                <Pressable
                  key={preset.value}
                  style={[
                    styles.feePresetButton,
                    {
                      borderColor: alpha(textColor, 0.2),
                      backgroundColor:
                        feeRate === preset.value ? alpha(textColor, 0.1) : 'transparent',
                    },
                  ]}
                  onPress={() => setFeeRate(preset.value)}
                >
                  <Text style={[styles.feePresetText, { color: textColor }]}>{preset.label}</Text>
                  <Text style={[styles.feePresetValue, { color: secondaryColor }]}>
                    {preset.value} sat/vB
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: alpha(colors.info, 0.1) }]}>
          <IconSymbol name="info.circle.fill" size={20} color={colors.info} />
          <Text style={[styles.infoText, { color: textColor }]}>
            Splice permite modificar a capacidade de um canal sem fechá-lo. A transação será
            confirmada on-chain e o canal continuará operando durante o processo.
          </Text>
        </View>

        {/* Submit Button */}
        <Pressable
          style={[
            styles.submitButton,
            {
              backgroundColor: spliceType === 'in' ? colors.success : colors.warning,
              opacity: isLoading || spliceAmount <= 0n ? 0.5 : 1,
            },
          ]}
          onPress={handleSplice}
          disabled={isLoading || spliceAmount <= 0n}
        >
          {isLoading ? (
            <Text style={styles.submitButtonText}>Processando...</Text>
          ) : (
            <>
              <IconSymbol
                name={spliceType === 'in' ? 'plus.circle.fill' : 'minus.circle.fill'}
                size={20}
                color={colors.white}
              />
              <Text style={styles.submitButtonText}>
                {spliceType === 'in'
                  ? `Adicionar ${formatSatoshis(spliceAmount)}`
                  : `Remover ${formatSatoshis(spliceAmount)}`}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  } as ViewStyle,
  backButton: {
    padding: 8,
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: '600',
  } as TextStyle,
  headerSpacer: {
    width: 40,
  } as ViewStyle,
  scrollView: {
    flex: 1,
  } as ViewStyle,
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  } as ViewStyle,
  card: {
    borderRadius: 12,
    padding: 16,
  } as ViewStyle,
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  } as ViewStyle,
  channelInfo: {
    flex: 1,
  } as ViewStyle,
  channelLabel: {
    fontSize: 12,
    marginBottom: 2,
  } as TextStyle,
  channelId: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  } as TextStyle,
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,
  capacityLabel: {
    fontSize: 14,
  } as TextStyle,
  capacityValue: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  } as TextStyle,
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  } as ViewStyle,
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  } as ViewStyle,
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
  spliceDescription: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  } as TextStyle,
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  } as TextStyle,
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  } as ViewStyle,
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  } as TextStyle,
  inputSuffix: {
    fontSize: 14,
    marginLeft: 8,
  } as TextStyle,
  errorText: {
    fontSize: 12,
    marginTop: 4,
  } as TextStyle,
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  } as ViewStyle,
  quickButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  } as ViewStyle,
  quickButtonText: {
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  } as ViewStyle,
  previewLabel: {
    fontSize: 14,
  } as TextStyle,
  previewValue: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
  previewValueLarge: {
    fontSize: 18,
    fontWeight: '700',
  } as TextStyle,
  previewDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: 8,
  } as ViewStyle,
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
  } as ViewStyle,
  advancedToggleText: {
    fontSize: 14,
  } as TextStyle,
  feePresets: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  } as ViewStyle,
  feePresetButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  } as ViewStyle,
  feePresetText: {
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  feePresetValue: {
    fontSize: 10,
    marginTop: 2,
  } as TextStyle,
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 8,
  } as ViewStyle,
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  } as ViewStyle,
  submitButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  } as ViewStyle,
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  } as TextStyle,
})
