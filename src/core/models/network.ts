import TcpSocket from 'react-native-tcp-socket'

export type Peer = {
  host: string
  port: number
}

export type Socket = TcpSocket.Socket

export type TLSSocket = TcpSocket.TLSSocket

export type Connection = Socket | TLSSocket

const MAINNET: Uint8Array = new Uint8Array([0x00, 0x14, 0x1e, 0x04])
const TESTNET: Uint8Array = new Uint8Array([0x6f, 0xc4, 0x1e, 0x04])

// criado por ia mas nao usado ainda
export const networks = {
  mainnet: {
    name: 'mainnet',
    bech32Hrp: 'bc',
    pubKeyHashPrefix: MAINNET,
    scriptHashPrefix: new Uint8Array([0x05, 0xc4, 0x1e, 0x04]),
    wifPrefix: new Uint8Array([0x80, 0x14, 0x1e, 0x04]),
    defaultPort: 8333,
    dnsSeeds: [
      'seed.bitcoin.sipa.be',
      'dnsseed.bluematt.me',
      'dnsseed.bitcoin.dashjr.org',
      'seed.bitcoinstats.com',
      'seed.bitnodes.io',
      'seed.bitcoin.jonasschnelli.ch',
    ],
  },
  testnet: {
    name: 'testnet',
    bech32Hrp: 'tb',
    pubKeyHashPrefix: TESTNET,
    scriptHashPrefix: new Uint8Array([0xc4, 0xc4, 0x1e, 0x04]),
    wifPrefix: new Uint8Array([0xef, 0xc4, 0x1e, 0x04]),
    defaultPort: 18333,
    dnsSeeds: [
      'testnet-seed.bitcoin.jonasschnelli.ch',
      'seed.tbtc.petertodd.org',
      'testnet-seed.bluematt.me',
      'testnet-seed.bitcoin.schildbach.de',
    ],
  },
}
