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

export { setItem, getItem, deleteItem }
