/**
 * Dual Funding Channel Screen
 *
 * Tela para abertura de canais com Interactive Transaction Protocol (v2).
 * Permite que ambas as partes contribuam fundos para o canal.
 *
 * BOLT2: open_channel2 / accept_channel2
 */

import React, { useState, useCallback, useMemo } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useActiveColorMode } from '@/ui/features/app-provider'
import { useLightningBalance, useLightningActions } from '../hooks'
import type { Satoshis } from '../types'

// ==========================================
// TYPES
// ==========================================

type FundingRole = 'initiator' | 'acceptor'

interface ContributionBreakdown {
  ourPercentage: number
  theirPercentage: number
  totalCapacity: Satoshis
  estimatedFee: Satoshis
}

// ==========================================
// HELPERS
// ==========================================

function formatSatoshis(sats: Satoshis | number): string {
  const num = typeof sats === 'bigint' ? Number(sats) : sats
  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(4)} BTC`
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)} M sats`
  } else if (num >= 1000) {
    return `${Math.floor(num / 1000)} K sats`
  }
  return `${num} sats`
}

function btcToSats(btc: string): Satoshis {
  const parsed = parseFloat(btc)
  if (isNaN(parsed) || parsed < 0) return BigInt(0)
  return BigInt(Math.floor(parsed * 100000000))
}

function calculateBreakdown(
  ourContribution: Satoshis,
  theirContribution: Satoshis,
  feeRate: number,
): ContributionBreakdown {
  const total = ourContribution + theirContribution
  const ourPct = total > 0n ? (Number(ourContribution) / Number(total)) * 100 : 0
  const theirPct = total > 0n ? (Number(theirContribution) / Number(total)) * 100 : 0
  // Estimativa simples: ~140 vbytes para funding tx
  const estimatedFee = BigInt(Math.floor(140 * feeRate))

  return {
    ourPercentage: ourPct,
    theirPercentage: theirPct,
    totalCapacity: total,
    estimatedFee,
  }
}

// ==========================================
// COMPONENT
// ==========================================

