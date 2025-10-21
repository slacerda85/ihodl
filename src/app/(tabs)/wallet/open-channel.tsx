import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useWallet, useLightning } from '@/features/store'
import { validateChannelParams } from '@/lib/lightning'

const OpenChannelScreen: React.FC = () => {
  const router = useRouter()
  const { unit, activeWalletId } = useWallet()
  const { openChannel } = useLightning()

  const [nodePubkey, setNodePubkey] = useState('')
  const [localFundingAmount, setLocalFundingAmount] = useState('')
  const [pushAmount, setPushAmount] = useState('')
  const [targetConf, setTargetConf] = useState('3')
  const [minHtlcMsat, setMinHtlcMsat] = useState('')
  const [remoteCsvDelay, setRemoteCsvDelay] = useState('144')
  const [minConfs, setMinConfs] = useState('1')
  const [isPrivate, setIsPrivate] = useState(false)

  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (!nodePubkey.trim()) {
      newErrors.nodePubkey = 'Chave pública do nó é obrigatória'
    } else if (
      nodePubkey.length !== 66 ||
      (!nodePubkey.startsWith('02') && !nodePubkey.startsWith('03'))
    ) {
      newErrors.nodePubkey = 'Chave pública deve ter 66 caracteres e começar com 02 ou 03'
    }

    const fundingAmount = parseInt(localFundingAmount)
    if (!localFundingAmount || isNaN(fundingAmount) || fundingAmount < 1000) {
      newErrors.localFundingAmount = 'Valor deve ser pelo menos 1000 satoshis'
    }

    const push = pushAmount ? parseInt(pushAmount) : 0
    if (pushAmount && (isNaN(push) || push < 0 || push > fundingAmount)) {
      newErrors.pushAmount = 'Valor push deve ser entre 0 e o valor de funding'
    }

    const conf = parseInt(targetConf)
    if (isNaN(conf) || conf < 1 || conf > 6) {
      newErrors.targetConf = 'Confirmações alvo devem ser entre 1 e 6'
    }

    const htlc = minHtlcMsat ? parseInt(minHtlcMsat) : undefined
    if (minHtlcMsat && (isNaN(htlc!) || htlc! < 1)) {
      newErrors.minHtlcMsat = 'HTLC mínimo deve ser maior que 0'
    }

    const csv = parseInt(remoteCsvDelay)
    if (isNaN(csv) || csv < 144 || csv > 2016) {
      newErrors.remoteCsvDelay = 'CSV delay deve ser entre 144 e 2016'
    }

    const confs = parseInt(minConfs)
    if (isNaN(confs) || confs < 1) {
      newErrors.minConfs = 'Confirmações mínimas devem ser pelo menos 1'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    const params = {
      nodePubkey: nodePubkey.trim(),
      localFundingAmount: parseInt(localFundingAmount),
      pushSat: pushAmount ? parseInt(pushAmount) : undefined,
      targetConf: parseInt(targetConf),
      minHtlcMsat: minHtlcMsat ? parseInt(minHtlcMsat) : undefined,
      remoteCsvDelay: parseInt(remoteCsvDelay),
      minConfs: parseInt(minConfs),
      private: isPrivate,
    }

    // Validate channel parameters
    const validation = validateChannelParams({
      fundingAmount: params.localFundingAmount,
      pushAmount: params.pushSat,
    })

    if (!validation.valid) {
      Alert.alert('Parâmetros Inválidos', validation.errors.join('\n'))
      return
    }

    try {
      await openChannel(activeWalletId!, params)
      Alert.alert('Sucesso', 'Canal Lightning aberto com sucesso!')
      router.back()
    } catch (error) {
      console.error('Error opening channel:', error)
      Alert.alert('Erro', 'Falha ao abrir canal Lightning')
    }
  }

  const handleClose = () => {
    router.back()
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardAvoidingView}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <Text style={styles.modalTitle}>Abrir Canal Lightning</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Chave Pública do Nó *</Text>
          <TextInput
            style={[styles.input, errors.nodePubkey && styles.inputError]}
            value={nodePubkey}
            onChangeText={setNodePubkey}
            placeholder="02xxxxxxxxx... ou 03xxxxxxxxx..."
            autoCapitalize="none"
            autoCorrect={false}
          />
          {errors.nodePubkey && <Text style={styles.errorText}>{errors.nodePubkey}</Text>}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Valor de Funding ({unit}) *</Text>
          <TextInput
            style={[styles.input, errors.localFundingAmount && styles.inputError]}
            value={localFundingAmount}
            onChangeText={setLocalFundingAmount}
            placeholder="1000"
            keyboardType="numeric"
          />
          {errors.localFundingAmount && (
            <Text style={styles.errorText}>{errors.localFundingAmount}</Text>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Valor Push ({unit})</Text>
          <TextInput
            style={[styles.input, errors.pushAmount && styles.inputError]}
            value={pushAmount}
            onChangeText={setPushAmount}
            placeholder="0"
            keyboardType="numeric"
          />
          {errors.pushAmount && <Text style={styles.errorText}>{errors.pushAmount}</Text>}
        </View>

        <View style={styles.formRow}>
          <View style={[styles.formGroup, styles.formHalf]}>
            <Text style={styles.label}>Confirmações Alvo</Text>
            <TextInput
              style={[styles.input, errors.targetConf && styles.inputError]}
              value={targetConf}
              onChangeText={setTargetConf}
              placeholder="3"
              keyboardType="numeric"
            />
            {errors.targetConf && <Text style={styles.errorText}>{errors.targetConf}</Text>}
          </View>

          <View style={[styles.formGroup, styles.formHalf]}>
            <Text style={styles.label}>CSV Delay Remoto</Text>
            <TextInput
              style={[styles.input, errors.remoteCsvDelay && styles.inputError]}
              value={remoteCsvDelay}
              onChangeText={setRemoteCsvDelay}
              placeholder="144"
              keyboardType="numeric"
            />
            {errors.remoteCsvDelay && <Text style={styles.errorText}>{errors.remoteCsvDelay}</Text>}
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={[styles.formGroup, styles.formHalf]}>
            <Text style={styles.label}>HTLC Mínimo (msat)</Text>
            <TextInput
              style={[styles.input, errors.minHtlcMsat && styles.inputError]}
              value={minHtlcMsat}
              onChangeText={setMinHtlcMsat}
              placeholder="1"
              keyboardType="numeric"
            />
            {errors.minHtlcMsat && <Text style={styles.errorText}>{errors.minHtlcMsat}</Text>}
          </View>

          <View style={[styles.formGroup, styles.formHalf]}>
            <Text style={styles.label}>Confirmações Mínimas</Text>
            <TextInput
              style={[styles.input, errors.minConfs && styles.inputError]}
              value={minConfs}
              onChangeText={setMinConfs}
              placeholder="1"
              keyboardType="numeric"
            />
            {errors.minConfs && <Text style={styles.errorText}>{errors.minConfs}</Text>}
          </View>
        </View>

        <View style={styles.checkboxContainer}>
          <Pressable
            style={[styles.checkbox, isPrivate && styles.checkboxChecked]}
            onPress={() => setIsPrivate(!isPrivate)}
          >
            {isPrivate && <Text style={styles.checkboxMark}>✓</Text>}
          </Pressable>
          <Text style={styles.checkboxLabel}>Canal Privado</Text>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable style={[styles.button, styles.cancelButton]} onPress={handleClose}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>

          <Pressable style={[styles.button, styles.submitButton]} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>Abrir Canal</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    padding: 20,
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
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formHalf: {
    width: '48%',
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
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#2196F3',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: '#2196F3',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
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

export default OpenChannelScreen
