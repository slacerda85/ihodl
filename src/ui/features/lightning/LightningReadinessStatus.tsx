/**
 * LightningReadinessStatus
 *
 * Componente que exibe o status de readiness do Lightning
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useLightningReadiness } from './hooks/useLightningReadiness'
import { ReadinessLevel } from '@/core/models/lightning/readiness'

/**
 * Componente que exibe o status de readiness do Lightning
 *
 * @example
 * ```tsx
 * <LightningReadinessStatus />
 * ```
 */
export function LightningReadinessStatus() {
  const { readinessLevel, readinessState } = useLightningReadiness()

  const getStatusText = (level: ReadinessLevel): string => {
    switch (level) {
      case ReadinessLevel.NOT_READY:
        return 'Não pronto'
      case ReadinessLevel.CAN_RECEIVE:
        return 'Pronto para receber'
      case ReadinessLevel.CAN_SEND:
        return 'Pronto para enviar'
      case ReadinessLevel.FULLY_READY:
        return 'Totalmente pronto'
      default:
        return 'Desconhecido'
    }
  }

  const getStatusColor = (level: ReadinessLevel): string => {
    switch (level) {
      case ReadinessLevel.NOT_READY:
        return '#ff4444'
      case ReadinessLevel.CAN_RECEIVE:
        return '#ffaa00'
      case ReadinessLevel.CAN_SEND:
        return '#00aa44'
      case ReadinessLevel.FULLY_READY:
        return '#00aa44'
      default:
        return '#666666'
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.status, { color: getStatusColor(readinessLevel) }]}>
        Lightning: {getStatusText(readinessLevel)}
      </Text>
      <View style={styles.details}>
        <Text style={styles.detail}>Carteira: {readinessState.isWalletLoaded ? '✅' : '❌'}</Text>
        <Text style={styles.detail}>
          Transporte: {readinessState.isTransportConnected ? '✅' : '❌'}
        </Text>
        <Text style={styles.detail}>Peer: {readinessState.isPeerConnected ? '✅' : '❌'}</Text>
        <Text style={styles.detail}>
          Canais: {readinessState.isChannelReestablished ? '✅' : '❌'}
        </Text>
        <Text style={styles.detail}>Gossip: {readinessState.isGossipSynced ? '✅' : '❌'}</Text>
        <Text style={styles.detail}>Watcher: {readinessState.isWatcherRunning ? '✅' : '❌'}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    margin: 8,
  },
  status: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detail: {
    fontSize: 12,
    marginRight: 12,
    marginBottom: 4,
    color: '#333',
  },
})
