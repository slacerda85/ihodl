/**
 * Exemplo de uso dos componentes e hooks de readiness
 *
 * Este arquivo demonstra como usar o sistema de readiness implementado
 * no item 4.1.4 do roadmap.
 */

import React from 'react'
import { View, Text, Button } from 'react-native'
import {
  LightningReadinessGuard,
  LightningInitStatus,
  LightningTrafficControlStatus,
} from '@/ui/features/lightning'
import { useLightningReadinessState, useLightningReadinessLevel } from '@/ui/features/app-provider'
import { ReadinessLevel } from '@/core/models/lightning/readiness'

/**
 * Exemplo de componente que usa o hook useLightningReadiness
 */
function ReadinessAwareComponent() {
  const readinessState = useLightningReadinessState()
  const readinessLevel = useLightningReadinessLevel()

  return (
    <View>
      <Text>Nível de Readiness: {readinessLevel}</Text>
      <Text>Carteira carregada: {readinessState.isWalletLoaded ? 'Sim' : 'Não'}</Text>
      <Text>Transporte conectado: {readinessState.isTransportConnected ? 'Sim' : 'Não'}</Text>
    </View>
  )
}

/**
 * Exemplo de componente que usa LightningReadinessGuard
 */
function SendPaymentButton() {
  return (
    <LightningReadinessGuard
      requiredLevel={ReadinessLevel.CAN_SEND}
      fallback={<Text>Lightning não está pronto para enviar pagamentos</Text>}
    >
      <Button title="Enviar Pagamento" onPress={() => console.log('Pagamento enviado!')} />
    </LightningReadinessGuard>
  )
}

/**
 * Exemplo de componente que usa LightningInitStatus
 */
function InitStatusScreen() {
  return (
    <View>
      <LightningInitStatus />
    </View>
  )
}

/**
 * Exemplo de componente que usa LightningTrafficControlStatus
 */
function TrafficControlScreen() {
  return (
    <View>
      <LightningTrafficControlStatus />
    </View>
  )
}

/**
 * Componente principal que demonstra todos os recursos
 */
export function ReadinessDemoScreen() {
  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>
        Demonstração do Sistema de Readiness
      </Text>

      <ReadinessAwareComponent />

      <View style={{ marginTop: 20 }}>
        <SendPaymentButton />
      </View>

      <View style={{ marginTop: 20 }}>
        <InitStatusScreen />
      </View>

      <View style={{ marginTop: 20 }}>
        <TrafficControlScreen />
      </View>
    </View>
  )
}
