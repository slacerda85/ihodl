export interface KeyVersion {
  private: Uint8Array
  public: Uint8Array
}

export type KeyVersionType = 'bip32' | 'bip49' | 'bip84'
