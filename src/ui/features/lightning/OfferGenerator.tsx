/**
 * OfferGenerator - Componente para criar BOLT 12 Offers
 *
 * Permite ao usuário criar offers para receber pagamentos Lightning
 * com suporte a:
 * - Valor fixo ou any-amount
 * - Descrição personalizada
 * - Expiração opcional
 * - QR Code para compartilhamento
 */

import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  Share,
  Platform,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useOffer, type SimpleOfferParams, type CreatedOfferInfo } from './hooks/useOffer'

// ============================================================================
// Types
// ============================================================================

export interface OfferGeneratorProps {
  /** Chave pública do nó emissor */
  issuerPubkey: Uint8Array
  /** Nome do emissor (opcional) */
  issuerName?: string
  /** Callback quando offer é criada */
  onOfferCreated?: (offer: CreatedOfferInfo) => void
  /** Callback para fechar */
  onClose?: () => void
  /** Estilo customizado do container */
  style?: object
  /** Tema (dark ou light) */
  theme?: 'dark' | 'light'
}

interface FormData {
  description: string
  amountSats: string
  isAnyAmount: boolean
  expiryHours: string
  hasExpiry: boolean
  quantityMax: string
  hasQuantityLimit: boolean
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_FORM: FormData = {
  description: '',
  amountSats: '',
  isAnyAmount: false,
  expiryHours: '24',
  hasExpiry: false,
  quantityMax: '1',
  hasQuantityLimit: false,
}

/** Opções de expiração predefinidas */
const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
  { label: 'Never', hours: 0 },
]

// ============================================================================
// Theme
// ============================================================================

const createTheme = (mode: 'dark' | 'light') => ({
  background: mode === 'dark' ? '#1a1a2e' : '#ffffff',
  surface: mode === 'dark' ? '#16213e' : '#f5f5f5',
  surfaceLight: mode === 'dark' ? '#0f3460' : '#e0e0e0',
  primary: '#f7931a',
  primaryDark: '#d4790e',
  text: mode === 'dark' ? '#ffffff' : '#000000',
  textSecondary: mode === 'dark' ? '#a0a0a0' : '#666666',
  textMuted: mode === 'dark' ? '#666666' : '#999999',
  border: mode === 'dark' ? '#333333' : '#dddddd',
  error: '#ff4444',
  success: '#00c853',
  warning: '#ff9800',
  inputBg: mode === 'dark' ? '#0f3460' : '#ffffff',
})

// ============================================================================
// Component
// ============================================================================

