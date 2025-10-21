import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Clipboard,
  Alert,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { LightningInvoice } from '@/lib/lightning'

interface InvoiceDisplayModalProps {
  visible: boolean
  onClose: () => void
  invoice: LightningInvoice | null
}

const InvoiceDisplayModal: React.FC<InvoiceDisplayModalProps> = ({ visible, onClose, invoice }) => {
  const copyToClipboard = async () => {
    if (invoice?.paymentRequest) {
      Clipboard.setString(invoice.paymentRequest)
      Alert.alert('Copiado!', 'Invoice copiado para a área de transferência')
    }
  }

  if (!visible || !invoice) return null

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.modalTitle}>Invoice Lightning</Text>

          <View style={styles.qrContainer}>
            <QRCode
              value={invoice.paymentRequest}
              size={200}
              color="black"
              backgroundColor="white"
            />
          </View>

          <View style={styles.invoiceDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Valor:</Text>
              <Text style={styles.detailValue}>{invoice.amount} sats</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Descrição:</Text>
              <Text style={styles.detailValue}>{invoice.description}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Expira em:</Text>
              <Text style={styles.detailValue}>
                {new Date(invoice.expiry * 1000).toLocaleString()}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Criado em:</Text>
              <Text style={styles.detailValue}>
                {new Date(invoice.timestamp * 1000).toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={styles.paymentRequestContainer}>
            <Text style={styles.paymentRequestLabel}>Payment Request:</Text>
            <Text style={styles.paymentRequest} selectable>
              {invoice.paymentRequest}
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.copyButton]} onPress={copyToClipboard}>
              <Text style={styles.copyButtonText}>Copiar Invoice</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.closeButton]} onPress={onClose}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    margin: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  invoiceDetails: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  status: {
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  paymentRequestContainer: {
    marginBottom: 20,
  },
  paymentRequestLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  paymentRequest: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 6,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  copyButton: {
    backgroundColor: '#2196F3',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#9E9E9E',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
})

export default InvoiceDisplayModal
