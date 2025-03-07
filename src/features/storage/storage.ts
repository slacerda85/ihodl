import * as SecureStore from 'expo-secure-store'

const DATA_SIZE_LIMIT = 2048

export interface Wallet {
  id: string
  name: string
  keys: string[]
  balance?: number
}

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

/* import { MMKV } from 'react-native-mmkv'

// Função fictícia para obter a chave de criptografia (pode vir de um keychain ou senha)
const getEncryptionKey = (): string => {
  // Implementação real dependeria do caso, como derivar de uma senha
  return 'sua-chave-secreta-aqui'
}

export class Storage {
  private storage: MMKV

  constructor() {
    const encryptionKey = getEncryptionKey()
    this.storage = new MMKV({
      id: 'secure-storage',
      encryptionKey, // Dados criptografados para segurança
    })
  }

  // Métodos genéricos para manipular dados
  setItem<T>(key: string, value: T): void {
    this.storage.set(key, JSON.stringify(value))
  }

  getItem<T>(key: string): T | undefined {
    const value = this.storage.getString(key)
    return value ? JSON.parse(value) : undefined
  }

  deleteItem(key: string): void {
    this.storage.delete(key)
  }

  clearAll(): void {
    this.storage.clearAll()
  }

  // Métodos específicos para carteiras
  saveWallet(wallet: Wallet): void {
    this.setItem(`wallet_${wallet.id}`, wallet)
  }

  getWallet(id: string): Wallet | undefined {
    return this.getItem<Wallet>(`wallet_${id}`)
  }
}

// Interface para tipagem de carteiras
export interface Wallet {
  id: string
  name: string
  keys: string[]
  balance?: number
}
 */
