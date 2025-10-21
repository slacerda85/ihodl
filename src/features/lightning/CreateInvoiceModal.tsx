import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useWallet } from '../store'

interface CreateInvoiceModalProps {
  visible: boolean
  onClose: () => void
  onCreateInvoice: (params: { amount: number; description: string; expiry?: number }) => void
}

const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  visible,
  onClose,
  onCreateInvoice,
}) => {
  const { unit } = useWallet()

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expiry, setExpiry] = useState('3600') // 1 hour default

  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    const invoiceAmount = parseInt(amount)
    if (!amount || isNaN(invoiceAmount) || invoiceAmount < 1) {
      newErrors.amount = 'Valor deve ser pelo menos 1 satoshi'
    }

    if (!description.trim()) {
      newErrors.description = 'Descrição é obrigatória'
    }

    const expirySeconds = parseInt(expiry)
    if (expiry && (isNaN(expirySeconds) || expirySeconds < 60 || expirySeconds > 31536000)) {
      newErrors.expiry = 'Expiração deve ser entre 60 segundos e 1 ano'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validateForm()) return

    const params = {
      amount: parseInt(amount),
      description: description.trim(),
      expiry: expiry ? parseInt(expiry) : undefined,
    }

    onCreateInvoice(params)
    handleClose()
  }

  const handleClose = () => {
    // Reset form
    setAmount('')
    setDescription('')
    setExpiry('3600')
    setErrors({})
    onClose()
  }

  if (!visible) return null

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingView}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Criar Invoice Lightning</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Valor ({unit}) *</Text>
              <TextInput
                style={[styles.input, errors.amount && styles.inputError]}
                value={amount}
                onChangeText={setAmount}
                placeholder="1000"
                keyboardType="numeric"
              />
              {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Descrição *</Text>
              <TextInput
                style={[styles.input, errors.description && styles.inputError]}
                value={description}
                onChangeText={setDescription}
                placeholder="Pagamento por serviços"
                multiline
                numberOfLines={3}
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Expiração (segundos)</Text>
              <TextInput
                style={[styles.input, errors.expiry && styles.inputError]}
                value={expiry}
                onChangeText={setExpiry}
                placeholder="3600"
                keyboardType="numeric"
              />
              <Text style={styles.helperText}>Padrão: 3600 segundos (1 hora)</Text>
              {errors.expiry && <Text style={styles.errorText}>{errors.expiry}</Text>}
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.button, styles.submitButton]} onPress={handleSubmit}>
                <Text style={styles.submitButtonText}>Criar Invoice</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
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
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#F44336',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#9E9E9E',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
})

export default CreateInvoiceModal
