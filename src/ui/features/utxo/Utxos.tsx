import { UTXO } from '@/lib/transactions'
import { View, TouchableOpacity, Text, Modal, Button, Alert } from 'react-native'
import { useState } from 'react'
import * as Clipboard from 'expo-clipboard'

interface UtxosProps {
  utxos: UTXO[]
}

export default function Utxos({ utxos }: UtxosProps) {
  const [modalVisible, setModalVisible] = useState(false)

  const totalUtxos = utxos.length
  const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.amount, 0)

  return (
    <>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{
          padding: 16,
          backgroundColor: '#f0f0f0',
          borderRadius: 8,
          margin: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>UTXOs Summary</Text>
        <Text>Total UTXOs: {totalUtxos}</Text>
        <Text>Balance: {totalBalance} sats</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>UTXOs Details</Text>
          {utxos.map(utxo => (
            <Utxo key={`${utxo.txid}:${utxo.vout}`} utxo={utxo} />
          ))}
          <Button title="Close" onPress={() => setModalVisible(false)} />
        </View>
      </Modal>
    </>
  )
}

function Utxo({ utxo }: { utxo: UTXO }) {
  const { address, txid, vout, amount, confirmations, isSpent } = utxo

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
      <Text>Spent: {isSpent ? 'Yes' : 'No'}</Text>
    </View>
  )
}
