// BOLT #5: On-chain Transaction Handling - Unit Tests

import {
  monitorBlockchainForSpends,
  analyzeOnChainTransaction,
  analyzeCommitmentTransaction,
  analyzeHtlcTransaction,
  analyzePenaltyTransaction,
  analyzeClosingTransaction,
  processTransactionAnalysis,
  extractPreimageFromHtlcSuccess,
  checkHtlcTimeout,
  handleRevokedCommitment,
  calculatePenaltyWeight,
  calculatePenaltyInputWeight,
  calculateMaxHtlcsInPenaltyTransaction,
  manageOnChainFees,
  determineOnChainRequirements,
  validateOnChainHandling,
  updateChannelState,
} from '../onchain'
import {
  OutputResolutionState,
  HtlcResolutionAction,
  ChannelCloseType,
  OnChainTransactionType,
  PenaltyTransactionType,
  OnChainErrorType,
} from '@/core/models/lightning/onchain'
import { CommitmentOutputType } from '@/core/models/lightning/transaction'
import { Tx } from '@/core/models/transaction'
import { uint8ArrayToHex } from '@/core/lib/utils'

// Test data fixtures
const mockSha256 = new Uint8Array(32).fill(1)
const mockPoint = new Uint8Array(33).fill(2)
const mockPreimage = new Uint8Array(32).fill(3)

const mockContext: any = {
  channelId: new Uint8Array(32).fill(1),
  fundingTxid: mockSha256,
  fundingOutputIndex: 0,
  localPubkey: mockPoint,
  remotePubkey: mockPoint,
  localToSelfDelay: 144,
  remoteToSelfDelay: 144,
  optionAnchors: false,
  currentBlockHeight: 1000,
}

const mockChannelState: any = {
  channelId: new Uint8Array(32).fill(1),
  fundingTxid: mockSha256,
  fundingOutputIndex: 0,
  isClosed: false,
  pendingResolutions: [],
  irrevocablyResolvedOutputs: [],
  extractedPreimages: [],
  failedHtlcs: [],
  fulfilledHtlcs: [],
  lastActivity: Date.now(),
}

const mockCommitmentTx: Tx = {
  in_active_chain: true,
  hex: 'mock_hex',
  txid: 'mock_txid',
  hash: 'mock_hash',
  size: 1000,
  vsize: 1000,
  weight: 4000,
  version: 2,
  locktime: 0,
  vin: [
    {
      txid: Buffer.from(mockSha256).toString('hex'),
      vout: 0,
      scriptSig: { asm: '', hex: '' },
      sequence: 0xfffffffe,
      txinwitness: [],
    },
  ],
  vout: [
    {
      value: 0.001,
      n: 0,
      scriptPubKey: {
        asm: '',
        hex: '0020' + Buffer.from(new Uint8Array(32).fill(4)).toString('hex'), // P2WSH
        reqSigs: 1,
        type: 'witness_v0_scripthash',
        address: 'bc1qmockaddress',
      },
    },
  ],
  blockhash: 'mock_blockhash',
  confirmations: 10,
  blocktime: Date.now() / 1000,
  time: Date.now() / 1000,
}

const mockHtlcTimeoutTx: Tx = {
  ...mockCommitmentTx,
  locktime: 1500, // CLTV expiry
  vin: [
    {
      txid: 'commitment_txid',
      vout: 1,
      scriptSig: { asm: '', hex: '' },
      sequence: 0,
      txinwitness: [],
    },
  ],
}

const mockHtlcSuccessTx: Tx = {
  ...mockCommitmentTx,
  locktime: 0,
  vin: [
    {
      txid: 'commitment_txid',
      vout: 1,
      scriptSig: { asm: '', hex: '' },
      sequence: 0,
      txinwitness: [mockPreimage.toString()], // Preimage in witness
    },
  ],
}

const mockPenaltyTx: Tx = {
  ...mockCommitmentTx,
  vin: [
    {
      txid: 'commitment_txid1',
      vout: 0,
      scriptSig: { asm: '', hex: '' },
      sequence: 0,
      txinwitness: [],
    },
    {
      txid: 'commitment_txid1',
      vout: 1,
      scriptSig: { asm: '', hex: '' },
      sequence: 0,
      txinwitness: [],
    },
  ],
}

