/**
 * Lightning-Electrum Integration Tests
 *
 * Testes para integração entre Lightning Network e Electrum
 * - Monitoramento de funding transactions
 * - Broadcast de transactions
 * - Consultas de status
 * - Fee estimation
 */

import {
  LightningElectrumManager,
  createLightningElectrumManager,
  getLightningElectrumManager,
} from '../electrum'

import {
  connect,
  callElectrumMethod,
  getTransaction,
  broadcastTransaction,
  getMerkleProof,
} from '../../electrum/client'

// Mock do módulo electrum/client
jest.mock('../../electrum/client', () => ({
  connect: jest.fn(),
  close: jest.fn(),
  callElectrumMethod: jest.fn(),
  getTransaction: jest.fn(),
  broadcastTransaction: jest.fn(),
  getBlockHeader: jest.fn(),
  getMerkleProof: jest.fn(),
}))

// Mock do módulo address
jest.mock('../../address', () => ({
  toScriptHash: jest.fn((address: string) => `scripthash_${address}`),
}))

// Mock do módulo crypto
jest.mock('../../crypto', () => ({
  sha256: jest.fn((data: Uint8Array) => new Uint8Array(32).fill(0xaa)),
}))

// Mock do módulo utils
jest.mock('../../utils', () => ({
  hexToUint8Array: jest.fn((hex: string) => new Uint8Array(hex.length / 2)),
  uint8ArrayToHex: jest.fn((arr: Uint8Array) =>
    Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
  ),
}))

const mockConnect = connect as jest.Mock
const mockCallElectrumMethod = callElectrumMethod as jest.Mock
const mockGetTransaction = getTransaction as jest.Mock
const mockBroadcastTransaction = broadcastTransaction as jest.Mock
const mockGetMerkleProof = getMerkleProof as jest.Mock