export function OfferGenerator({
  issuerPubkey,
  issuerName,
  onOfferCreated,
  onClose,
  style,
  theme = 'dark',
}: OfferGeneratorProps): React.ReactElement {
  const colors = useMemo(() => createTheme(theme), [theme])
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copied, setCopied] = useState(false)

  const { createOffer, createdOffer, error, isLoading, clearCreatedOffer, clearError } =
    useOffer(issuerPubkey)

  // ========================================================================
  // Form Handlers
  // ========================================================================

  const updateForm = useCallback((key: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
    // Limpar offer criada ao editar form
  }, [])

  const handleAmountChange = useCallback((text: string) => {
    // Permitir apenas números
    const cleaned = text.replace(/[^0-9]/g, '')
    setForm(prev => ({ ...prev, amountSats: cleaned }))
  }, [])

  const handleQuantityChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '')
    setForm(prev => ({ ...prev, quantityMax: cleaned }))
  }, [])

  const selectExpiryOption = useCallback((hours: number) => {
    if (hours === 0) {
      setForm(prev => ({ ...prev, hasExpiry: false, expiryHours: '0' }))
    } else {
      setForm(prev => ({ ...prev, hasExpiry: true, expiryHours: hours.toString() }))
    }
  }, [])

  // ========================================================================
  // Validation
  // ========================================================================

  const formErrors = useMemo(() => {
    const errors: string[] = []

    if (!form.description.trim()) {
      errors.push('Description is required')
    } else if (form.description.length > 639) {
      errors.push('Description too long (max 639 characters)')
    }

    if (!form.isAnyAmount && form.amountSats) {
      const amount = parseInt(form.amountSats, 10)
      if (isNaN(amount) || amount <= 0) {
        errors.push('Amount must be a positive number')
      } else if (amount < 1) {
        errors.push('Minimum amount is 1 sat')
      } else if (amount > 21000000 * 100000000) {
        errors.push('Amount exceeds maximum')
      }
    }

    if (!form.isAnyAmount && !form.amountSats) {
      errors.push('Amount is required (or enable "Any amount")')
    }

    if (form.hasExpiry && form.expiryHours) {
      const hours = parseInt(form.expiryHours, 10)
      if (isNaN(hours) || hours < 1) {
        errors.push('Expiry must be at least 1 hour')
      }
    }

    return errors
  }, [form])

  const isFormValid = formErrors.length === 0

  // ========================================================================
  // Create Offer
  // ========================================================================

  const handleCreate = useCallback(async () => {
    if (!isFormValid) return

    clearError()

    const params: SimpleOfferParams = {
      description: form.description.trim(),
      issuerName: issuerName,
    }

    if (!form.isAnyAmount && form.amountSats) {
      params.amountSats = parseInt(form.amountSats, 10)
    }

    if (form.hasExpiry && form.expiryHours) {
      params.expirySeconds = parseInt(form.expiryHours, 10) * 3600
    }

    if (form.hasQuantityLimit && form.quantityMax) {
      const qty = parseInt(form.quantityMax, 10)
      if (qty > 0) {
        params.quantityMax = qty
      }
    }

    const result = await createOffer(params)

    if (result) {
      onOfferCreated?.(result)
    }
  }, [form, isFormValid, issuerName, createOffer, clearError, onOfferCreated])

  // ========================================================================
  // Copy & Share
  // ========================================================================

  const handleCopy = useCallback(async () => {
    if (!createdOffer) return

    try {
      await Clipboard.setStringAsync(createdOffer.encoded)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      Alert.alert('Error', 'Failed to copy to clipboard')
    }
  }, [createdOffer])

  const handleShare = useCallback(async () => {
    if (!createdOffer) return

    try {
      await Share.share({
        message: `Lightning Offer: ${createdOffer.encoded}`,
        title: 'Lightning Offer',
      })
    } catch {
      // User cancelled
    }
  }, [createdOffer])

  const handleNewOffer = useCallback(() => {
    clearCreatedOffer()
    setForm(INITIAL_FORM)
    setCopied(false)
  }, [clearCreatedOffer])

  // ========================================================================
  // Render
  // ========================================================================

  // Success view - show created offer
  if (createdOffer) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }, style]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Offer Created! ✓</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.successCard, { backgroundColor: colors.surface }]}>
          {/* Offer String */}
          <View style={styles.offerStringContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>OFFER STRING</Text>
            <TouchableOpacity onPress={handleCopy} activeOpacity={0.7}>
              <Text
                style={[
                  styles.offerString,
                  { color: colors.text, backgroundColor: colors.inputBg },
                ]}
                numberOfLines={4}
                ellipsizeMode="middle"
              >
                {createdOffer.encoded}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Tap to copy</Text>
          </View>

          {/* Offer Details */}
          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Amount</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {createdOffer.display.amount}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Description</Text>
              <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
                {createdOffer.display.description}
              </Text>
            </View>

            {createdOffer.display.expiresAt && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Expires</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {createdOffer.display.expiresAt}
                </Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Max Uses</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {createdOffer.display.quantityMax}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={handleCopy}
            >
              <Text style={styles.actionButtonText}>{copied ? '✓ Copied' : 'Copy'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.surfaceLight }]}
              onPress={handleShare}
            >
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* New Offer Button */}
          <TouchableOpacity
            style={[styles.newOfferButton, { borderColor: colors.border }]}
            onPress={handleNewOffer}
          >
            <Text style={[styles.newOfferButtonText, { color: colors.textSecondary }]}>
              Create Another Offer
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  // Form view
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }, style]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Create Offer</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Create a reusable BOLT 12 offer to receive payments
      </Text>

      {/* Error Display */}
      {error && (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={clearError}>
            <Text style={[styles.errorDismiss, { color: colors.error }]}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Description Input */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>DESCRIPTION *</Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={form.description}
          onChangeText={text => updateForm('description', text)}
          placeholder="What is this payment for?"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          maxLength={639}
        />
        <Text style={[styles.charCount, { color: colors.textMuted }]}>
          {form.description.length}/639
        </Text>
      </View>

      {/* Amount Section */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>AMOUNT</Text>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.textSecondary }]}>Any amount</Text>
            <Switch
              value={form.isAnyAmount}
              onValueChange={value => updateForm('isAnyAmount', value)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={form.isAnyAmount ? colors.primaryDark : '#f4f3f4'}
            />
          </View>
        </View>

        {!form.isAnyAmount && (
          <View style={styles.amountInputContainer}>
            <TextInput
              style={[
                styles.input,
                styles.amountInput,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={form.amountSats}
              onChangeText={handleAmountChange}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
            <Text style={[styles.amountUnit, { color: colors.textSecondary }]}>sats</Text>
          </View>
        )}

        {form.isAnyAmount && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Payer can choose any amount
          </Text>
        )}
      </View>

      {/* Expiry Section */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>EXPIRY</Text>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.textSecondary }]}>Set expiry</Text>
            <Switch
              value={form.hasExpiry}
              onValueChange={value => updateForm('hasExpiry', value)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={form.hasExpiry ? colors.primaryDark : '#f4f3f4'}
            />
          </View>
        </View>

        {form.hasExpiry && (
          <View style={styles.expiryOptions}>
            {EXPIRY_OPTIONS.filter(o => o.hours > 0).map(option => (
              <TouchableOpacity
                key={option.hours}
                style={[
                  styles.expiryOption,
                  {
                    backgroundColor:
                      form.expiryHours === option.hours.toString()
                        ? colors.primary
                        : colors.surfaceLight,
                  },
                ]}
                onPress={() => selectExpiryOption(option.hours)}
              >
                <Text
                  style={[
                    styles.expiryOptionText,
                    {
                      color: form.expiryHours === option.hours.toString() ? '#ffffff' : colors.text,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!form.hasExpiry && (
          <Text style={[styles.hint, { color: colors.textMuted }]}>Offer never expires</Text>
        )}
      </View>

      {/* Advanced Options */}
      <TouchableOpacity
        style={styles.advancedToggle}
        onPress={() => setShowAdvanced(!showAdvanced)}
      >
        <Text style={[styles.advancedToggleText, { color: colors.textSecondary }]}>
          {showAdvanced ? '▼ Hide' : '▶ Show'} Advanced Options
        </Text>
      </TouchableOpacity>

      {showAdvanced && (
        <View style={[styles.advancedSection, { borderColor: colors.border }]}>
          {/* Quantity Limit */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>QUANTITY LIMIT</Text>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: colors.textSecondary }]}>
                  Limit uses
                </Text>
                <Switch
                  value={form.hasQuantityLimit}
                  onValueChange={value => updateForm('hasQuantityLimit', value)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={form.hasQuantityLimit ? colors.primaryDark : '#f4f3f4'}
                />
              </View>
            </View>

            {form.hasQuantityLimit && (
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={form.quantityMax}
                onChangeText={handleQuantityChange}
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            )}

            {!form.hasQuantityLimit && (
              <Text style={[styles.hint, { color: colors.textMuted }]}>Unlimited uses</Text>
            )}
          </View>
        </View>
      )}

      {/* Validation Errors */}
      {formErrors.length > 0 && form.description.length > 0 && (
        <View style={styles.validationErrors}>
          {formErrors.map((err, index) => (
            <Text key={index} style={[styles.validationError, { color: colors.error }]}>
              • {err}
            </Text>
          ))}
        </View>
      )}

      {/* Create Button */}
      <TouchableOpacity
        style={[
          styles.createButton,
          {
            backgroundColor: isFormValid ? colors.primary : colors.surfaceLight,
          },
        ]}
        onPress={handleCreate}
        disabled={!isFormValid || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text
            style={[styles.createButtonText, { color: isFormValid ? '#ffffff' : colors.textMuted }]}
          >
            Create Offer
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}

// ============================================================================
// Styles
// ============================================================================

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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 28,
    fontWeight: '300',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  errorDismiss: {
    fontSize: 20,
    fontWeight: 'bold',
    paddingLeft: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    textAlign: 'right',
    paddingRight: 60,
  },
  amountUnit: {
    position: 'absolute',
    right: 12,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  expiryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expiryOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  expiryOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  advancedToggle: {
    paddingVertical: 12,
  },
  advancedToggleText: {
    fontSize: 14,
  },
  advancedSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginBottom: 8,
  },
  validationErrors: {
    marginBottom: 16,
  },
  validationError: {
    fontSize: 13,
    marginBottom: 4,
  },
  createButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Success View
  successCard: {
    borderRadius: 12,
    padding: 16,
  },
  offerStringContainer: {
    marginBottom: 20,
  },
  offerString: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    lineHeight: 18,
  },
  detailsSection: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  newOfferButton: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  newOfferButtonText: {
    fontSize: 14,
  },
})

export default OfferGenerator
