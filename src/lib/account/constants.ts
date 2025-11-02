import { KeyVersionType, KeyVersion, NetworkType } from './types'

export const KEY_VERSIONS: Record<KeyVersionType, Record<NetworkType, KeyVersion>> = {
  bip32: {
    mainnet: {
      private: new Uint8Array([0x04, 0x88, 0xad, 0xe4]), // xprv
      public: new Uint8Array([0x04, 0x88, 0xb2, 0x1e]), // xpub
    },
    testnet: {
      private: new Uint8Array([0x04, 0x35, 0x83, 0x94]), // tprv
      public: new Uint8Array([0x04, 0x35, 0x87, 0xcf]), // tpub
    },
    regtest: {
      private: new Uint8Array([0x04, 0x35, 0x83, 0x94]), // tprv
      public: new Uint8Array([0x04, 0x35, 0x87, 0xcf]), // tpub
    },
  },
  bip49: {
    mainnet: {
      private: new Uint8Array([0x04, 0x4a, 0x4e, 0x28]), // yprv
      public: new Uint8Array([0x04, 0x4a, 0x52, 0x62]), // ypub
    },
    testnet: {
      private: new Uint8Array([0x04, 0x4a, 0x2b, 0x2d]), // uprv
      public: new Uint8Array([0x04, 0x4a, 0x2f, 0x67]), // upub
    },
    regtest: {
      private: new Uint8Array([0x04, 0x4a, 0x2b, 0x2d]), // uprv
      public: new Uint8Array([0x04, 0x4a, 0x2f, 0x67]), // upub
    },
  },
  bip84: {
    mainnet: {
      private: new Uint8Array([0x04, 0xb2, 0x43, 0x0c]), // zprv
      public: new Uint8Array([0x04, 0xb2, 0x47, 0x46]), // zpub
    },
    testnet: {
      private: new Uint8Array([0x04, 0x5f, 0x1c, 0xf6]), // vprv
      public: new Uint8Array([0x04, 0x5f, 0x21, 0x30]), // vpub
    },
    regtest: {
      private: new Uint8Array([0x04, 0x5f, 0x1c, 0xf6]), // vprv
      public: new Uint8Array([0x04, 0x5f, 0x21, 0x30]), // vpub
    },
  },
}
