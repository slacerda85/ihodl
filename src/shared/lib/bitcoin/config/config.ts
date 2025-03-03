type Network = 'mainnet' | 'testnet'

type RPC = {
  host: string
  port: number
  username: string
  password: string
}

type Purpose = "44'" | "49'" | "84'"
type CoinType =
  | "0'" // Bitcoin
  | "1'" // Testnet

type Settings = Record<
  Network,
  {
    key: {
      purpose: Purpose
      coinType: CoinType
      version: Buffer
    }
    transaction: {}
  }
>

type Config = {
  rpc: RPC
  settings: Settings
}

export const CONFIG: Config = {
  rpc: {
    host: process.env.RPC_HOST as string,
    port: process.env.RPC_PORT as unknown as number,
    username: process.env.RPC_USER as string,
    password: process.env.RPC_PASSWORD as string,
  },
  settings: {
    mainnet: {
      key: {
        purpose: "84'",
        coinType: "0'",
        version: Buffer.from([0x04, 0x88, 0xad, 0xe4]), // xprv
      },
      transaction: {},
    },
    testnet: {
      key: {
        purpose: "84'",
        coinType: "1'",
        version: Buffer.from([0x04, 0x35, 0x83, 0x94]),
      },
      transaction: {},
    },
  },
}
