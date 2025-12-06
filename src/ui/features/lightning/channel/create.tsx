/**
 * Channel Creation Screen
 *
 * Tela para abertura de novos canais Lightning Network.
 * Permite ao usuário especificar peer, capacity e fees.
 */

import React, { useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useLightningActions } from '../hooks'
import { useActiveColorMode } from '@/ui/features/app-provider'

// ==========================================
// COMPONENT
// ==========================================

export default function ChannelCreateScreen() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const { createChannel } = useLightningActions()

  // Form state
  const [peerId, setPeerId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [pushAmount, setPushAmount] = useState('')
  const [feeRate, setFeeRate] = useState('')

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ==========================================
  // VALIDATION
  // ==========================================

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    // Peer ID validation
    if (!peerId.trim()) {
      newErrors.peerId = 'Peer ID é obrigatório'
    } else if (!peerId.includes('@')) {
      newErrors.peerId = 'Peer ID deve estar no formato pubkey@host:port'
    }

    // Capacity validation
    const capacityNum = parseFloat(capacity)
    if (!capacity || capacityNum <= 0) {
      newErrors.capacity = 'Capacidade deve ser maior que 0'
    } else if (capacityNum < 0.001) {
      newErrors.capacity = 'Capacidade mínima é 0.001 BTC'
    } else if (capacityNum > 10) {
      newErrors.capacity = 'Capacidade máxima é 10 BTC'
    }

    // Push amount validation (optional)
    if (pushAmount) {
      const pushNum = parseFloat(pushAmount)
      if (pushNum < 0) {
        newErrors.pushAmount = 'Valor push deve ser positivo'
      } else if (pushNum >= capacityNum) {
        newErrors.pushAmount = 'Valor push deve ser menor que a capacidade'
      }
    }

    // Fee rate validation (optional)
    if (feeRate) {
      const feeNum = parseFloat(feeRate)
      if (feeNum < 0) {
        newErrors.feeRate = 'Taxa deve ser positiva'
      } else if (feeNum > 1000) {
        newErrors.feeRate = 'Taxa máxima é 1000 sat/vB'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [peerId, capacity, pushAmount, feeRate])

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleCreateChannel = useCallback(async () => {
    if (!validateForm()) return

    setIsLoading(true)
    try {
      const capacitySat = BigInt(Math.floor(parseFloat(capacity) * 100000000)) // BTC to sat
      const pushMsat = pushAmount
        ? BigInt(Math.floor(parseFloat(pushAmount) * 100000000 * 1000))
        : undefined // BTC to msat
      const feeRatePerKw = feeRate ? parseFloat(feeRate) * 250 : undefined // sat/vB to sat/kw

      await createChannel({
        peerId: peerId.trim(),
        capacitySat,
        pushMsat,
        feeRatePerKw,
      })

      Alert.alert('Sucesso', 'Canal criado com sucesso! Aguarde a confirmação na blockchain.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Erro ao criar canal')
    } finally {
      setIsLoading(false)
    }
  }, [peerId, capacity, pushAmount, feeRate, validateForm, router, createChannel])

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={colors.text[colorMode]} />
        </TouchableOpacity>
        <Text style={styles.title}>Abrir Canal</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Form */}
      <View style={styles.form}>
        {/* Peer ID */}
        <View style={styles.field}>
          <Text style={styles.label}>Peer ID</Text>
          <TextInput
            style={[styles.input, errors.peerId && styles.inputError]}
            value={peerId}
            onChangeText={setPeerId}
            placeholder="pubkey@host:port"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {errors.peerId && <Text style={styles.errorText}>{errors.peerId}</Text>}
          <Text style={styles.hint}>
            Endereço do nó Lightning para conectar (ex: 03abcd...@1.2.3.4:9735)
          </Text>
        </View>

        {/* Capacity */}
        <View style={styles.field}>
          <Text style={styles.label}>Capacidade (BTC)</Text>
          <TextInput
            style={[styles.input, errors.capacity && styles.inputError]}
            value={capacity}
            onChangeText={setCapacity}
            placeholder="0.001"
            keyboardType="decimal-pad"
          />
          {errors.capacity && <Text style={styles.errorText}>{errors.capacity}</Text>}
          <Text style={styles.hint}>Quantidade de BTC para o canal (mínimo 0.001, máximo 10)</Text>
        </View>

        {/* Push Amount (Optional) */}
        <View style={styles.field}>
          <Text style={styles.label}>Push Amount (sats) - Opcional</Text>
          <TextInput
            style={[styles.input, errors.pushAmount && styles.inputError]}
            value={pushAmount}
            onChangeText={setPushAmount}
            placeholder="10000"
            keyboardType="number-pad"
          />
          {errors.pushAmount && <Text style={styles.errorText}>{errors.pushAmount}</Text>}
          <Text style={styles.hint}>
            Sats para enviar imediatamente ao peer (útil para nodes que exigem reserva)
          </Text>
        </View>

        {/* Fee Rate (Optional) */}
        <View style={styles.field}>
          <Text style={styles.label}>Fee Rate (sat/vB) - Opcional</Text>
          <TextInput
            style={[styles.input, errors.feeRate && styles.inputError]}
            value={feeRate}
            onChangeText={setFeeRate}
            placeholder="1"
            keyboardType="decimal-pad"
          />
          {errors.feeRate && <Text style={styles.errorText}>{errors.feeRate}</Text>}
          <Text style={styles.hint}>
            Taxa de mineração para a transação de funding (padrão: automática)
          </Text>
        </View>
      </View>

      {/* Action Button */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.createButton, isLoading && styles.buttonDisabled]}
          onPress={handleCreateChannel}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.createButtonText}>Criar Canal</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.infoTitle}>ℹ️ Sobre Canais</Text>
        <Text style={styles.infoText}>
          • Canais permitem pagamentos instantâneos e baratos{'\n'}• Funds ficam bloqueados até o
          fechamento do canal{'\n'}• Taxas de abertura são pagas na blockchain{'\n'}• Confirmação
          leva ~10-60 minutos
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
    backgroundColor: colors.background.light,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.light,
  },
  placeholder: {
    width: 40,
  },
  form: {
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: alpha(colors.text.light, 0.2),
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.text.light,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginTop: 4,
  },
  hint: {
    color: alpha(colors.text.light, 0.6),
    fontSize: 14,
    marginTop: 4,
  },
  actions: {
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  info: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderRadius: 8,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text.light,
    lineHeight: 20,
  },
})
