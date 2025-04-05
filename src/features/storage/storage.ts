import * as SecureStore from 'expo-secure-store'

const DATA_SIZE_LIMIT = 2048

async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    const jsonValue = JSON.stringify(value)

    if (!(await isValidDataSize(jsonValue))) {
      throw new Error('O tamanho dos dados excede o limite')
    }

    await SecureStore.setItemAsync(key, jsonValue)
  } catch (error) {
    console.error('Erro ao armazenar item:', error)
  }
}

async function getItem<T>(key: string): Promise<T | undefined> {
  try {
    const value = await SecureStore.getItemAsync(key)
    if (value) {
      return JSON.parse(value)
    }
    return undefined
  } catch (error) {
    console.error('Erro ao obter item:', error)
    return undefined
  }
}

async function deleteItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch (error) {
    console.error('Erro ao excluir item:', error)
  }
}

async function isValidDataSize(data: string): Promise<boolean> {
  const size = data.length
  if (size > DATA_SIZE_LIMIT) {
    return false
  }

  return true
}

const storage = {
  setItem,
  getItem,
  deleteItem,
}

export default storage

const test = [
  {
    txid: 'bb1eaa5c09d0b0980411b28f6f4fcad84aa201c7a62c61825b6bf336551effb3',
    hash: 'dacf53a50c6cdc247c874f8e1e7bcd721f408633f6bfd98f3e288178b7af0e4c',
    version: 1,
    size: 223,
    vsize: 141,
    weight: 562,
    locktime: 0,
    vin: [
      {
        txid: '43ff8dedbb739c69b3c632a56f587ba1d12887ceb4bdf95271675c981f516f04',
        vout: 0,
        scriptSig: {
          asm: '',
          hex: '',
        },
        txinwitness: [
          '3045022100d78fbbf9423c737fa9d8ae1da126c4a6759b6234f24839a1d7718dc5e71ff72f022049cba6a290c832b334e150d749b8ea2dffeb4ba9c35165f0455f0b7d557f552c01',
          '037ae22dd4f82803311ac24c80a494c174194645b3465ffef36e03b589e0ada785',
        ],
        sequence: 4294967295,
      },
    ],
    vout: [
      {
        value: 0.00072036,
        n: 0,
        scriptPubKey: {
          asm: '0 384abf2e56c79acb7746ac7089f9829e5b5f923a',
          desc: 'addr(bc1q8p9t7tjkc7dvka6x43cgn7vzned4ly36y78mkh)#4t9h42zw',
          hex: '0014384abf2e56c79acb7746ac7089f9829e5b5f923a',
          address: 'bc1q8p9t7tjkc7dvka6x43cgn7vzned4ly36y78mkh',
          type: 'witness_v0_keyhash',
        },
      },
      {
        value: 0.00170483,
        n: 1,
        scriptPubKey: {
          asm: '0 0242001357a991b257981f101edea051b400bb85',
          desc: 'addr(bc1qqfpqqy6h4xgmy4ucrugpah4q2x6qpwu9yrn5qu)#ay0x44ey',
          hex: '00140242001357a991b257981f101edea051b400bb85',
          address: 'bc1qqfpqqy6h4xgmy4ucrugpah4q2x6qpwu9yrn5qu',
          type: 'witness_v0_keyhash',
        },
      },
    ],
    hex: '01000000000101046f511f985c677152f9bdb4ce8728d1a17b586fa532c6b3699c73bbed8dff430000000000ffffffff026419010000000000160014384abf2e56c79acb7746ac7089f9829e5b5f923af3990200000000001600140242001357a991b257981f101edea051b400bb8502483045022100d78fbbf9423c737fa9d8ae1da126c4a6759b6234f24839a1d7718dc5e71ff72f022049cba6a290c832b334e150d749b8ea2dffeb4ba9c35165f0455f0b7d557f552c0121037ae22dd4f82803311ac24c80a494c174194645b3465ffef36e03b589e0ada78500000000',
    blockhash: '00000000000000000003361d2823aae7f8c3ae0f567a6f3d66f7352ae406fbca',
    confirmations: 51331,
    time: 1713296926,
    blocktime: 1713296926,
  },
  {
    txid: 'b6df56d47a1f268dfb31ec3b9c84a84f607102616475e0e77ab16d4860df490c',
    hash: '55c7486e9f38ac9d22855730070386605365115254bffe216a848e4688ff8a75',
    version: 2,
    size: 372,
    vsize: 209,
    weight: 834,
    locktime: 847030,
    vin: [
      {
        txid: 'bb1eaa5c09d0b0980411b28f6f4fcad84aa201c7a62c61825b6bf336551effb3',
        vout: 0,
        scriptSig: {
          asm: '',
          hex: '',
        },
        txinwitness: [
          '30450221009633adb075cbf9f07263c45798b2cd84c40b628b9e0f686cf3dae9c31a508b520220716a45139dd7701fb071ebb1f405c163eaf7ded37bae84f9863f4f814063b62101',
          '022733dc038e9986d03b0aebb48d8df713619cdc4d31d04a3ccd79bda4c621af1e',
        ],
        sequence: 0,
      },
      {
        txid: '60ba94af3537829575fbef62d764559a3ada1b514e00ad9c247a7b5c8e776345',
        vout: 1,
        scriptSig: {
          asm: '',
          hex: '',
        },
        txinwitness: [
          '3045022100f14d6d401eb4905c1f5fd1227c907808f4d84425e80bc837cf00357bd127269802205b287966f165595a7c67ce42d0f7ec856d7e85b764abe4b75dd1310c4ace2bc601',
          '020ed2ac40276253bc4fa7890cd5655413baa0009cb5446df32eb977cba7cd2c18',
        ],
        sequence: 0,
      },
    ],
    vout: [
      {
        value: 0.00035503,
        n: 0,
        scriptPubKey: {
          asm: '0 bf5f21f1e99c3858f49bb2293310632d58e2d744',
          desc: 'addr(bc1qha0jru0fnsu93aymkg5nxyrr94vw946yphuudq)#2awntnvq',
          hex: '0014bf5f21f1e99c3858f49bb2293310632d58e2d744',
          address: 'bc1qha0jru0fnsu93aymkg5nxyrr94vw946yphuudq',
          type: 'witness_v0_keyhash',
        },
      },
      {
        value: 0.00071941,
        n: 1,
        scriptPubKey: {
          asm: '0 b419cec9246cbbd337b7c0d8ce6e77e406f7507a',
          desc: 'addr(bc1qksvuajfydjaaxdahcrvvumnhusr0w5r6spnkcz)#6gk8tek2',
          hex: '0014b419cec9246cbbd337b7c0d8ce6e77e406f7507a',
          address: 'bc1qksvuajfydjaaxdahcrvvumnhusr0w5r6spnkcz',
          type: 'witness_v0_keyhash',
        },
      },
    ],
    hex: '02000000000102b3ff1e5536f36b5b82612ca6c701a24ad8ca4f6f8fb2110498b0d0095caa1ebb0000000000000000004563778e5c7b7a249cad004e511bda3a9a5564d762effb7595823735af94ba6001000000000000000002af8a000000000000160014bf5f21f1e99c3858f49bb2293310632d58e2d7440519010000000000160014b419cec9246cbbd337b7c0d8ce6e77e406f7507a024830450221009633adb075cbf9f07263c45798b2cd84c40b628b9e0f686cf3dae9c31a508b520220716a45139dd7701fb071ebb1f405c163eaf7ded37bae84f9863f4f814063b6210121022733dc038e9986d03b0aebb48d8df713619cdc4d31d04a3ccd79bda4c621af1e02483045022100f14d6d401eb4905c1f5fd1227c907808f4d84425e80bc837cf00357bd127269802205b287966f165595a7c67ce42d0f7ec856d7e85b764abe4b75dd1310c4ace2bc60121020ed2ac40276253bc4fa7890cd5655413baa0009cb5446df32eb977cba7cd2c18b6ec0c00',
    blockhash: '00000000000000000000d81aeb185b67a47ffebfc19f7dc9f1e2810f9c6a51b1',
    confirmations: 43831,
    time: 1717844767,
    blocktime: 1717844767,
  },
]
