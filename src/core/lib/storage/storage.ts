import { MMKV } from 'react-native-mmkv'

const storage = new MMKV()

export async function get<T = any>(key: string): Promise<T | null> {
  try {
    const data = storage.getString(key)
    if (data) {
      return JSON.parse(data)
    }
    return null
  } catch (error) {
    console.error(`[storage] Error reading ${key}:`, error)
    return null
  }
}

export async function set<T = any>(key: string, value: T): Promise<void> {
  try {
    storage.set(key, JSON.stringify(value))
  } catch (error) {
    console.error(`[storage] Error saving ${key}:`, error)
  }
}

export async function remove(key: string): Promise<void> {
  try {
    storage.delete(key)
  } catch (error) {
    console.error(`[storage] Error removing ${key}:`, error)
  }
}

export async function getNumber(key: string): Promise<number | null> {
  try {
    const data = storage.getNumber(key)
    return data ?? null
  } catch (error) {
    console.error(`[storage] Error reading number ${key}:`, error)
    return null
  }
}

export async function setNumber(key: string, value: number): Promise<void> {
  try {
    storage.set(key, value)
  } catch (error) {
    console.error(`[storage] Error saving number ${key}:`, error)
  }
}
