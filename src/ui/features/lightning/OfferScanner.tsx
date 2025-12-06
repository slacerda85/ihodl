/**
 * OfferScanner - Componente para escanear e decodificar BOLT 12 Offers
 *
 * Permite ao usuário:
 * - Escanear QR codes de offers
 * - Colar strings de offer
 * - Ver detalhes da offer decodificada
 * - Pagar offers (callback para componente de pagamento)
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useOffer, type DecodedOfferInfo, isValidOfferFormat } from './hooks/useOffer'

// ============================================================================
// Types
// ============================================================================

export interface OfferScannerProps {
  /** Callback quando offer é decodificada com sucesso */
  onOfferDecoded?: (offer: DecodedOfferInfo) => void
  /** Callback para iniciar pagamento */
  onPayOffer?: (offer: DecodedOfferInfo) => void
  /** Callback para fechar */
  onClose?: () => void
  /** Offer string inicial (se já tiver) */
  initialOfferString?: string
  /** Mostrar scanner de QR (requer camera permission) */
  showQrScanner?: boolean
  /** Estilo customizado do container */
  style?: object
  /** Tema (dark ou light) */
  theme?: 'dark' | 'light'
}

type ScannerMode = 'input' | 'qr' | 'result'

// ============================================================================
// Constants
// ============================================================================

const PASTE_DEBOUNCE_MS = 300

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