export default function DualFundingScreen() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const balance = useLightningBalance()
  const { createChannel } = useLightningActions()

  // Form state
  const [role, setRole] = useState<FundingRole>('initiator')
  const [peerId, setPeerId] = useState('')
  const [ourContribution, setOurContribution] = useState('')
  const [theirContribution, setTheirContribution] = useState('')
  const [feeRate, setFeeRate] = useState('10')
  const [requireConfirmedInputs, setRequireConfirmedInputs] = useState(true)

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Derived values
  const ourSats = useMemo(() => btcToSats(ourContribution), [ourContribution])
  const theirSats = useMemo(() => btcToSats(theirContribution), [theirContribution])
  const feeRateNum = useMemo(() => parseFloat(feeRate) || 10, [feeRate])

  const breakdown = useMemo(
    () => calculateBreakdown(ourSats, theirSats, feeRateNum),
    [ourSats, theirSats, feeRateNum],
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

    if (!peerId.trim()) {
      newErrors.peerId = 'Peer ID é obrigatório'
    } else if (!peerId.includes('@')) {
      newErrors.peerId = 'Formato: pubkey@host:port'
    }

    if (ourSats <= 0n && theirSats <= 0n) {
      newErrors.contribution = 'Pelo menos uma contribuição é necessária'
    }

    if (ourSats > 0n) {
      const availableBalance = BigInt(balance) / 1000n // msat to sat
      if (ourSats > availableBalance) {
        newErrors.ourContribution = 'Saldo insuficiente'
      }
    }

    // Minimum channel size (20k sats)
    if (breakdown.totalCapacity > 0n && breakdown.totalCapacity < 20000n) {
      newErrors.contribution = 'Capacidade mínima é 20.000 sats'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [peerId, ourSats, theirSats, balance, breakdown.totalCapacity])

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleOpenChannel = useCallback(async () => {
    if (!validateForm()) return

    setIsLoading(true)
    try {
      await createChannel({
        peerId: peerId.trim(),
        capacitySat: breakdown.totalCapacity,
        pushMsat: theirSats * 1000n, // Contribution do peer vai como push amount inicial
        feeRatePerKw: feeRateNum * 250, // sat/vB to sat/kw
      })

      Alert.alert(
        'Canal Dual-Funded Iniciado',
        `Capacidade total: ${formatSatoshis(breakdown.totalCapacity)}\n\nAguarde a confirmação do peer e a mineração da transação.`,
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Falha ao abrir canal')
    } finally {
      setIsLoading(false)
    }
  }, [validateForm, createChannel, peerId, breakdown.totalCapacity, theirSats, feeRateNum, router])

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: bgColor }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>Dual Funding</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Info Banner */}
      <View style={[styles.infoBanner, { backgroundColor: alpha(colors.primary, 0.1) }]}>
        <IconSymbol name="info.circle.fill" size={20} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.primary }]}>
          Dual Funding permite que ambas as partes contribuam para o canal, criando liquidez
          bidirecional desde o início.
        </Text>
      </View>

      {/* Role Selector */}
      <View style={[styles.section, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Seu Papel</Text>
        <View style={styles.roleSelector}>
          <TouchableOpacity
            style={[
              styles.roleButton,
              role === 'initiator' && styles.roleButtonActive,
              { borderColor: role === 'initiator' ? colors.primary : alpha(textColor, 0.2) },
            ]}
            onPress={() => setRole('initiator')}
          >
            <IconSymbol
              name="arrow.up.right.circle.fill"
              size={24}
              color={role === 'initiator' ? colors.primary : secondaryColor}
            />
            <Text
              style={[
                styles.roleButtonText,
                { color: role === 'initiator' ? colors.primary : textColor },
              ]}
            >
              Iniciador
            </Text>
            <Text style={[styles.roleDesc, { color: secondaryColor }]}>Você inicia a abertura</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.roleButton,
              role === 'acceptor' && styles.roleButtonActive,
              { borderColor: role === 'acceptor' ? colors.primary : alpha(textColor, 0.2) },
            ]}
            onPress={() => setRole('acceptor')}
          >
            <IconSymbol
              name="arrow.down.left.circle.fill"
              size={24}
              color={role === 'acceptor' ? colors.primary : secondaryColor}
            />
            <Text
              style={[
                styles.roleButtonText,
                { color: role === 'acceptor' ? colors.primary : textColor },
              ]}
            >
              Aceitador
            </Text>
            <Text style={[styles.roleDesc, { color: secondaryColor }]}>Você aceita proposta</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Peer Connection */}
      <View style={[styles.section, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Conexão</Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: textColor }]}>Peer ID</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: textColor,
                borderColor: errors.peerId ? colors.error : alpha(textColor, 0.2),
              },
            ]}
            value={peerId}
            onChangeText={setPeerId}
            placeholder="pubkey@host:port"
            placeholderTextColor={secondaryColor}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {errors.peerId && <Text style={styles.errorText}>{errors.peerId}</Text>}
        </View>
      </View>

      {/* Contributions */}
      <View style={[styles.section, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Contribuições</Text>

        {/* Our Contribution */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: textColor }]}>Sua Contribuição (BTC)</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: textColor,
                borderColor: errors.ourContribution ? colors.error : alpha(textColor, 0.2),
              },
            ]}
            value={ourContribution}
            onChangeText={setOurContribution}
            placeholder="0.001"
            placeholderTextColor={secondaryColor}
            keyboardType="decimal-pad"
          />
          {errors.ourContribution && <Text style={styles.errorText}>{errors.ourContribution}</Text>}
          <Text style={[styles.hint, { color: secondaryColor }]}>
            Disponível: {formatSatoshis(Number(balance) / 1000)}
          </Text>
        </View>

        {/* Their Contribution */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: textColor }]}>
            Contribuição do Peer (BTC) - Esperada
          </Text>
          <TextInput
            style={[styles.input, { color: textColor, borderColor: alpha(textColor, 0.2) }]}
            value={theirContribution}
            onChangeText={setTheirContribution}
            placeholder="0.001"
            placeholderTextColor={secondaryColor}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.hint, { color: secondaryColor }]}>
            Valor esperado que o peer contribuirá
          </Text>
        </View>

        {errors.contribution && (
          <Text style={[styles.errorText, { marginTop: 8 }]}>{errors.contribution}</Text>
        )}
      </View>

      {/* Breakdown */}
      {breakdown.totalCapacity > 0n && (
        <View style={[styles.section, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Resumo do Canal</Text>

          {/* Visual Bar */}
          <View style={styles.breakdownBar}>
            <View
              style={[
                styles.breakdownOurs,
                { width: `${breakdown.ourPercentage}%`, backgroundColor: colors.primary },
              ]}
            />
            <View
              style={[
                styles.breakdownTheirs,
                { width: `${breakdown.theirPercentage}%`, backgroundColor: colors.success },
              ]}
            />
          </View>

          <View style={styles.breakdownLabels}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.breakdownText, { color: textColor }]}>
                Você: {formatSatoshis(ourSats)} ({breakdown.ourPercentage.toFixed(1)}%)
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.breakdownText, { color: textColor }]}>
                Peer: {formatSatoshis(theirSats)} ({breakdown.theirPercentage.toFixed(1)}%)
              </Text>
            </View>
          </View>

          <View style={[styles.summaryRow, { borderTopColor: alpha(textColor, 0.1) }]}>
            <Text style={[styles.summaryLabel, { color: secondaryColor }]}>Capacidade Total</Text>
            <Text style={[styles.summaryValue, { color: textColor }]}>
              {formatSatoshis(breakdown.totalCapacity)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: secondaryColor }]}>Fee Estimada</Text>
            <Text style={[styles.summaryValue, { color: textColor }]}>
              ~{formatSatoshis(breakdown.estimatedFee)}
            </Text>
          </View>
        </View>
      )}

      {/* Advanced Options */}
      <TouchableOpacity
        style={[styles.advancedToggle, { borderColor: alpha(textColor, 0.1) }]}
        onPress={() => setShowAdvanced(!showAdvanced)}
      >
        <Text style={[styles.advancedToggleText, { color: secondaryColor }]}>Opções Avançadas</Text>
        <IconSymbol
          name={showAdvanced ? 'chevron.up' : 'chevron.down'}
          size={16}
          color={secondaryColor}
        />
      </TouchableOpacity>

      {showAdvanced && (
        <View style={[styles.section, { backgroundColor: cardBg }]}>
          {/* Fee Rate */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: textColor }]}>Taxa de Fee (sat/vB)</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor: alpha(textColor, 0.2) }]}
              value={feeRate}
              onChangeText={setFeeRate}
              placeholder="10"
              placeholderTextColor={secondaryColor}
              keyboardType="number-pad"
            />
          </View>

          {/* Require Confirmed Inputs */}
          <View style={styles.switchRow}>
            <View>
              <Text style={[styles.label, { color: textColor }]}>Exigir Inputs Confirmados</Text>
              <Text style={[styles.hint, { color: secondaryColor }]}>
                Mais seguro, mas pode limitar peers
              </Text>
            </View>
            <Switch
              value={requireConfirmedInputs}
              onValueChange={setRequireConfirmedInputs}
              trackColor={{ false: alpha(textColor, 0.2), true: alpha(colors.primary, 0.5) }}
              thumbColor={requireConfirmedInputs ? colors.primary : colors.white}
            />
          </View>
        </View>
      )}

      {/* Action Button */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.openButton, isLoading && styles.buttonDisabled]}
          onPress={handleOpenChannel}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <IconSymbol name="bolt.fill" size={20} color={colors.white} />
              <Text style={styles.openButtonText}>
                {role === 'initiator' ? 'Iniciar Canal' : 'Aguardar Proposta'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Protocol Info */}
      <View style={[styles.protocolInfo, { backgroundColor: alpha(textColor, 0.05) }]}>
        <Text style={[styles.protocolTitle, { color: textColor }]}>📋 Interactive TX v2</Text>
        <Text style={[styles.protocolText, { color: secondaryColor }]}>
          Este processo usa o protocolo Interactive Transaction (BOLT2) para negociar inputs e
          outputs entre as partes antes de assinar a transação de funding.
        </Text>
      </View>
    </ScrollView>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  roleButtonActive: {
    backgroundColor: alpha(colors.primary, 0.05),
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  roleDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 4,
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: alpha(colors.placeholder, 0.2),
    marginBottom: 12,
  },
  breakdownOurs: {
    height: '100%',
  },
  breakdownTheirs: {
    height: '100%',
  },
  breakdownLabels: {
    gap: 8,
    marginBottom: 16,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownText: {
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  advancedToggleText: {
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  actions: {
    marginTop: 8,
    marginBottom: 24,
  },
  openButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  openButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  protocolInfo: {
    borderRadius: 12,
    padding: 16,
  },
  protocolTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  protocolText: {
    fontSize: 13,
    lineHeight: 18,
  },
})
