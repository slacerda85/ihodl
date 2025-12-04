import React, { useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Switch,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
} from 'react-native'
import colors from '@/ui/colors'
import { useSettings } from '@/ui/features/settings'
import { LightningNetwork } from './state'

interface LightningSectionProps {
  isDark: boolean
}

interface SettingRowProps {
  label: string
  description?: string
  isDark: boolean
  children: React.ReactNode
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, isDark, children }) => (
  <View style={styles.settingRow}>
    <View style={styles.settingInfo}>
      <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>{label}</Text>
      {description && (
        <Text style={[styles.settingDescription, isDark && styles.settingDescriptionDark]}>
          {description}
        </Text>
      )}
    </View>
    <View style={styles.settingControl}>{children}</View>
  </View>
)

interface NetworkSelectorProps {
  value: LightningNetwork
  onChange: (network: LightningNetwork) => void
  isDark: boolean
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({ value, onChange, isDark }) => {
  const [modalVisible, setModalVisible] = useState(false)

  const networks: { value: LightningNetwork; label: string }[] = [
    { value: 'mainnet', label: 'Mainnet' },
    { value: 'testnet', label: 'Testnet' },
    { value: 'regtest', label: 'Regtest' },
  ]

  const currentLabel = networks.find(n => n.value === value)?.label || 'Mainnet'

  return (
    <>
      <TouchableOpacity
        style={[styles.networkButton, isDark && styles.networkButtonDark]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.networkButtonText, isDark && styles.networkButtonTextDark]}>
          {currentLabel}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              Selecionar Rede
            </Text>
            {networks.map(network => (
              <TouchableOpacity
                key={network.value}
                style={[
                  styles.networkOption,
                  value === network.value && styles.networkOptionSelected,
                  isDark && styles.networkOptionDark,
                ]}
                onPress={() => {
                  onChange(network.value)
                  setModalVisible(false)
                }}
              >
                <Text
                  style={[
                    styles.networkOptionText,
                    value === network.value && styles.networkOptionTextSelected,
                    isDark && styles.networkOptionTextDark,
                  ]}
                >
                  {network.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

export default function LightningSection({ isDark }: LightningSectionProps) {
  const { lightning, dispatch, actions } = useSettings()

  const handleNetworkChange = (network: LightningNetwork) => {
    dispatch(actions.setLightningNetwork(network))
  }

  const handleTrampolineChange = (enabled: boolean) => {
    dispatch(actions.setTrampolineRouting(enabled))
  }

  const handleZeroConfChange = (enabled: boolean) => {
    dispatch(actions.setZeroConfEnabled(enabled))
  }

  const handleMppChange = (enabled: boolean) => {
    dispatch(actions.setMppEnabled(enabled))
  }

  const handleAutoChannelChange = (enabled: boolean) => {
    dispatch(actions.setAutoChannelManagement(enabled))
  }

  const handleBaseFeeChange = (value: string) => {
    const baseFee = parseInt(value, 10)
    if (!isNaN(baseFee) && baseFee >= 0) {
      dispatch(actions.setLightningFeeConfig({ baseFee }))
    }
  }

  const handleFeeRateChange = (value: string) => {
    const feeRate = parseFloat(value) / 100 // Converter percentual para decimal
    if (!isNaN(feeRate) && feeRate >= 0 && feeRate <= 1) {
      dispatch(actions.setLightningFeeConfig({ feeRate }))
    }
  }

  const handleMinChannelSizeChange = (value: string) => {
    const minChannelSize = parseInt(value, 10)
    if (!isNaN(minChannelSize) && minChannelSize >= 0) {
      dispatch(actions.setLightningFeeConfig({ minChannelSize }))
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
        ⚡ Lightning Network
      </Text>

      <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>Rede</Text>

      <SettingRow label="Rede Bitcoin" description="Rede utilizada para transações" isDark={isDark}>
        <NetworkSelector value={lightning.network} onChange={handleNetworkChange} isDark={isDark} />
      </SettingRow>

      <View style={[styles.divider, isDark && styles.dividerDark]} />

      <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>
        Recursos do Protocolo
      </Text>

      <SettingRow
        label="Trampoline Routing"
        description="Delega cálculo de rota para nós intermediários"
        isDark={isDark}
      >
        <Switch
          value={lightning.trampolineRoutingEnabled}
          onValueChange={handleTrampolineChange}
          trackColor={{ false: colors.disabled, true: colors.primary }}
          thumbColor={colors.white}
        />
      </SettingRow>

      <SettingRow
        label="Zero-Conf Channels"
        description="Aceitar canais sem confirmação on-chain"
        isDark={isDark}
      >
        <Switch
          value={lightning.zeroConfEnabled}
          onValueChange={handleZeroConfChange}
          trackColor={{ false: colors.disabled, true: colors.primary }}
          thumbColor={colors.white}
        />
      </SettingRow>

      <SettingRow
        label="Multi-Part Payments (MPP)"
        description="Dividir pagamentos em múltiplas partes"
        isDark={isDark}
      >
        <Switch
          value={lightning.mppEnabled}
          onValueChange={handleMppChange}
          trackColor={{ false: colors.disabled, true: colors.primary }}
          thumbColor={colors.white}
        />
      </SettingRow>

      <View style={[styles.divider, isDark && styles.dividerDark]} />

      <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>
        Gerenciamento de Canais
      </Text>

      <SettingRow
        label="Gerenciamento Automático"
        description="Abrir/fechar canais automaticamente conforme necessidade"
        isDark={isDark}
      >
        <Switch
          value={lightning.autoChannelManagement}
          onValueChange={handleAutoChannelChange}
          trackColor={{ false: colors.disabled, true: colors.primary }}
          thumbColor={colors.white}
        />
      </SettingRow>

      <View style={[styles.divider, isDark && styles.dividerDark]} />

      <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>
        Taxas de Abertura de Canal
      </Text>

      <View style={styles.feeInputContainer}>
        <View style={styles.feeInputRow}>
          <Text style={[styles.feeLabel, isDark && styles.feeLabelDark]}>Taxa Base (sats)</Text>
          <TextInput
            style={[styles.feeInput, isDark && styles.feeInputDark]}
            value={lightning.feeConfig.baseFee.toString()}
            onChangeText={handleBaseFeeChange}
            keyboardType="numeric"
            placeholder="1000"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.feeInputRow}>
          <Text style={[styles.feeLabel, isDark && styles.feeLabelDark]}>Taxa Variável (%)</Text>
          <TextInput
            style={[styles.feeInput, isDark && styles.feeInputDark]}
            value={(lightning.feeConfig.feeRate * 100).toFixed(2)}
            onChangeText={handleFeeRateChange}
            keyboardType="decimal-pad"
            placeholder="1.00"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.feeInputRow}>
          <Text style={[styles.feeLabel, isDark && styles.feeLabelDark]}>
            Tamanho Mínimo do Canal (sats)
          </Text>
          <TextInput
            style={[styles.feeInput, isDark && styles.feeInputDark]}
            value={lightning.feeConfig.minChannelSize.toString()}
            onChangeText={handleMinChannelSizeChange}
            keyboardType="numeric"
            placeholder="100000"
            placeholderTextColor={colors.placeholder}
          />
        </View>
      </View>

      <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
        Essas configurações afetam a abertura de novos canais Lightning. A taxa base é cobrada por
        abertura, e a taxa variável é um percentual do valor do canal.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
    marginBottom: 20,
  },
  sectionTitleDark: {
    color: colors.textSecondary.dark,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 12,
    marginTop: 8,
  },
  subsectionTitleDark: {
    color: colors.text.dark,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 60,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: colors.text.light,
    fontWeight: '500',
  },
  settingLabelDark: {
    color: colors.text.dark,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary.light,
    marginTop: 4,
  },
  settingDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  settingControl: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 16,
  },
  dividerDark: {
    backgroundColor: colors.border.dark,
  },
  networkButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  networkButtonDark: {
    backgroundColor: colors.primary,
  },
  networkButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  networkButtonTextDark: {
    color: colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background.light,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalContentDark: {
    backgroundColor: colors.secondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalTitleDark: {
    color: colors.text.dark,
  },
  networkOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: colors.divider,
  },
  networkOptionDark: {
    backgroundColor: colors.border.dark,
  },
  networkOptionSelected: {
    backgroundColor: colors.primary,
  },
  networkOptionText: {
    fontSize: 16,
    color: colors.text.light,
    textAlign: 'center',
  },
  networkOptionTextDark: {
    color: colors.text.dark,
  },
  networkOptionTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  feeInputContainer: {
    marginTop: 8,
  },
  feeInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  feeLabel: {
    fontSize: 14,
    color: colors.text.light,
    flex: 1,
  },
  feeLabelDark: {
    color: colors.text.dark,
  },
  feeInput: {
    backgroundColor: colors.divider,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text.light,
    width: 120,
    textAlign: 'right',
  },
  feeInputDark: {
    backgroundColor: colors.border.dark,
    color: colors.text.dark,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary.light,
    marginTop: 16,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
})