export function OfferScanner({
  onOfferDecoded,
  onPayOffer,
  onClose,
  initialOfferString,
  showQrScanner = false,
  style,
  theme = 'dark',
}: OfferScannerProps): React.ReactElement {
  const colors = useMemo(() => createTheme(theme), [theme])
  const [mode, setMode] = useState<ScannerMode>('input')
  const [inputText, setInputText] = useState(initialOfferString || '')
  const [isPasting, setIsPasting] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const { decodeOffer, decodedOffer, status, error, isLoading, clearDecodedOffer, clearError } =
    useOffer()

  // ========================================================================
  // Effects
  // ========================================================================

  // Decodificar offer inicial se fornecida
  useEffect(() => {
    if (initialOfferString && isValidOfferFormat(initialOfferString)) {
      handleDecode(initialOfferString)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOfferString])

  // Notificar quando offer é decodificada
  useEffect(() => {
    if (decodedOffer && status === 'success') {
      onOfferDecoded?.(decodedOffer)
      setMode('result')
    }
  }, [decodedOffer, status, onOfferDecoded])

  // ========================================================================
  // Handlers
  // ========================================================================

  const handleDecode = useCallback(
    async (offerString?: string) => {
      const textToDecode = offerString || inputText.trim()

      if (!textToDecode) {
        Alert.alert('Error', 'Please enter an offer string')
        return
      }

      Keyboard.dismiss()
      clearError()

      await decodeOffer(textToDecode)
    },
    [inputText, decodeOffer, clearError],
  )

  const handlePaste = useCallback(async () => {
    if (isPasting) return

    setIsPasting(true)
    try {
      const clipboardContent = await Clipboard.getStringAsync()

      if (clipboardContent) {
        const trimmed = clipboardContent.trim().toLowerCase()

        // Verificar se é uma offer válida
        if (isValidOfferFormat(trimmed)) {
          setInputText(trimmed)
          // Auto-decodificar
          setTimeout(() => handleDecode(trimmed), PASTE_DEBOUNCE_MS)
        } else if (trimmed.startsWith('lno')) {
          // Parece uma offer mas pode estar incompleta
          setInputText(trimmed)
        } else {
          Alert.alert('Invalid Offer', 'The clipboard does not contain a valid BOLT 12 offer')
        }
      } else {
        Alert.alert('Empty Clipboard', 'No text found in clipboard')
      }
    } catch {
      Alert.alert('Error', 'Failed to read clipboard')
    } finally {
      setIsPasting(false)
    }
  }, [isPasting, handleDecode])

  const handleClear = useCallback(() => {
    setInputText('')
    clearDecodedOffer()
    clearError()
    setMode('input')
    inputRef.current?.focus()
  }, [clearDecodedOffer, clearError])

  const handlePayOffer = useCallback(() => {
    if (decodedOffer) {
      onPayOffer?.(decodedOffer)
    }
  }, [decodedOffer, onPayOffer])

  const handleBack = useCallback(() => {
    setMode('input')
    clearDecodedOffer()
  }, [clearDecodedOffer])

  const handleTextChange = useCallback(
    (text: string) => {
      // Limpar e normalizar
      const cleaned = text.trim().toLowerCase()
      setInputText(cleaned)

      // Limpar erro ao editar
      clearError()

      // Se o texto parece completo, tentar decodificar automaticamente
      // Offers geralmente têm pelo menos 100+ caracteres
      if (isValidOfferFormat(cleaned) && cleaned.length > 100) {
        // Debounce a decodificação automática
      }
    },
    [clearError],
  )

  // ========================================================================
  // QR Scanner (placeholder - requer biblioteca de camera)
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleQrScan = useCallback(
    (data: string) => {
      const cleaned = data.trim().toLowerCase()
      if (isValidOfferFormat(cleaned)) {
        setInputText(cleaned)
        handleDecode(cleaned)
      }
    },
    [handleDecode],
  )

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderValidationBadge = useCallback(
    (isValid: boolean) => (
      <View
        style={[
          styles.badge,
          { backgroundColor: isValid ? colors.success + '20' : colors.error + '20' },
        ]}
      >
        <Text style={[styles.badgeText, { color: isValid ? colors.success : colors.error }]}>
          {isValid ? '✓ Valid' : '✗ Invalid'}
        </Text>
      </View>
    ),
    [colors],
  )

  const renderExpiryBadge = useCallback(
    (isExpired: boolean, timeRemaining: string | null) => {
      if (isExpired) {
        return (
          <View style={[styles.badge, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.badgeText, { color: colors.error }]}>Expired</Text>
          </View>
        )
      }

      if (timeRemaining) {
        return (
          <View style={[styles.badge, { backgroundColor: colors.warning + '20' }]}>
            <Text style={[styles.badgeText, { color: colors.warning }]}>
              Expires in {timeRemaining}
            </Text>
          </View>
        )
      }

      return (
        <View style={[styles.badge, { backgroundColor: colors.success + '20' }]}>
          <Text style={[styles.badgeText, { color: colors.success }]}>No expiry</Text>
        </View>
      )
    },
    [colors],
  )

  // ========================================================================
  // Render: Result View
  // ========================================================================

  if (mode === 'result' && decodedOffer) {
    const { display } = decodedOffer

    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }, style]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: colors.textSecondary }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Offer Details</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status Badges */}
        <View style={styles.badgesRow}>
          {renderValidationBadge(display.isValid)}
          {renderExpiryBadge(display.isExpired, display.timeRemaining)}
        </View>

        {/* Validation Errors */}
        {display.validationErrors.length > 0 && (
          <View style={[styles.warningBox, { backgroundColor: colors.error + '15' }]}>
            <Text style={[styles.warningTitle, { color: colors.error }]}>Validation Issues:</Text>
            {display.validationErrors.map((err, i) => (
              <Text key={i} style={[styles.warningText, { color: colors.error }]}>
                • {err}
              </Text>
            ))}
          </View>
        )}

        {/* Main Info Card */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {/* Amount */}
          <View style={styles.amountSection}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Amount</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>{display.amount}</Text>
          </View>

          {/* Description */}
          <View style={styles.detailSection}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Description</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{display.description}</Text>
          </View>

          {/* Issuer */}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Issuer</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{display.issuer}</Text>
          </View>

          {/* Issuer ID */}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Node ID</Text>
            <Text
              style={[styles.detailValue, styles.monoText, { color: colors.text }]}
              numberOfLines={1}
            >
              {display.issuerId}
            </Text>
          </View>

          {/* Expiry */}
          {display.expiresAt && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Expires</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{display.expiresAt}</Text>
            </View>
          )}

          {/* Quantity Max */}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Max Uses</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{display.quantityMax}</Text>
          </View>
        </View>

        {/* Offer String */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Offer String</Text>
          <Text
            style={[styles.offerString, { color: colors.text, backgroundColor: colors.inputBg }]}
            numberOfLines={4}
            ellipsizeMode="middle"
          >
            {decodedOffer.offerString}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {onPayOffer && display.isValid && !display.isExpired && (
            <TouchableOpacity
              style={[styles.payButton, { backgroundColor: colors.primary }]}
              onPress={handlePayOffer}
            >
              <Text style={styles.payButtonText}>Pay This Offer</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={handleClear}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
              Scan Another
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  // ========================================================================
  // Render: Input View
  // ========================================================================

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }, style]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Scan Offer</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Enter or paste a BOLT 12 offer to view details and pay
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

      {/* Input Section */}
      <View style={styles.inputSection}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>OFFER STRING</Text>

        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            styles.offerInput,
            {
              backgroundColor: colors.inputBg,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={inputText}
          onChangeText={handleTextChange}
          placeholder="lno1..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={5}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />

        {/* Input Actions */}
        <View style={styles.inputActions}>
          <TouchableOpacity
            style={[styles.inputAction, { backgroundColor: colors.surfaceLight }]}
            onPress={handlePaste}
            disabled={isPasting}
          >
            {isPasting ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={[styles.inputActionText, { color: colors.text }]}>📋 Paste</Text>
            )}
          </TouchableOpacity>

          {inputText.length > 0 && (
            <TouchableOpacity
              style={[styles.inputAction, { backgroundColor: colors.surfaceLight }]}
              onPress={handleClear}
            >
              <Text style={[styles.inputActionText, { color: colors.text }]}>✕ Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* QR Scanner Placeholder */}
      {showQrScanner && (
        <View style={[styles.qrSection, { borderColor: colors.border }]}>
          <View style={[styles.qrPlaceholder, { backgroundColor: colors.surfaceLight }]}>
            <Text style={[styles.qrPlaceholderText, { color: colors.textMuted }]}>
              📷 QR Scanner
            </Text>
            <Text style={[styles.qrPlaceholderHint, { color: colors.textMuted }]}>
              Camera permission required
            </Text>
          </View>
        </View>
      )}

      {/* Decode Button */}
      <TouchableOpacity
        style={[
          styles.decodeButton,
          {
            backgroundColor:
              inputText.length > 0 && !isLoading ? colors.primary : colors.surfaceLight,
          },
        ]}
        onPress={() => handleDecode()}
        disabled={inputText.length === 0 || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text
            style={[
              styles.decodeButtonText,
              { color: inputText.length > 0 ? '#ffffff' : colors.textMuted },
            ]}
          >
            Decode Offer
          </Text>
        )}
      </TouchableOpacity>

      {/* Help Text */}
      <View style={styles.helpSection}>
        <Text style={[styles.helpTitle, { color: colors.textSecondary }]}>
          What is a BOLT 12 Offer?
        </Text>
        <Text style={[styles.helpText, { color: colors.textMuted }]}>
          BOLT 12 offers are reusable payment requests that start with "lno1". They can be shared
          publicly and used multiple times, unlike traditional invoices.
        </Text>
      </View>
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
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 16,
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
  inputSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  offerInput: {
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  inputActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  inputAction: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inputActionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  qrSection: {
    marginBottom: 20,
    borderTopWidth: 1,
    paddingTop: 20,
  },
  qrPlaceholder: {
    height: 200,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: {
    fontSize: 48,
    marginBottom: 8,
  },
  qrPlaceholderHint: {
    fontSize: 12,
  },
  decodeButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  decodeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  helpSection: {
    marginTop: 8,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
  },

  // Result View
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  amountSection: {
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  amountLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  offerString: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    lineHeight: 16,
  },
  actionButtons: {
    gap: 12,
  },
  payButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
  },
})

export default OfferScanner
