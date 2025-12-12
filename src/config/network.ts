import { hexToUint8Array } from '@/core/lib/utils'

export type NetworkType = 'mainnet' | 'testnet' | 'regtest'

export interface NetworkConfig {
  name: NetworkType
  bech32Hrp: string
  pubKeyHashPrefix: Uint8Array
  scriptHashPrefix: Uint8Array
  wifPrefix: Uint8Array
  bip32: {
    public: number
    private: number
  }
  defaultPort: number
  dnsSeeds: string[]
  lightning: {
    chainHash: Uint8Array
    invoiceHrp: string
  }
  endpoints: {
    boltz: string
    // Add more as needed: trampoline, watchtower, etc.
  }
}

const MAINNET_CHAIN_HASH = hexToUint8Array(
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
)
const TESTNET_CHAIN_HASH = hexToUint8Array(
  '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
)
const REGTEST_CHAIN_HASH = hexToUint8Array(
  '06226e46111a0b59caaf126043eb5bbf28c34f3a5e332a1fc7b2b73cf1889100',
)

export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    bech32Hrp: 'bc',
    pubKeyHashPrefix: new Uint8Array([0x00]),
    scriptHashPrefix: new Uint8Array([0x05]),
    wifPrefix: new Uint8Array([0x80]),
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4,
    },
    defaultPort: 8333,
    dnsSeeds: [
      'seed.bitcoin.sipa.be',
      'dnsseed.bluematt.me',
      'dnsseed.bitcoin.dashjr.org',
      'seed.bitcoinstats.com',
      'seed.bitnodes.io',
      'seed.bitcoin.jonasschnelli.ch',
    ],
    lightning: {
      chainHash: MAINNET_CHAIN_HASH,
      invoiceHrp: 'lnbc',
    },
    endpoints: {
      boltz: 'https://api.boltz.exchange',
    },
  },
  testnet: {
    name: 'testnet',
    bech32Hrp: 'tb',
    pubKeyHashPrefix: new Uint8Array([0x6f]),
    scriptHashPrefix: new Uint8Array([0xc4]),
    wifPrefix: new Uint8Array([0xef]),
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    defaultPort: 18333,
    dnsSeeds: [
      'testnet-seed.bitcoin.jonasschnelli.ch',
      'seed.tbtc.petertodd.org',
      'testnet-seed.bluematt.me',
      'testnet-seed.bitcoin.schildbach.de',
    ],
    lightning: {
      chainHash: TESTNET_CHAIN_HASH,
      invoiceHrp: 'lntb',
    },
    endpoints: {
      boltz: 'https://testnet.boltz.exchange/api',
    },
  },
  regtest: {
    name: 'regtest',
    bech32Hrp: 'bcrt',
    pubKeyHashPrefix: new Uint8Array([0x6f]), // Same as testnet for simplicity
    scriptHashPrefix: new Uint8Array([0xc4]),
    wifPrefix: new Uint8Array([0xef]),
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    defaultPort: 18444,
    dnsSeeds: [], // No seeds for regtest
    lightning: {
      chainHash: REGTEST_CHAIN_HASH,
      invoiceHrp: 'lnbcrt',
    },
    endpoints: {
      boltz: 'http://localhost:9001', // Example for local regtest
    },
  },
}

export function getNetworkConfig(network: NetworkType = 'mainnet'): NetworkConfig {
  return NETWORK_CONFIGS[network]
}

export function getBech32Prefix(network: NetworkType = 'mainnet'): string {
  return `${getNetworkConfig(network).bech32Hrp}1`
}

export function getAllBech32Prefixes(): string[] {
  return Object.values(NETWORK_CONFIGS).map(config => config.bech32Hrp)
}

export function getInvoicePrefix(network: NetworkType = 'mainnet'): string {
  return getNetworkConfig(network).lightning.invoiceHrp
}

export function getAllInvoicePrefixes(): string[] {
  return Object.values(NETWORK_CONFIGS).map(config => config.lightning.invoiceHrp)
}
