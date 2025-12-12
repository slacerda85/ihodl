/**
 * LightningTrafficControlStatus
 *
 * Componente que exibe o status do TrafficControl
 */

import React from 'react'
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native'
import { NetInfoStateType } from '@react-native-community/netinfo'
import {
  useTrafficControl,
  useWalletAvailability,
  useDisconnectCount,
} from './hooks/useTrafficControl'

/**
 * Componente que exibe o status do TrafficControl
 *
 * @example
 * ```tsx
 * <LightningTrafficControlStatus />
 * ```
 */
export function LightningTrafficControlStatus() {
  const {
    canConnect,
    walletIsAvailable,
    internetIsAvailable,
    networkType,
    isConnectionExpensive,
    disconnectCount,
  } = useTrafficControl()
  const { setWalletAvailable } = useWalletAvailability()
  const { increment, decrement, reset } = useDisconnectCount()

  const getStatusColor = (condition: boolean): string => {
    return condition ? '#00aa44' : '#ff4444'
  }

  const getCanConnectColor = (): string => {
    return canConnect ? '#00aa44' : '#ffaa00'
  }

  const getNetworkTypeDisplay = (type: NetInfoStateType): string => {
    switch (type) {
      case NetInfoStateType.wifi:
        return 'WiFi'
      case NetInfoStateType.cellular:
        return 'Celular'
      case NetInfoStateType.bluetooth:
        return 'Bluetooth'
      case NetInfoStateType.ethernet:
        return 'Ethernet'
      case NetInfoStateType.wimax:
        return 'WiMAX'
      case NetInfoStateType.vpn:
        return 'VPN'
      case NetInfoStateType.other:
        return 'Outro'
      case NetInfoStateType.none:
      default:
        return 'Nenhuma'
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Traffic Control</Text>

      {/* Status de conexão */}
      <View style={styles.statusRow}>
        <Text style={styles.label}>Pode conectar:</Text>
        <Text style={[styles.value, { color: getCanConnectColor() }]}>
          {canConnect ? '✅ Sim' : '⚠️ Não'}
        </Text>
      </View>

      {/* Condições */}
      <View style={styles.conditions}>
        <View style={styles.conditionRow}>
          <Text style={styles.conditionLabel}>Carteira disponível:</Text>
          <Text style={[styles.conditionValue, { color: getStatusColor(walletIsAvailable) }]}>
            {walletIsAvailable ? '✅' : '❌'}
          </Text>
        </View>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionLabel}>Internet disponível:</Text>
          <Text style={[styles.conditionValue, { color: getStatusColor(internetIsAvailable) }]}>
            {internetIsAvailable ? '✅' : '❌'}
          </Text>
        </View>

        <View style={styles.conditionRow}>
          <Text style={styles.conditionLabel}>Tipo de rede:</Text>
          <Text style={styles.conditionValue}>{getNetworkTypeDisplay(networkType)}</Text>
        </View>

        {isConnectionExpensive && (
          <View style={styles.conditionRow}>
            <Text style={styles.conditionLabel}>Conexão cara:</Text>
            <Text style={[styles.conditionValue, { color: '#ff9500' }]}>⚠️ Dados móveis</Text>
          </View>
        )}

        <View style={styles.conditionRow}>
          <Text style={styles.conditionLabel}>Contador de desconexões:</Text>
          <Text style={[styles.conditionValue, { color: getStatusColor(disconnectCount <= 0) }]}>
            {disconnectCount}
          </Text>
        </View>
      </View>

      {/* Controles manuais */}
      <View style={styles.controls}>
        <Text style={styles.sectionTitle}>Controles Manuais</Text>

        {/* Controle de carteira */}
        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Carteira:</Text>
          <Switch
            value={walletIsAvailable}
            onValueChange={setWalletAvailable}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={walletIsAvailable ? '#f5dd4b' : '#f4f3f4'}
          />
        </View>

        {/* Controle de desconexões */}
        <View style={styles.disconnectControls}>
          <Text style={styles.controlLabel}>Desconexões:</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={() => increment()}>
              <Text style={styles.buttonText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => decrement()}>
              <Text style={styles.buttonText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={reset}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    margin: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  value: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  conditions: {
    marginBottom: 16,
  },
  conditionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  conditionLabel: {
    fontSize: 14,
    color: '#666',
  },
  conditionValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  controls: {
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlLabel: {
    fontSize: 14,
    color: '#666',
  },
  disconnectControls: {
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 40,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: '#ff9500',
    flex: 1,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
})
