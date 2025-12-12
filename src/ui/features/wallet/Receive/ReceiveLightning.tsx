import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'

import colors from '@/ui/colors'
import { BottomSheetTrigger } from '@/ui/components/BottomSheet'
import Button from '@/ui/components/Button'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import QRCode from '@/ui/components/QRCode'
import { useLightningActions, useLightningState } from '@/ui/features/app-provider'
import { Invoice } from '@/ui/features/lightning/types'
import { useIsDark } from '@/ui/features/app-provider'
import { alpha } from '@/ui/utils'

// ============================================================================
// Constants
// ============================================================================

const MSAT_PER_SAT = 1000n
const DEFAULT_DESCRIPTION = 'Payment'
const INVOICE_TRUNCATE_LENGTH = 20
const INVOICE_TRUNCATE_CHARS = 10

// ============================================================================
// Types
// ============================================================================

interface OnChainFeeWarningProps {
  isDark: boolean
  estimatedFee?: bigint
}

interface LoadingStateProps {
  isDark: boolean
  message: string
}

interface ErrorStateProps {
  isDark: boolean
  error: string
}

interface InvoiceDisplayProps {
  isDark: boolean
  invoiceData: Invoice
  amount: string
  description: string
  hasActiveChannels: boolean
  onAmountChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCopy: () => void
  onShare: () => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function reduceInvoiceString(invoice: string): string {
  if (invoice.length <= INVOICE_TRUNCATE_LENGTH) return invoice
  return `${invoice.slice(0, INVOICE_TRUNCATE_CHARS)}...${invoice.slice(-INVOICE_TRUNCATE_CHARS)}`
}

function findExistingInvoice(
  invoices: Invoice[],
  amountMsat: bigint,
  descriptionValue: string,
): Invoice | undefined {
  const now = Date.now()
  return invoices.find(inv => {
    const isNotExpired = inv.expiresAt > now
    const isPending = inv.status === 'pending'
    const sameAmount = inv.amount === amountMsat
    const sameDescription = inv.description === descriptionValue
    return isPending && isNotExpired && sameAmount && sameDescription
  })
}

// ============================================================================
// Sub-Components
// ============================================================================

function OnChainFeeWarning({ isDark, estimatedFee }: OnChainFeeWarningProps) {
  const feeMessage = estimatedFee
    ? `A fee of ~${estimatedFee.toString()} sats will be deducted from your first payment.`
    : 'A small fee will be deducted from your first payment.'

  const sheetContent = (
    <View style={styles.feeSheetContent}>
      <Text style={[styles.feeSheetTitle, isDark && styles.feeSheetTitleDark]}>
        About On-chain Fees
      </Text>
      <Text style={[styles.feeSheetMessage, isDark && styles.feeSheetMessageDark]}>
        {feeMessage}
      </Text>
      <Text style={[styles.feeSheetDescription, isDark && styles.feeSheetDescriptionDark]}>
        When you receive your first Lightning payment, a new payment channel needs to be opened on
        the Bitcoin blockchain. This requires an on-chain transaction, which incurs a small mining
        fee. This fee is automatically deducted from your incoming payment.
      </Text>
    </View>
  )

  return (
    <BottomSheetTrigger
      title="Channel Opening Fee"
      sheetContent={sheetContent}
      detents={[0.35, 'medium']}
    >
      <View style={[styles.feeWarningContainer, isDark && styles.feeWarningContainerDark]}>
        <IconSymbol name="info.circle" size={20} color={colors.primary} />
        <View style={styles.feeWarningTextContainer}>
          <Text style={[styles.feeWarningTitle, isDark && styles.feeWarningTitleDark]}>
            On-chain fee expected
          </Text>
        </View>
        {/* <IconSymbol
          name="chevron.right"
          size={16}
          color={colors.textSecondary[isDark ? 'dark' : 'light']}
        /> */}
      </View>
    </BottomSheetTrigger>
  )
}

function LoadingState({ isDark, message }: LoadingStateProps) {
  return (
    <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
      <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
        <View style={styles.qrContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.subtitle, isDark && styles.subtitleDark, styles.loadingText]}>
            {message}
          </Text>
        </View>
      </View>
    </View>
  )
}

