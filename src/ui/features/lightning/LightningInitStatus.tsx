/**
 * LightningInitStatus
 *
 * Componente que exibe o status de inicialização do Lightning Network
 */

import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useLightningState } from '@/ui/features/app-provider'

/**
 * Componente que exibe o status de inicialização do Lightning
 *
 * @example
 * ```tsx
 * <LightningInitStatus />
 * ```
 */
export function LightningInitStatus() {
  const lightningState = useLightningState()

  const getStatusText = (): string => {
    if (lightningState.error) return 'Erro'
    if (lightningState.isLoading) return 'Inicializando...'
    if (lightningState.isInitialized) return 'Pronto'
    return 'Inativo'
  }

  const getStatusColor = (): string => {
    if (lightningState.error) return '#ff4444'
    if (lightningState.isLoading) return '#007AFF'
    if (lightningState.isInitialized) return '#00aa44'
    return '#666666'
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {lightningState.isLoading && (
          <ActivityIndicator size="small" color="#007AFF" style={styles.spinner} />
        )}
        <Text style={[styles.phase, { color: getStatusColor() }]}>{getStatusText()}</Text>
      </View>

      {lightningState.error && <Text style={styles.error}>{lightningState.error}</Text>}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  spinner: {
    marginRight: 8,
  },
  phase: {
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#e9ecef',
    borderRadius: 2,
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    minWidth: 32,
    textAlign: 'right',
  },
  error: {
    fontSize: 12,
    color: '#ff4444',
    marginTop: 4,
  },
})
