import { View, Text } from 'react-native'
import { useAccount } from '../account/AccountProvider'

export default function DebugUtxos() {
  const { accounts } = useAccount()

  const sortedTxids = accounts.flatMap(account => account.txs.map(tx => tx.txid)).sort()

  return (
    <View>
      {sortedTxids.map((txid, index) => (
        <Text
          style={{ fontFamily: 'Courier New', fontSize: 18 }}
          key={index}
        >{`${txid.slice(0, 5)}... ${txid.slice(-8)}`}</Text>
      ))}
    </View>
  )
}
