import { View, TouchableOpacity, Text, Modal, Alert } from 'react-native'
import { useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { Utxo } from '@/core/models/transaction'
import Button from '@/ui/components/Button'

interface UtxosProps {
  utxos: Utxo[]
}

export default function Utxos({ utxos }: UtxosProps) {
  const [modalVisible, setModalVisible] = useState(false)

  const totalUtxos = utxos.length

  return (
    <>
      <Button
        onPress={() => setModalVisible(true)}
        style={{
          padding: 16,
          backgroundColor: '#f0f0f0',
          borderRadius: 8,
          margin: 8,
          alignItems: 'center',
        }}
      >
        <Text>{`${totalUtxos} utxos`}</Text>
      </Button>

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, paddingTop: 32, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>UTXOs Details</Text>
          {utxos.map(utxo => (
            <UTXO key={`${utxo.txid}:${utxo.vout}`} utxo={utxo} />
          ))}
          <Button onPress={() => setModalVisible(false)}>Close</Button>
        </View>
      </Modal>
    </>
  )
}

function UTXO({ utxo }: { utxo: Utxo }) {
  const { address, txid, vout, amount, confirmations } = utxo

  const copyTxId = () => {
    Clipboard.setString(txid)
    Alert.alert('Copied', 'TxID copied to clipboard')
  }

  return (
    <View
      style={{
        marginBottom: 12,
        padding: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <Text>Address: {address}</Text>
      <TouchableOpacity onPress={copyTxId}>
        <Text style={{ color: 'blue', textDecorationLine: 'underline' }}>TxID: {txid}</Text>
      </TouchableOpacity>
      <Text>Vout: {vout}</Text>
      <Text>Value: {amount} sats</Text>
      <Text>Confirmations: {confirmations}</Text>
    </View>
  )
}
