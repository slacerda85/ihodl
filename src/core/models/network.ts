import { TLSSocket } from 'tls'

export type Peer = {
  host: string
  port: number
}

export type Connection = TLSSocket