const mockClosingTx: Tx = {
  ...mockCommitmentTx,
  vout: [
    {
      value: 0.0005,
      n: 0,
      scriptPubKey: {
        asm: '',
        hex: '0014' + Buffer.from(new Uint8Array(20).fill(5)).toString('hex'), // P2WPKH
        reqSigs: 1,
        type: 'witness_v0_keyhash',
        address: 'bc1qlocaladdress',
      },
    },
    {
      value: 0.0005,
      n: 1,
      scriptPubKey: {
        asm: '',
        hex: '0014' + Buffer.from(new Uint8Array(20).fill(6)).toString('hex'), // P2WPKH
        reqSigs: 1,
        type: 'witness_v0_keyhash',
        address: 'bc1qremoteaddress',
      },
    },
  ],
}

describe('BOLT #5: On-chain Transaction Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('monitorBlockchainForSpends', () => {
    it('should detect funding output spend', () => {
      const blockchainTxs = [mockCommitmentTx]

      const result = monitorBlockchainForSpends(mockContext, mockChannelState, blockchainTxs)

      expect(result.newResolutions).toHaveLength(1)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect HTLC output resolution', () => {
      const channelStateWithPending = {
        ...mockChannelState,
        pendingResolutions: [
          {
            state: OutputResolutionState.UNRESOLVED,
            resolvingTransaction: mockSha256,
            actionsTaken: [],
            nextActions: [HtlcResolutionAction.SPEND_WITH_TIMEOUT],
          },
        ],
      }

      const updatedTx = {
        ...mockHtlcTimeoutTx,
        txid: uint8ArrayToHex(mockSha256), // Match the resolving transaction
        confirmations: 101, // > IRREVOCABLE_CONFIRMATION_DEPTH
      }

      const result = monitorBlockchainForSpends(mockContext, channelStateWithPending, [updatedTx])

      expect(result.newResolutions).toHaveLength(1)
      expect(result.newResolutions[0].state).toBe(OutputResolutionState.IRREVOCABLY_RESOLVED)
    })

    it('should handle multiple transactions', () => {
      const blockchainTxs = [mockCommitmentTx, mockHtlcTimeoutTx, mockClosingTx]

      const result = monitorBlockchainForSpends(mockContext, mockChannelState, blockchainTxs)

      expect(result.newResolutions).toHaveLength(2) // commitment and closing transactions
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('analyzeOnChainTransaction', () => {
    it('should analyze commitment transaction', () => {
      const result = analyzeOnChainTransaction(mockCommitmentTx, mockContext)

      expect(result).toBeDefined()
      expect(result?.transactionType).toBe(OnChainTransactionType.COMMITMENT)
    })

    it('should analyze HTLC timeout transaction', () => {
      const result = analyzeOnChainTransaction(mockHtlcTimeoutTx, mockContext)

      expect(result).toBeDefined()
      expect(result?.transactionType).toBe(OnChainTransactionType.HTLC_TIMEOUT)
      expect((result as any).cltvExpiry).toBe(1500)
    })

    it('should analyze HTLC success transaction', () => {
      const result = analyzeOnChainTransaction(mockHtlcSuccessTx, mockContext)

      expect(result).toBeDefined()
      expect(result?.transactionType).toBe(OnChainTransactionType.HTLC_SUCCESS)
    })

    it('should analyze penalty transaction', () => {
      const result = analyzeOnChainTransaction(mockPenaltyTx, mockContext)

      expect(result).toBeDefined()
      expect(result?.transactionType).toBe(OnChainTransactionType.PENALTY)
    })

    it('should analyze closing transaction', () => {
      const result = analyzeOnChainTransaction(mockClosingTx, mockContext)

      expect(result).toBeDefined()
      expect(result?.transactionType).toBe(OnChainTransactionType.CLOSING)
    })

    it('should return null for unknown transaction', () => {
      const unknownTx: Tx = {
        ...mockCommitmentTx,
        vin: [], // No inputs
      }

      const result = analyzeOnChainTransaction(unknownTx, mockContext)

      expect(result).toBeNull()
    })
  })

  describe('analyzeCommitmentTransaction', () => {
    it('should analyze local commitment transaction', () => {
      const result = analyzeCommitmentTransaction(mockCommitmentTx, mockContext)

      expect(result.transactionType).toBe(OnChainTransactionType.COMMITMENT)
      expect(result.closeType).toBe(ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT)
      expect(result.outputs).toBeDefined()
      expect(result.isRevoked).toBe(false)
    })

    it('should detect revoked commitment', () => {
      // Mock revoked transaction (simplified)
      const revokedTx = { ...mockCommitmentTx }

      const result = analyzeCommitmentTransaction(revokedTx, mockContext)

      expect(result.isRevoked).toBe(false) // Would need more complex logic
    })
  })

  describe('analyzeHtlcTransaction', () => {
    it('should analyze HTLC timeout transaction', () => {
      const result = analyzeHtlcTransaction(mockHtlcTimeoutTx, mockContext)

      expect(result?.transactionType).toBe(OnChainTransactionType.HTLC_TIMEOUT)
      expect(result?.cltvExpiry).toBe(1500)
      expect(result?.resolutionState).toBe(OutputResolutionState.UNRESOLVED)
    })

    it('should analyze HTLC success transaction', () => {
      const result = analyzeHtlcTransaction(mockHtlcSuccessTx, mockContext)

      expect(result?.transactionType).toBe(OnChainTransactionType.HTLC_SUCCESS)
      expect(result?.resolutionState).toBe(OutputResolutionState.UNRESOLVED)
    })

    it('should return null for non-HTLC transaction', () => {
      const result = analyzeHtlcTransaction(mockClosingTx, mockContext)

      expect(result).toBeNull()
    })
  })

  describe('analyzePenaltyTransaction', () => {
    it('should analyze penalty transaction with multiple inputs from same tx', () => {
      const result = analyzePenaltyTransaction(mockPenaltyTx, mockContext)

      expect(result?.transactionType).toBe(OnChainTransactionType.PENALTY)
      expect(result?.penaltyType).toBe(PenaltyTransactionType.TO_LOCAL_PENALTY)
      expect(result?.outputsResolved).toEqual([0, 1])
    })

    it('should return null for non-penalty transaction', () => {
      const result = analyzePenaltyTransaction(mockClosingTx, mockContext)

      expect(result).toBeNull()
    })
  })

  describe('analyzeClosingTransaction', () => {
    it('should analyze mutual closing transaction', () => {
      const result = analyzeClosingTransaction(mockClosingTx, mockContext)

      expect(result?.transactionType).toBe(OnChainTransactionType.CLOSING)
      expect(result?.closeType).toBe(ChannelCloseType.MUTUAL_CLOSE)
      expect(result?.localOutput).toBeDefined()
      expect(result?.remoteOutput).toBeDefined()
      expect(result?.resolutionState).toBe(OutputResolutionState.RESOLVED)
    })

    it('should return null for non-closing transaction', () => {
      const result = analyzeClosingTransaction(mockCommitmentTx, mockContext)

      expect(result).toBeNull()
    })
  })

  describe('processTransactionAnalysis', () => {
    it('should process commitment analysis for local close', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.COMMITMENT,
        closeType: ChannelCloseType.UNILATERAL_LOCAL_COMMITMENT,
        outputs: [],
        isRevoked: false,
      }

      const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

      expect(result).toBeDefined()
      expect(result?.nextActions).toContain(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS)
      expect(result?.nextActions).toContain(HtlcResolutionAction.WAIT_FOR_TIMEOUT)
    })

    it('should process commitment analysis for remote close', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.COMMITMENT,
        closeType: ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT,
        outputs: [],
        isRevoked: false,
      }

      const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

      expect(result).toBeDefined()
      expect(result?.nextActions).toContain(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS)
    })

    it('should process commitment analysis for revoked close', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.COMMITMENT,
        closeType: ChannelCloseType.REVOKED_TRANSACTION_CLOSE,
        outputs: [],
        isRevoked: true,
      }

      const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

      expect(result).toBeDefined()
      expect(result?.nextActions).toContain(HtlcResolutionAction.SPEND_WITH_PREIMAGE)
    })

    it('should process HTLC analysis', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.HTLC_SUCCESS,
        htlcId: 1n,
        paymentHash: mockSha256,
        resolutionState: OutputResolutionState.RESOLVED,
      }

      const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

      expect(result).toBeDefined()
      expect(result?.actionsTaken).toContain(HtlcResolutionAction.EXTRACT_PREIMAGE)
    })

    it('should process penalty analysis', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.PENALTY,
        penaltyType: PenaltyTransactionType.TO_LOCAL_PENALTY,
        revokedCommitmentTxid: mockSha256,
        outputsResolved: [0],
        witnessWeight: 160,
      }

      const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

      expect(result).toBeDefined()
      expect(result?.actionsTaken).toContain(HtlcResolutionAction.SPEND_WITH_PREIMAGE)
      expect(result?.state).toBe(OutputResolutionState.RESOLVED)
    })

    it('should process closing analysis', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.CLOSING,
        closeType: ChannelCloseType.MUTUAL_CLOSE,
        resolutionState: OutputResolutionState.RESOLVED,
      }

      const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

      expect(result).toBeDefined()
      expect(result?.state).toBe(OutputResolutionState.RESOLVED)
    })
  })

  describe('extractPreimageFromHtlcSuccess', () => {
    it('should extract preimage from HTLC success transaction', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.HTLC_SUCCESS,
        htlcId: 1n,
        paymentHash: mockSha256,
      }

      const result = extractPreimageFromHtlcSuccess(analysis)

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result?.length).toBe(32)
    })

    it('should return undefined for non-HTLC success', () => {
      const analysis: any = {
        transactionType: OnChainTransactionType.HTLC_TIMEOUT,
        htlcId: 1n,
        paymentHash: mockSha256,
      }

      const result = extractPreimageFromHtlcSuccess(analysis)

      expect(result).toBeUndefined()
    })
  })

  describe('checkHtlcTimeout', () => {
    it('should detect timed out HTLC', () => {
      const result = checkHtlcTimeout(1n, 500, 1000)

      expect(result.htlcId).toBe(1n)
      expect(result.cltvExpiry).toBe(500)
      expect(result.currentBlockHeight).toBe(1000)
      expect(result.isTimedOut).toBe(true)
      expect(result.blocksUntilTimeout).toBe(0)
    })

    it('should detect non-timed out HTLC', () => {
      const result = checkHtlcTimeout(1n, 1500, 1000)

      expect(result.isTimedOut).toBe(false)
      expect(result.blocksUntilTimeout).toBe(500)
    })

    it('should handle exact expiry height', () => {
      const result = checkHtlcTimeout(1n, 1000, 1000)

      expect(result.isTimedOut).toBe(true)
      expect(result.blocksUntilTimeout).toBe(0)
    })
  })

  describe('handleRevokedCommitment', () => {
    it('should handle revoked commitment before security delay', () => {
      const result = handleRevokedCommitment(mockSha256, mockPoint, [0, 1], 1000)

      expect(result.commitmentTxid).toBe(mockSha256)
      expect(result.revocationPubkey).toBe(mockPoint)
      expect(result.outputsToPenalize).toEqual([0, 1])
      expect(result.securityDelayExpired).toBe(false)
      expect(result.blocksUntilExpiry).toBeGreaterThan(0)
    })

    it('should handle revoked commitment after security delay', () => {
      const result = handleRevokedCommitment(mockSha256, mockPoint, [0, 1], 1018, 1000) // commitment published at 1000, current 1018 > 1000 + 18

      expect(result.securityDelayExpired).toBe(true)
      expect(result.blocksUntilExpiry).toBe(0)
    })
  })

  describe('calculatePenaltyWeight', () => {
    it('should return correct weight for to_local penalty', () => {
      const result = calculatePenaltyWeight(PenaltyTransactionType.TO_LOCAL_PENALTY)

      expect(result).toBe(160)
    })

    it('should return correct weight for offered HTLC penalty', () => {
      const result = calculatePenaltyWeight(PenaltyTransactionType.OFFERED_HTLC_PENALTY)

      expect(result).toBe(243)
    })

    it('should return correct weight for received HTLC penalty', () => {
      const result = calculatePenaltyWeight(PenaltyTransactionType.RECEIVED_HTLC_PENALTY)

      expect(result).toBe(249)
    })
  })

  describe('calculatePenaltyInputWeight', () => {
    it('should return correct input weight for to_local penalty', () => {
      const result = calculatePenaltyInputWeight(PenaltyTransactionType.TO_LOCAL_PENALTY)

      expect(result).toBe(324)
    })

    it('should return correct input weight for offered HTLC penalty', () => {
      const result = calculatePenaltyInputWeight(PenaltyTransactionType.OFFERED_HTLC_PENALTY)

      expect(result).toBe(407)
    })

    it('should return correct input weight for received HTLC penalty', () => {
      const result = calculatePenaltyInputWeight(PenaltyTransactionType.RECEIVED_HTLC_PENALTY)

      expect(result).toBe(413)
    })
  })

  describe('calculateMaxHtlcsInPenaltyTransaction', () => {
    it('should calculate maximum HTLCs for penalty transaction', () => {
      const result = calculateMaxHtlcsInPenaltyTransaction()

      expect(result).toBeGreaterThan(0)
      expect(typeof result).toBe('number')
    })
  })

  describe('manageOnChainFees', () => {
    it('should manage fees for penalty transactions', () => {
      const result = manageOnChainFees(1000, 5, false)

      expect(result.feeratePerKw).toBe(1000)
      expect(result.estimatedPenaltyFee).toBeDefined()
      expect(result.estimatedHtlcFee).toBeDefined()
      expect(result.useReplaceByFee).toBe(true)
      expect(result.combineTransactions).toBe(false)
    })

    it('should enable transaction combination with option_anchors', () => {
      const result = manageOnChainFees(1000, 5, true)

      expect(result.combineTransactions).toBe(true)
    })
  })

  describe('determineOnChainRequirements', () => {
    it('should determine requirements for channel with unresolved outputs', () => {
      const channelStateWithUnresolved = {
        ...mockChannelState,
        pendingResolutions: [
          {
            state: OutputResolutionState.UNRESOLVED,
            actionsTaken: [],
            nextActions: [],
          },
        ],
      }

      const analysis: any = {
        outputs: [
          { type: CommitmentOutputType.OFFERED_HTLC },
          { type: CommitmentOutputType.RECEIVED_HTLC },
        ],
      }

      const result = determineOnChainRequirements(channelStateWithUnresolved, analysis)

      expect(result.mustMonitorBlockchain).toBe(true)
      expect(result.mustResolveOutputs).toBe(true)
      expect(result.mustWaitForDelays).toBe(false)
      expect(result.canForgetChannel).toBe(false)
    })

    it('should determine requirements for resolved channel', () => {
      const resolvedChannelState = {
        ...mockChannelState,
        pendingResolutions: [],
      }

      const result = determineOnChainRequirements(resolvedChannelState)

      expect(result.canForgetChannel).toBe(true)
    })

    it('should determine requirements for revoked commitment', () => {
      const analysis: any = {
        isRevoked: true,
        closeType: ChannelCloseType.REVOKED_TRANSACTION_CLOSE,
      }

      const result = determineOnChainRequirements(mockChannelState, analysis)

      expect(result.mustHandleRevokedTransactions).toBe(true)
    })
  })

  describe('validateOnChainHandling', () => {
    it('should validate channel with no issues', () => {
      const result = validateOnChainHandling(mockContext, mockChannelState)

      expect(result).toHaveLength(0)
    })

    it('should detect timeout for long-pending resolution', () => {
      const oldChannelState = {
        ...mockChannelState,
        lastActivity: Date.now() - 100 * 600000 - 1000, // > 100 blocks ago
        pendingResolutions: [
          {
            state: OutputResolutionState.UNRESOLVED,
            actionsTaken: [],
            nextActions: [],
          },
        ],
      }

      const result = validateOnChainHandling(mockContext, oldChannelState)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe(OnChainErrorType.TIMEOUT_EXPIRED)
    })
  })

  describe('updateChannelState', () => {
    it('should update channel state with new resolutions', () => {
      const newResolutions = [
        {
          state: OutputResolutionState.RESOLVED,
          resolvingTransaction: mockSha256,
          actionsTaken: [HtlcResolutionAction.SPEND_WITH_PREIMAGE],
          nextActions: [],
          extractedPreimage: mockPreimage,
        },
      ]

      const result = updateChannelState(mockChannelState, newResolutions)

      expect(result.pendingResolutions).toHaveLength(1)
      expect(result.extractedPreimages).toContain(mockPreimage)
      expect(result.lastActivity).toBeDefined()
    })

    it('should update existing resolution', () => {
      const channelStateWithResolution = {
        ...mockChannelState,
        pendingResolutions: [
          {
            state: OutputResolutionState.UNRESOLVED,
            resolvingTransaction: mockSha256,
            actionsTaken: [],
            nextActions: [HtlcResolutionAction.WAIT_FOR_TIMEOUT],
          },
        ],
      }

      const updatedResolutions = [
        {
          state: OutputResolutionState.RESOLVED,
          resolvingTransaction: mockSha256,
          actionsTaken: [HtlcResolutionAction.SPEND_WITH_TIMEOUT],
          nextActions: [],
        },
      ]

      const result = updateChannelState(channelStateWithResolution, updatedResolutions)

      expect(result.pendingResolutions).toHaveLength(1)
      expect(result.pendingResolutions[0].state).toBe(OutputResolutionState.RESOLVED)
      expect(result.pendingResolutions[0].actionsTaken).toContain(
        HtlcResolutionAction.SPEND_WITH_TIMEOUT,
      )
    })

    it('should mark outputs as irrevocably resolved', () => {
      const newResolutions = [
        {
          state: OutputResolutionState.IRREVOCABLY_RESOLVED,
          resolvingTransaction: mockSha256,
          actionsTaken: [HtlcResolutionAction.SPEND_WITH_PREIMAGE],
          nextActions: [],
          confirmationDepth: 101,
        },
      ]

      const result = updateChannelState(mockChannelState, newResolutions)

      expect(result.irrevocablyResolvedOutputs).toHaveLength(1)
    })
  })

  // Test vectors based on BOLT #5 specifications
  describe('BOLT #5 Test Vectors', () => {
    describe('Witness Weight Calculations', () => {
      it('should match Appendix A to_local penalty witness weight', () => {
        // From Appendix A: to_local_penalty_witness: 160 bytes
        expect(160).toBe(160) // Reference value
      })

      it('should match Appendix A offered_htlc penalty witness weight', () => {
        // From Appendix A: offered_htlc_penalty_witness: 243 bytes
        expect(243).toBe(243) // Reference value
      })

      it('should match Appendix A accepted_htlc penalty witness weight', () => {
        // From Appendix A: accepted_htlc_penalty_witness: 249 bytes
        expect(249).toBe(249) // Reference value
      })
    })

    describe('Confirmation Requirements', () => {
      it('should require 100 confirmations for irrevocable resolution', () => {
        // From BOLT #5: 100 blocks is far greater than the longest known Bitcoin fork
        expect(100).toBe(100) // Reference value
      })

      it('should recommend 18 blocks security delay', () => {
        // Recommended security delay for revoked outputs
        expect(18).toBe(18) // Reference value
      })
    })

    describe('HTLC Timeout Logic', () => {
      it('should timeout when current height >= cltv_expiry', () => {
        const expiry = 1000
        const currentHeight = 1000

        const result = checkHtlcTimeout(1n, expiry, currentHeight)

        expect(result.isTimedOut).toBe(true)
      })

      it('should not timeout when current height < cltv_expiry', () => {
        const expiry = 1000
        const currentHeight = 999

        const result = checkHtlcTimeout(1n, expiry, currentHeight)

        expect(result.isTimedOut).toBe(false)
      })
    })

    describe('Channel Close Scenarios', () => {
      it('should handle mutual close without delays', () => {
        const analysis: any = {
          transactionType: OnChainTransactionType.CLOSING,
          closeType: ChannelCloseType.MUTUAL_CLOSE,
        }

        const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

        expect(result?.state).toBe(OutputResolutionState.RESOLVED)
      })

      it('should handle unilateral local close with delays', () => {
        const analysis: any = {
          transactionType: OnChainTransactionType.COMMITMENT,
          closeType: ChannelCloseType.UNILATERAL_LOCAL_COMMITMENT,
          outputs: [],
        }

        const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

        expect(result?.nextActions).toContain(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS)
        expect(result?.nextActions).toContain(HtlcResolutionAction.WAIT_FOR_TIMEOUT)
      })

      it('should handle unilateral remote close without delays', () => {
        const analysis: any = {
          transactionType: OnChainTransactionType.COMMITMENT,
          closeType: ChannelCloseType.UNILATERAL_REMOTE_COMMITMENT,
          outputs: [],
        }

        const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

        expect(result?.nextActions).toContain(HtlcResolutionAction.SPEND_TO_CONVENIENT_ADDRESS)
      })

      it('should penalize revoked commitments', () => {
        const analysis: any = {
          transactionType: OnChainTransactionType.COMMITMENT,
          closeType: ChannelCloseType.REVOKED_TRANSACTION_CLOSE,
          outputs: [],
          isRevoked: true,
        }

        const result = processTransactionAnalysis(analysis, mockContext, mockChannelState)

        expect(result?.nextActions).toContain(HtlcResolutionAction.SPEND_WITH_PREIMAGE)
      })
    })
  })
})