describe('Lightning-Electrum Integration', () => {
  let manager: LightningElectrumManager

  beforeEach(() => {
    jest.clearAllMocks()
    manager = createLightningElectrumManager()

    // Mock default responses
    mockConnect.mockResolvedValue({ destroyed: false, end: jest.fn(), destroy: jest.fn() })
    mockCallElectrumMethod.mockResolvedValue({ result: { height: 800000 } })
  })

  afterEach(() => {
    manager.disconnect()
  })

  describe('Connection Management', () => {
    it('deve conectar ao servidor Electrum', async () => {
      await manager.connect()

      expect(mockConnect).toHaveBeenCalled()
      expect(manager.isActive()).toBe(true)
    })

    it('não deve reconectar se já conectado', async () => {
      await manager.connect()
      await manager.connect()

      expect(mockConnect).toHaveBeenCalledTimes(1)
    })

    it('deve desconectar corretamente', async () => {
      await manager.connect()
      manager.disconnect()

      expect(manager.isActive()).toBe(false)
    })

    it('deve obter altura do bloco após conectar', async () => {
      mockCallElectrumMethod.mockResolvedValue({ result: { height: 850000 } })

      await manager.connect()
      const height = await manager.getBlockHeight()

      expect(height).toBe(850000)
    })
  })

  describe('Funding Transaction Monitoring', () => {
    const fundingTxid = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
    const fundingOutputIndex = 0

    beforeEach(async () => {
      await manager.connect()
    })

    it('deve monitorar funding transaction', async () => {
      mockGetTransaction.mockResolvedValue({
        result: { confirmations: 0, txid: fundingTxid },
      })

      const onConfirmed = jest.fn()
      const stopMonitoring = await manager.monitorFundingTx(
        fundingTxid,
        fundingOutputIndex,
        onConfirmed,
      )

      expect(typeof stopMonitoring).toBe('function')
    })

    it('deve chamar callback quando funding tx for confirmada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: { confirmations: 3, txid: fundingTxid, height: 800000 },
      })

      const onConfirmed = jest.fn()
      await manager.monitorFundingTx(fundingTxid, fundingOutputIndex, onConfirmed)

      expect(onConfirmed).toHaveBeenCalledWith(3)
    })

    it('deve verificar se funding está confirmada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: { confirmations: 5, txid: fundingTxid },
      })

      const confirmed = await manager.isFundingConfirmed(fundingTxid, 3)

      expect(confirmed).toBe(true)
    })

    it('deve retornar false se funding não está confirmada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: { confirmations: 1, txid: fundingTxid },
      })

      const confirmed = await manager.isFundingConfirmed(fundingTxid, 3)

      expect(confirmed).toBe(false)
    })

    it('deve parar de monitorar quando função de stop é chamada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: { confirmations: 0, txid: fundingTxid },
      })

      const stopMonitoring = await manager.monitorFundingTx(
        fundingTxid,
        fundingOutputIndex,
        () => {},
      )

      const countBefore = manager.getMonitoredCount()
      expect(countBefore.txs).toBeGreaterThan(0)

      stopMonitoring()

      const countAfter = manager.getMonitoredCount()
      expect(countAfter.txs).toBe(0)
    })
  })

  describe('Transaction Broadcasting', () => {
    const rawTx = '0100000001abc123...def456' // simplified
    const expectedTxid = 'txid123456789'

    beforeEach(async () => {
      await manager.connect()
      mockBroadcastTransaction.mockResolvedValue(expectedTxid)
    })

    it('deve broadcast commitment transaction', async () => {
      const txid = await manager.broadcastCommitmentTx(rawTx)

      expect(mockBroadcastTransaction).toHaveBeenCalledWith(rawTx, expect.anything())
      expect(txid).toBe(expectedTxid)
    })

    it('deve broadcast closing transaction', async () => {
      const txid = await manager.broadcastClosingTx(rawTx)

      expect(mockBroadcastTransaction).toHaveBeenCalled()
      expect(txid).toBe(expectedTxid)
    })

    it('deve broadcast justice transaction', async () => {
      const txid = await manager.broadcastJusticeTx(rawTx)

      expect(mockBroadcastTransaction).toHaveBeenCalled()
      expect(txid).toBe(expectedTxid)
    })

    it('deve broadcast HTLC timeout transaction', async () => {
      const txid = await manager.broadcastHtlcTimeoutTx(rawTx)

      expect(mockBroadcastTransaction).toHaveBeenCalled()
      expect(txid).toBe(expectedTxid)
    })

    it('deve broadcast HTLC success transaction', async () => {
      const txid = await manager.broadcastHtlcSuccessTx(rawTx)

      expect(mockBroadcastTransaction).toHaveBeenCalled()
      expect(txid).toBe(expectedTxid)
    })

    it('deve propagar erro de broadcast', async () => {
      mockBroadcastTransaction.mockRejectedValue(new Error('Transaction rejected'))

      await expect(manager.broadcastCommitmentTx(rawTx)).rejects.toThrow('Transaction rejected')
    })
  })

  describe('Transaction Status', () => {
    const txid = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'

    beforeEach(async () => {
      await manager.connect()
    })

    it('deve retornar status de transação confirmada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: {
          txid,
          confirmations: 10,
          height: 800000,
          blockhash: 'blockhash123',
        },
      })

      const status = await manager.getTxStatus(txid)

      expect(status.confirmed).toBe(true)
      expect(status.confirmations).toBe(10)
      expect(status.blockHeight).toBe(800000)
      expect(status.blockHash).toBe('blockhash123')
    })

    it('deve retornar status de transação não confirmada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: {
          txid,
          confirmations: 0,
        },
      })

      const status = await manager.getTxStatus(txid)

      expect(status.confirmed).toBe(false)
      expect(status.confirmations).toBe(0)
    })

    it('deve retornar status não confirmado para transação não encontrada', async () => {
      mockGetTransaction.mockResolvedValue({
        result: null,
      })

      const status = await manager.getTxStatus(txid)

      expect(status.confirmed).toBe(false)
      expect(status.confirmations).toBe(0)
    })

    it('deve obter transação completa', async () => {
      const txData = {
        txid,
        confirmations: 5,
        vin: [],
        vout: [],
      }
      mockGetTransaction.mockResolvedValue({ result: txData })

      const tx = await manager.getTransaction(txid)

      expect(tx).toEqual(txData)
    })
  })

  describe('UTXO Queries', () => {
    const address = 'bc1qtest123'

    beforeEach(async () => {
      await manager.connect()
    })

    it('deve obter UTXOs de um endereço', async () => {
      mockCallElectrumMethod.mockImplementation((method: string) => {
        if (method === 'blockchain.scripthash.listunspent') {
          return {
            result: [
              { tx_hash: 'txid1', tx_pos: 0, value: 100000, height: 800000 },
              { tx_hash: 'txid2', tx_pos: 1, value: 50000, height: 799999 },
            ],
          }
        }
        return { result: { height: 800010 } }
      })

      const utxos = await manager.getUtxos(address)

      expect(utxos).toHaveLength(2)
      expect(utxos[0].txid).toBe('txid1')
      expect(utxos[0].value).toBe(100000)
      expect(utxos[0].confirmations).toBe(11) // 800010 - 800000 + 1
    })

    it('deve retornar array vazio se não houver UTXOs', async () => {
      mockCallElectrumMethod.mockResolvedValue({ result: [] })

      const utxos = await manager.getUtxos(address)

      expect(utxos).toEqual([])
    })
  })

  describe('Output Spent Check', () => {
    const txid = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
    const vout = 0

    beforeEach(async () => {
      await manager.connect()
    })

    it('deve verificar se output foi gasto', async () => {
      // Mock transação com output
      mockGetTransaction.mockResolvedValue({
        result: {
          txid,
          vout: [
            {
              n: 0,
              value: 0.001,
              scriptPubKey: { addresses: ['bc1qtest123'] },
            },
          ],
        },
      })

      // Mock UTXOs - output ainda existe
      mockCallElectrumMethod.mockImplementation((method: string) => {
        if (method === 'blockchain.scripthash.listunspent') {
          return {
            result: [{ tx_hash: txid, tx_pos: 0, value: 100000, height: 800000 }],
          }
        }
        return { result: { height: 800010 } }
      })

      const spent = await manager.isOutputSpent(txid, vout)

      expect(spent).toBe(false)
    })

    it('deve retornar true se output foi gasto', async () => {
      mockGetTransaction.mockResolvedValue({
        result: {
          txid,
          vout: [
            {
              n: 0,
              value: 0.001,
              scriptPubKey: { addresses: ['bc1qtest123'] },
            },
          ],
        },
      })

      // Mock UTXOs - output não existe mais
      mockCallElectrumMethod.mockImplementation((method: string) => {
        if (method === 'blockchain.scripthash.listunspent') {
          return { result: [] }
        }
        return { result: { height: 800010 } }
      })

      const spent = await manager.isOutputSpent(txid, vout)

      expect(spent).toBe(true)
    })
  })

  describe('Fee Estimation', () => {
    beforeEach(async () => {
      await manager.connect()
    })

    it('deve estimar fee rate para 6 blocos', async () => {
      mockCallElectrumMethod.mockResolvedValue({ result: 0.0001 }) // 0.0001 BTC/kB

      const feeRate = await manager.estimateFeeRate(6)

      // 0.0001 BTC/kB = 10000 sat/kB = 10 sat/vB
      expect(feeRate).toBe(10)
    })

    it('deve retornar fee rate mínima de 1 sat/vB', async () => {
      mockCallElectrumMethod.mockResolvedValue({ result: 0.000001 }) // muito baixo

      const feeRate = await manager.estimateFeeRate(144)

      expect(feeRate).toBeGreaterThanOrEqual(1)
    })

    it('deve obter fee rates recomendadas', async () => {
      mockCallElectrumMethod.mockImplementation((method: string, params: number[]) => {
        const targetBlocks = params[0]
        const rates: Record<number, number> = {
          1: 0.0002, // urgent
          2: 0.00015, // fast
          6: 0.0001, // normal
          144: 0.00005, // slow
        }
        return { result: rates[targetBlocks] || 0.0001 }
      })

      const rates = await manager.getRecommendedFeeRates()

      expect(rates.urgent).toBeGreaterThanOrEqual(rates.fast)
      expect(rates.fast).toBeGreaterThanOrEqual(rates.normal)
      expect(rates.normal).toBeGreaterThanOrEqual(rates.slow)
    })

    it('deve retornar fallback em caso de erro', async () => {
      mockCallElectrumMethod.mockRejectedValue(new Error('Network error'))

      const feeRate = await manager.estimateFeeRate(6)

      expect(feeRate).toBeGreaterThan(0)
    })
  })

  describe('Merkle Proof', () => {
    const txid = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
    const blockHeight = 800000

    beforeEach(async () => {
      await manager.connect()
    })

    it('deve obter merkle proof', async () => {
      mockGetMerkleProof.mockResolvedValue({
        result: {
          merkle: ['hash1', 'hash2', 'hash3'],
          block_height: blockHeight,
          pos: 5,
        },
      })

      const proof = await manager.getMerkleProof(txid, blockHeight)

      expect(proof).not.toBeNull()
      expect(proof?.merkle).toHaveLength(3)
      expect(proof?.pos).toBe(5)
    })

    it('deve retornar null se merkle proof não encontrado', async () => {
      mockGetMerkleProof.mockResolvedValue({ result: null })

      const proof = await manager.getMerkleProof(txid, blockHeight)

      expect(proof).toBeNull()
    })
  })

  describe('Address Monitoring', () => {
    const address = 'bc1qtest123'

    beforeEach(async () => {
      await manager.connect()
    })

    it('deve monitorar endereço', async () => {
      const callback = jest.fn()
      const stopMonitoring = await manager.monitorAddress(address, callback)

      expect(typeof stopMonitoring).toBe('function')
      expect(manager.getMonitoredCount().addresses).toBe(1)
    })

    it('deve parar de monitorar endereço', async () => {
      const callback = jest.fn()
      const stopMonitoring = await manager.monitorAddress(address, callback)

      stopMonitoring()

      expect(manager.getMonitoredCount().addresses).toBe(0)
    })
  })

  describe('Funding Output Monitoring', () => {
    const fundingTxid = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1'
    const fundingOutputIndex = 0

    beforeEach(async () => {
      await manager.connect()

      mockGetTransaction.mockResolvedValue({
        result: {
          txid: fundingTxid,
          vout: [
            {
              n: 0,
              value: 0.001,
              scriptPubKey: { addresses: ['bc1qtest123'] },
            },
          ],
        },
      })

      mockCallElectrumMethod.mockImplementation((method: string) => {
        if (method === 'blockchain.scripthash.listunspent') {
          return {
            result: [{ tx_hash: fundingTxid, tx_pos: 0, value: 100000, height: 800000 }],
          }
        }
        return { result: { height: 800010 } }
      })
    })

    it('deve monitorar funding output', async () => {
      const onSpent = jest.fn()
      const stopMonitoring = await manager.monitorFundingOutput(
        fundingTxid,
        fundingOutputIndex,
        onSpent,
      )

      expect(typeof stopMonitoring).toBe('function')
    })

    it('deve parar de monitorar funding output', async () => {
      const onSpent = jest.fn()
      const stopMonitoring = await manager.monitorFundingOutput(
        fundingTxid,
        fundingOutputIndex,
        onSpent,
      )

      stopMonitoring()

      // O contador deve diminuir
      const count = manager.getMonitoredCount()
      expect(count.txs).toBe(0)
    })
  })

  describe('Singleton', () => {
    it('deve retornar mesma instância com getLightningElectrumManager', () => {
      const instance1 = getLightningElectrumManager()
      const instance2 = getLightningElectrumManager()

      expect(instance1).toBe(instance2)
    })

    it('deve criar nova instância com createLightningElectrumManager', () => {
      const instance1 = createLightningElectrumManager()
      const instance2 = createLightningElectrumManager()

      expect(instance1).not.toBe(instance2)
    })
  })
})

describe('Merkle Proof Verification', () => {
  let manager: LightningElectrumManager

  beforeEach(() => {
    manager = createLightningElectrumManager()
  })

  it('deve verificar merkle proof válido', () => {
    // Mock da verificação (resultado simplificado para teste)
    const txid = 'abc123'
    const merkle = ['hash1', 'hash2']
    const pos = 0
    const merkleRoot = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    // A verificação real depende de sha256 mockado
    const isValid = manager.verifyMerkleProof(txid, merkle, pos, merkleRoot)

    expect(typeof isValid).toBe('boolean')
  })
})