function ErrorState({ isDark, error }: ErrorStateProps) {
  return (
    <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
      <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
          Lightning Error
        </Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>{error}</Text>
      </View>
    </View>
  )
}

function GeneratingInvoiceState({ isDark }: { isDark: boolean }) {
  return (
    <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
      <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
        Generating Invoice
      </Text>
      <View style={styles.qrContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.subtitle, isDark && styles.subtitleDark, styles.loadingText]}>
          Creating Lightning invoice...
        </Text>
      </View>
    </View>
  )
}

function InvoiceDisplay({
  isDark,
  invoiceData,
  amount,
  description,
  hasActiveChannels,
  onAmountChange,
  onDescriptionChange,
  onCopy,
  onShare,
}: InvoiceDisplayProps) {
  const qrColor = isDark ? colors.text.dark : colors.text.light
  const secondaryColor = colors.textSecondary[isDark ? 'dark' : 'light']
  const buttonTintColor = isDark
    ? alpha(colors.background.light, 0.05)
    : alpha(colors.background.dark, 0.03)
  const shareTintColor = isDark ? alpha(colors.white, 0.05) : alpha(colors.black, 0.03)

  return (
    <View style={[styles.sectionBox, isDark && styles.sectionBoxDark, styles.invoiceContainer]}>
      <View style={styles.qrContainer}>
        <QRCode
          value={`lightning:${invoiceData.invoice}`}
          size={300}
          color={qrColor}
          backgroundColor="transparent"
        />
      </View>

      {!hasActiveChannels && (
        <OnChainFeeWarning isDark={isDark} estimatedFee={invoiceData.channelOpeningFee} />
      )}

      <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
        {reduceInvoiceString(invoiceData.invoice)}
      </Text>

      <View style={styles.inputsContainer}>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="Amount (sats)"
          placeholderTextColor={secondaryColor}
          value={amount}
          onChangeText={onAmountChange}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="Description"
          placeholderTextColor={secondaryColor}
          value={description}
          onChangeText={onDescriptionChange}
        />
      </View>

      <View style={styles.buttonRow}>
        <Button
          tintColor={buttonTintColor}
          style={styles.actionButton}
          color={secondaryColor}
          startIcon={<IconSymbol name="doc.on.doc" size={20} color={secondaryColor} />}
          onPress={onCopy}
        >
          Copy
        </Button>

        <Button
          style={styles.actionButton}
          tintColor={shareTintColor}
          color={secondaryColor}
          startIcon={<IconSymbol name="square.and.arrow.up" size={20} color={secondaryColor} />}
          onPress={onShare}
        >
          Share
        </Button>
      </View>
    </View>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function ReceiveLightning() {
  const isDark = useIsDark()
  const lightningState = useLightningState()
  const { generateInvoice } = useLightningActions()

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null)

  // Valores derivados
  const amountValue = amount ? BigInt(amount) : 0n
  const amountMsat = amountValue * MSAT_PER_SAT
  const descriptionValue = description || DEFAULT_DESCRIPTION

  // Gerar invoice automaticamente ao inicializar
  useEffect(() => {
    if (!lightningState.isInitialized) return

    const existingInvoice = findExistingInvoice(
      lightningState.invoices,
      amountMsat,
      descriptionValue,
    )

    if (existingInvoice) {
      console.log('[ReceiveLightning] Reusing existing invoice:', existingInvoice.paymentHash)
      setInvoiceData(existingInvoice)
      return
    }

    const generateNewInvoice = async () => {
      setLoading(true)
      try {
        const invoice = await generateInvoice(amountMsat, descriptionValue)
        setInvoiceData(invoice)
      } catch (error) {
        console.error('Error generating invoice:', error)
        Alert.alert('Error', 'Failed to generate Lightning invoice')
      } finally {
        setLoading(false)
      }
    }

    generateNewInvoice()
  }, [
    amountMsat,
    descriptionValue,
    lightningState.isInitialized,
    lightningState.invoices,
    generateInvoice,
  ])

  // Handlers
  const handleShareInvoice = async () => {
    if (!invoiceData) {
      Alert.alert('Error', 'Please wait for invoice generation')
      return
    }

    try {
      await Share.share({
        message: `Lightning Invoice: ${invoiceData.invoice}`,
        url: `lightning:${invoiceData.invoice}`,
      })
    } catch (error) {
      console.error('Error sharing invoice:', error)
    }
  }

  const handleCopyInvoice = async () => {
    if (!invoiceData) {
      Alert.alert('Error', 'Please wait for invoice generation')
      return
    }

    try {
      await Clipboard.setStringAsync(invoiceData.invoice)
      Alert.alert('Copied!', 'Invoice copied to clipboard')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      Alert.alert('Error', 'Failed to copy invoice to clipboard')
    }
  }

  // Early returns para estados de loading e erro
  if (!lightningState.isInitialized && lightningState.isLoading) {
    return <LoadingState isDark={isDark} message="Initializing Lightning..." />
  }

  if (lightningState.error) {
    return <ErrorState isDark={isDark} error={lightningState.error} />
  }

  // Render principal
  return (
    <View>
      <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
        <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
          {loading ? (
            <GeneratingInvoiceState isDark={isDark} />
          ) : invoiceData ? (
            <InvoiceDisplay
              isDark={isDark}
              invoiceData={invoiceData}
              amount={amount}
              description={description}
              hasActiveChannels={lightningState.hasActiveChannels}
              onAmountChange={setAmount}
              onDescriptionChange={setDescription}
              onCopy={handleCopyInvoice}
              onShare={handleShareInvoice}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  // Scroll and content
  scrollView: {},
  scrollViewDark: {},
  contentWrapper: {
    //padding: 24,
    gap: 24,
  },
  contentWrapperDark: {},

  // Section
  sectionBox: {
    gap: 24,
  },
  sectionBoxDark: {},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },

  // QR
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Inputs
  inputsContainer: {
    gap: 24,
  },
  input: {
    padding: 16,
    borderRadius: 32,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
    fontSize: 16,
  },
  inputDark: {
    backgroundColor: alpha(colors.white, 0.05),
    color: colors.text.dark,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 24,
  },
  actionButton: {
    flex: 1,
  },

  // Loading
  loadingText: {
    marginTop: 16,
  },

  // Invoice
  invoiceContainer: {
    marginTop: 8,
  },
  addressText: {
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '400',
    fontFamily: 'ui-monospace',
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  addressTextDark: {
    color: colors.textSecondary.dark,
  },

  // On-chain fee warning
  feeWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 32,
    backgroundColor: alpha(colors.primary, 0.05),
  },
  feeWarningContainerDark: {
    backgroundColor: alpha(colors.primary, 0.05),
  },
  feeWarningTextContainer: {
    // flex: 1,
    gap: 4,
  },
  feeWarningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  feeWarningTitleDark: {
    color: colors.primary,
  },
  feeWarningHint: {
    fontSize: 13,
    color: colors.textSecondary.light,
  },
  feeWarningHintDark: {
    color: colors.textSecondary.dark,
  },
  feeWarningMessage: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  feeWarningMessageDark: {
    color: colors.textSecondary.dark,
  },

  // Fee BottomSheet content
  feeSheetContent: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  feeSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.light,
  },
  feeSheetTitleDark: {
    color: colors.text.dark,
  },
  feeSheetMessage: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
    lineHeight: 22,
  },
  feeSheetMessageDark: {
    color: colors.primary,
  },
  feeSheetDescription: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  feeSheetDescriptionDark: {
    color: colors.textSecondary.dark,
  },
})
