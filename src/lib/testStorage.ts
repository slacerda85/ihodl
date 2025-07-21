/**
 * Teste para verificar se o storage está funcionando corretamente
 * Execute este arquivo para debugar problemas com getBalance e fetchTransactions
 */

// Para testar no console do React Native Debugger ou no navegador
export function testStorageFunctions() {
  console.log('=== Testando Storage Functions ===')

  try {
    // Importar storage dinamicamente para evitar problemas de import
    const useStorage = require('../features/storage/useStorage').default
    const state = useStorage.getState()

    console.log('1. Estado básico:')
    console.log('   - Wallets:', state.wallets?.length || 0)
    console.log('   - Active Wallet ID:', state.activeWalletId)

    console.log('2. Objeto TX:')
    console.log('   - tx object exists:', !!state.tx)
    console.log('   - tx type:', typeof state.tx)

    if (state.tx) {
      console.log('3. Funções TX:')
      console.log('   - getBalance type:', typeof state.tx.getBalance)
      console.log('   - fetchTransactions type:', typeof state.tx.fetchTransactions)
      console.log('   - getUtxos type:', typeof state.tx.getUtxos)
      console.log('   - getTransactionAnalysis type:', typeof state.tx.getTransactionAnalysis)

      console.log('4. Estado TX:')
      console.log('   - walletCaches length:', state.tx.walletCaches?.length || 0)
      console.log('   - loadingTxState:', state.tx.loadingTxState)

      // Teste das funções se existirem
      if (typeof state.tx.getBalance === 'function') {
        console.log('5. Teste getBalance:')
        if (state.activeWalletId) {
          try {
            const balance = state.tx.getBalance(state.activeWalletId)
            console.log('   - Balance for active wallet:', balance)
          } catch (error) {
            console.log('   - Error calling getBalance:', error.message)
          }
        } else {
          console.log('   - No active wallet to test')
        }
      } else {
        console.log('5. getBalance NÃO é uma função!')
      }
    } else {
      console.log('3. TX object não existe!')
    }
  } catch (error) {
    console.error('Erro no teste:', error)
  }

  console.log('================================')
}

// Função para forçar recriação do storage
export function recreateStorage() {
  try {
    console.log('Forçando recriação do storage...')

    // Limpar storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('app-storage')
    } else {
      const { MMKV } = require('react-native-mmkv')
      const storage = new MMKV()
      storage.delete('app-storage')
    }

    // Recarregar aplicação seria ideal aqui
    console.log('Storage limpo. Reinicie a aplicação para recriar as funções.')
  } catch (error) {
    console.error('Erro ao recriar storage:', error)
  }
}

// Para usar no console:
// import { testStorageFunctions, recreateStorage } from './path/to/testStorage'
// testStorageFunctions()
// recreateStorage() // se necessário
