import TcpSocket from 'react-native-tcp-socket'

export type Peer = {
  host: string
  port: number
}

export type Socket = TcpSocket.Socket

export type TLSSocket = TcpSocket.TLSSocket

export type Connection = Socket | TLSSocket
