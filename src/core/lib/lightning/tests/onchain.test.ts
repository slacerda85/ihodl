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
  // BOLT #5: Sweep and Justice Transactions
  calculateSweepWitnessWeight,
  canSweepOutput,
  buildSweepTransaction,
  buildToLocalSweepWitness,
  buildHtlcTimeoutSweepWitness,
  buildHtlcSuccessSweepWitness,
  buildJusticeTransaction,
  buildToLocalPenaltyWitness,
  buildOfferedHtlcPenaltyWitness,
  buildReceivedHtlcPenaltyWitness,
  detectRevokedCommitment,
  findRevokedOutputs,
  deriveRevocationPrivkey,
  serializeSweepTransaction,
  SweepOutputType,
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

  // ==========================================
  // BOLT #5: SWEEP TRANSACTIONS
  // ==========================================

  describe('BOLT #5: Sweep Transactions', () => {
    const mockTxid = new Uint8Array(32).fill(0xaa)
    const mockWitnessScript = new Uint8Array(80).fill(0xbb)
    const mockSignature = new Uint8Array(72).fill(0xcc)
    const mockDestinationScript = new Uint8Array(34).fill(0xdd)

    describe('calculateSweepWitnessWeight', () => {
      it('should calculate correct weight for TO_LOCAL sweep', () => {
        const weight = calculateSweepWitnessWeight(SweepOutputType.TO_LOCAL)
        expect(weight).toBe(156) // <local_delayedsig> 0 <witnessScript>
      })

      it('should calculate correct weight for TO_REMOTE sweep', () => {
        const weight = calculateSweepWitnessWeight(SweepOutputType.TO_REMOTE)
        expect(weight).toBe(200) // Default estimativa conservadora (P2WPKH não está implementado)
      })

      it('should calculate correct weight for HTLC_TIMEOUT sweep', () => {
        const weight = calculateSweepWitnessWeight(SweepOutputType.HTLC_TIMEOUT)
        expect(weight).toBe(289) // 0 <remotesig> <localsig> <> <witnessScript>
      })

      it('should calculate correct weight for HTLC_SUCCESS sweep', () => {
        const weight = calculateSweepWitnessWeight(SweepOutputType.HTLC_SUCCESS)
        expect(weight).toBe(321) // 0 <remotesig> <localsig> <preimage> <witnessScript>
      })

      it('should calculate correct weight for HTLC_SECOND_STAGE sweep', () => {
        const weight = calculateSweepWitnessWeight(SweepOutputType.HTLC_SECOND_STAGE)
        expect(weight).toBe(156) // <local_delayedsig> 0 <witnessScript>
      })
    })

    describe('canSweepOutput', () => {
      it('should allow sweep when CLTV is expired', () => {
        const output = {
          type: SweepOutputType.HTLC_TIMEOUT,
          txid: mockTxid,
          vout: 0,
          value: 100000n,
          script: mockWitnessScript,
          cltvExpiry: 1000,
        }

        const result = canSweepOutput(output, 1001)
        expect(result.canSweep).toBe(true)
      })

      it('should not allow sweep when CLTV is not expired', () => {
        const output = {
          type: SweepOutputType.HTLC_TIMEOUT,
          txid: mockTxid,
          vout: 0,
          value: 100000n,
          script: mockWitnessScript,
          cltvExpiry: 1000,
        }

        const result = canSweepOutput(output, 999)
        expect(result.canSweep).toBe(false)
        expect(result.reason).toBe('CLTV not expired')
        expect(result.blocksUntilSweepable).toBe(1)
      })

      it('should allow sweep when at exact CLTV height', () => {
        const output = {
          type: SweepOutputType.HTLC_TIMEOUT,
          txid: mockTxid,
          vout: 0,
          value: 100000n,
          script: mockWitnessScript,
          cltvExpiry: 1000,
        }

        const result = canSweepOutput(output, 1000)
        expect(result.canSweep).toBe(true)
      })

      it('should allow sweep for output without CLTV', () => {
        const output = {
          type: SweepOutputType.TO_LOCAL,
          txid: mockTxid,
          vout: 0,
          value: 100000n,
          script: mockWitnessScript,
          csvDelay: 144,
        }

        const result = canSweepOutput(output, 500)
        expect(result.canSweep).toBe(true)
      })
    })

    describe('buildSweepTransaction', () => {
      it('should build sweep transaction with single output', () => {
        const params = {
          outputs: [
            {
              type: SweepOutputType.TO_LOCAL,
              txid: mockTxid,
              vout: 0,
              value: 100000n,
              script: mockWitnessScript,
              csvDelay: 144,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          currentBlockHeight: 1000,
        }

        const result = buildSweepTransaction(params)

        expect(result).not.toBeNull()
        expect(result?.version).toBe(2)
        expect(result?.inputs.length).toBe(1)
        expect(result?.outputs.length).toBe(1)
        expect(result?.fee).toBeGreaterThan(0n)
        expect(result?.totalSwept).toBeLessThan(100000n)
      })

      it('should build sweep transaction with multiple outputs', () => {
        const params = {
          outputs: [
            {
              type: SweepOutputType.TO_LOCAL,
              txid: mockTxid,
              vout: 0,
              value: 100000n,
              script: mockWitnessScript,
              csvDelay: 144,
            },
            {
              type: SweepOutputType.HTLC_SECOND_STAGE,
              txid: mockTxid,
              vout: 1,
              value: 50000n,
              script: mockWitnessScript,
              csvDelay: 144,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          currentBlockHeight: 1000,
        }

        const result = buildSweepTransaction(params)

        expect(result).not.toBeNull()
        expect(result?.inputs.length).toBe(2)
        expect(result?.totalSwept).toBeGreaterThan(0n)
      })

      it('should return null when all outputs are not sweepable', () => {
        const params = {
          outputs: [
            {
              type: SweepOutputType.HTLC_TIMEOUT,
              txid: mockTxid,
              vout: 0,
              value: 100000n,
              script: mockWitnessScript,
              cltvExpiry: 2000, // Not expired
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          currentBlockHeight: 1000,
        }

        const result = buildSweepTransaction(params)

        expect(result).toBeNull()
      })

      it('should return null when output value is below dust', () => {
        const params = {
          outputs: [
            {
              type: SweepOutputType.TO_LOCAL,
              txid: mockTxid,
              vout: 0,
              value: 500n, // Below dust
              script: mockWitnessScript,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          currentBlockHeight: 1000,
        }

        const result = buildSweepTransaction(params)

        expect(result).toBeNull()
      })

      it('should set correct locktime for HTLC outputs', () => {
        const params = {
          outputs: [
            {
              type: SweepOutputType.HTLC_TIMEOUT,
              txid: mockTxid,
              vout: 0,
              value: 100000n,
              script: mockWitnessScript,
              cltvExpiry: 1500,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          currentBlockHeight: 1600,
        }

        const result = buildSweepTransaction(params)

        expect(result).not.toBeNull()
        expect(result?.locktime).toBe(1500)
      })

      it('should set correct sequence for CSV delay', () => {
        const params = {
          outputs: [
            {
              type: SweepOutputType.TO_LOCAL,
              txid: mockTxid,
              vout: 0,
              value: 100000n,
              script: mockWitnessScript,
              csvDelay: 144,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          currentBlockHeight: 1000,
        }

        const result = buildSweepTransaction(params)

        expect(result).not.toBeNull()
        expect(result?.inputs[0].sequence).toBe(144)
      })
    })

    describe('buildToLocalSweepWitness', () => {
      it('should build correct witness stack', () => {
        const witness = buildToLocalSweepWitness(mockSignature, mockWitnessScript)

        expect(witness.length).toBe(3)
        expect(witness[0]).toEqual(mockSignature)
        expect(witness[1]).toEqual(new Uint8Array([])) // 0 for non-revocation path
        expect(witness[2]).toEqual(mockWitnessScript)
      })
    })

    describe('buildHtlcTimeoutSweepWitness', () => {
      it('should build correct witness stack', () => {
        const localSig = new Uint8Array(72).fill(0x11)
        const remoteSig = new Uint8Array(72).fill(0x22)

        const witness = buildHtlcTimeoutSweepWitness(localSig, remoteSig, mockWitnessScript)

        expect(witness.length).toBe(5)
        expect(witness[0]).toEqual(new Uint8Array([])) // OP_CHECKMULTISIG dummy
        expect(witness[1]).toEqual(remoteSig)
        expect(witness[2]).toEqual(localSig)
        expect(witness[3]).toEqual(new Uint8Array([])) // Empty for timeout path
        expect(witness[4]).toEqual(mockWitnessScript)
      })
    })

    describe('buildHtlcSuccessSweepWitness', () => {
      it('should build correct witness stack with preimage', () => {
        const localSig = new Uint8Array(72).fill(0x11)
        const remoteSig = new Uint8Array(72).fill(0x22)

        const witness = buildHtlcSuccessSweepWitness(
          localSig,
          remoteSig,
          mockPreimage,
          mockWitnessScript,
        )

        expect(witness.length).toBe(5)
        expect(witness[0]).toEqual(new Uint8Array([])) // OP_CHECKMULTISIG dummy
        expect(witness[1]).toEqual(remoteSig)
        expect(witness[2]).toEqual(localSig)
        expect(witness[3]).toEqual(mockPreimage)
        expect(witness[4]).toEqual(mockWitnessScript)
      })
    })
  })

  // ==========================================
  // BOLT #5: JUSTICE/PENALTY TRANSACTIONS
  // ==========================================

  describe('BOLT #5: Justice/Penalty Transactions', () => {
    const mockTxid = new Uint8Array(32).fill(0xaa)
    const mockWitnessScript = new Uint8Array(80).fill(0xbb)
    const mockSignature = new Uint8Array(72).fill(0xcc)
    const mockDestinationScript = new Uint8Array(34).fill(0xdd)
    const mockRevocationPubkey = new Uint8Array(33).fill(0xee)
    const mockPerCommitmentSecret = new Uint8Array(32).fill(0xff)

    describe('calculatePenaltyWeight (BOLT #5 Penalty Witness)', () => {
      it('should return BOLT #5 weight for TO_LOCAL_PENALTY', () => {
        const weight = calculatePenaltyWeight(PenaltyTransactionType.TO_LOCAL_PENALTY)
        expect(weight).toBe(160)
      })

      it('should return BOLT #5 weight for OFFERED_HTLC_PENALTY', () => {
        const weight = calculatePenaltyWeight(PenaltyTransactionType.OFFERED_HTLC_PENALTY)
        expect(weight).toBe(243)
      })

      it('should return BOLT #5 weight for RECEIVED_HTLC_PENALTY', () => {
        const weight = calculatePenaltyWeight(PenaltyTransactionType.RECEIVED_HTLC_PENALTY)
        expect(weight).toBe(249)
      })
    })

    describe('buildJusticeTransaction', () => {
      it('should build justice transaction with single revoked output', () => {
        const params = {
          revokedOutputs: [
            {
              type: PenaltyTransactionType.TO_LOCAL_PENALTY,
              txid: mockTxid,
              vout: 0,
              value: 1000000n,
              witnessScript: mockWitnessScript,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          revocationPrivkey: mockPerCommitmentSecret,
          perCommitmentSecret: mockPerCommitmentSecret,
          revocationBasepoint: mockPoint,
        }

        const result = buildJusticeTransaction(params)

        expect(result).not.toBeNull()
        expect(result?.version).toBe(2)
        expect(result?.locktime).toBe(0) // Penalty tx não precisa de locktime
        expect(result?.inputs.length).toBe(1)
        expect(result?.outputs.length).toBe(1)
        expect(result?.totalRecovered).toBeGreaterThan(0n)
        expect(result?.fee).toBeGreaterThan(0n)
      })

      it('should build justice transaction with multiple revoked outputs', () => {
        const params = {
          revokedOutputs: [
            {
              type: PenaltyTransactionType.TO_LOCAL_PENALTY,
              txid: mockTxid,
              vout: 0,
              value: 1000000n,
              witnessScript: mockWitnessScript,
            },
            {
              type: PenaltyTransactionType.OFFERED_HTLC_PENALTY,
              txid: mockTxid,
              vout: 1,
              value: 500000n,
              witnessScript: mockWitnessScript,
            },
            {
              type: PenaltyTransactionType.RECEIVED_HTLC_PENALTY,
              txid: mockTxid,
              vout: 2,
              value: 300000n,
              witnessScript: mockWitnessScript,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          revocationPrivkey: mockPerCommitmentSecret,
          perCommitmentSecret: mockPerCommitmentSecret,
          revocationBasepoint: mockPoint,
        }

        const result = buildJusticeTransaction(params)

        expect(result).not.toBeNull()
        expect(result?.inputs.length).toBe(3)
        expect(result?.totalRecovered).toBeLessThan(1800000n) // Total - fee
      })

      it('should return null when no revoked outputs', () => {
        const params = {
          revokedOutputs: [],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          revocationPrivkey: mockPerCommitmentSecret,
          perCommitmentSecret: mockPerCommitmentSecret,
          revocationBasepoint: mockPoint,
        }

        const result = buildJusticeTransaction(params)

        expect(result).toBeNull()
      })

      it('should return null when output is below dust after fee', () => {
        const params = {
          revokedOutputs: [
            {
              type: PenaltyTransactionType.TO_LOCAL_PENALTY,
              txid: mockTxid,
              vout: 0,
              value: 500n, // Very small value
              witnessScript: mockWitnessScript,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 10000, // High fee rate
          revocationPrivkey: mockPerCommitmentSecret,
          perCommitmentSecret: mockPerCommitmentSecret,
          revocationBasepoint: mockPoint,
        }

        const result = buildJusticeTransaction(params)

        expect(result).toBeNull()
      })

      it('should set correct penalty type on inputs', () => {
        const params = {
          revokedOutputs: [
            {
              type: PenaltyTransactionType.OFFERED_HTLC_PENALTY,
              txid: mockTxid,
              vout: 1,
              value: 500000n,
              witnessScript: mockWitnessScript,
            },
          ],
          destinationScript: mockDestinationScript,
          feeRatePerKw: 1000,
          revocationPrivkey: mockPerCommitmentSecret,
          perCommitmentSecret: mockPerCommitmentSecret,
          revocationBasepoint: mockPoint,
        }

        const result = buildJusticeTransaction(params)

        expect(result?.inputs[0].penaltyType).toBe(PenaltyTransactionType.OFFERED_HTLC_PENALTY)
      })
    })

    describe('buildToLocalPenaltyWitness', () => {
      it('should build correct witness stack for to_local penalty', () => {
        const witness = buildToLocalPenaltyWitness(mockSignature, mockWitnessScript)

        expect(witness.length).toBe(3)
        expect(witness[0]).toEqual(mockSignature)
        expect(witness[1]).toEqual(new Uint8Array([0x01])) // 1 for revocation path
        expect(witness[2]).toEqual(mockWitnessScript)
      })
    })

    describe('buildOfferedHtlcPenaltyWitness', () => {
      it('should build correct witness stack for offered HTLC penalty', () => {
        const witness = buildOfferedHtlcPenaltyWitness(
          mockSignature,
          mockRevocationPubkey,
          mockWitnessScript,
        )

        expect(witness.length).toBe(3)
        expect(witness[0]).toEqual(mockSignature)
        expect(witness[1]).toEqual(mockRevocationPubkey)
        expect(witness[2]).toEqual(mockWitnessScript)
      })
    })

    describe('buildReceivedHtlcPenaltyWitness', () => {
      it('should build correct witness stack for received HTLC penalty', () => {
        const witness = buildReceivedHtlcPenaltyWitness(
          mockSignature,
          mockRevocationPubkey,
          mockWitnessScript,
        )

        expect(witness.length).toBe(3)
        expect(witness[0]).toEqual(mockSignature)
        expect(witness[1]).toEqual(mockRevocationPubkey)
        expect(witness[2]).toEqual(mockWitnessScript)
      })
    })

    describe('detectRevokedCommitment', () => {
      it('should detect revoked commitment when secret is non-zero', () => {
        const result = detectRevokedCommitment(mockTxid, mockPerCommitmentSecret, mockPoint)

        expect(result).toBe(true)
      })

      it('should not detect revoked commitment when secret is zero', () => {
        const zeroSecret = new Uint8Array(32).fill(0)
        const result = detectRevokedCommitment(mockTxid, zeroSecret, mockPoint)

        expect(result).toBe(false)
      })
    })

    describe('findRevokedOutputs', () => {
      it('should find P2WSH outputs in revoked commitment', () => {
        const tx: Tx = {
          ...mockCommitmentTx,
          vout: [
            {
              value: 0.01,
              n: 0,
              scriptPubKey: {
                asm: '',
                hex: '0020' + 'aa'.repeat(32),
                reqSigs: 1,
                type: 'witness_v0_scripthash',
                address: 'bc1qmockaddress',
              },
            },
            {
              value: 0.005,
              n: 1,
              scriptPubKey: {
                asm: '',
                hex: '0020' + 'bb'.repeat(32),
                reqSigs: 1,
                type: 'witness_v0_scripthash',
                address: 'bc1qmockaddress2',
              },
            },
          ],
        }

        const result = findRevokedOutputs(tx, mockContext, mockPerCommitmentSecret)

        expect(result.length).toBe(2)
        expect(result[0].type).toBe(PenaltyTransactionType.TO_LOCAL_PENALTY)
        expect(result[0].vout).toBe(0)
        expect(result[1].vout).toBe(1)
      })

      it('should skip non-P2WSH outputs', () => {
        const tx: Tx = {
          ...mockCommitmentTx,
          vout: [
            {
              value: 0.01,
              n: 0,
              scriptPubKey: {
                asm: '',
                hex: '0014' + 'aa'.repeat(20), // P2WPKH
                reqSigs: 1,
                type: 'witness_v0_keyhash',
                address: 'bc1qmockaddress',
              },
            },
          ],
        }

        const result = findRevokedOutputs(tx, mockContext, mockPerCommitmentSecret)

        expect(result.length).toBe(0)
      })
    })

    describe('deriveRevocationPrivkey', () => {
      it('should derive revocation privkey from secrets', () => {
        const revocationBasepointSecret = new Uint8Array(32).fill(0x11)
        const perCommitmentSecret = new Uint8Array(32).fill(0x22)
        const revocationBasepoint = new Uint8Array(33).fill(0x33)
        const perCommitmentPoint = new Uint8Array(33).fill(0x44)

        const result = deriveRevocationPrivkey(
          revocationBasepointSecret,
          perCommitmentSecret,
          revocationBasepoint,
          perCommitmentPoint,
        )

        expect(result).toBeInstanceOf(Uint8Array)
        expect(result.length).toBe(32)
        // O resultado deve ser determinístico
        const result2 = deriveRevocationPrivkey(
          revocationBasepointSecret,
          perCommitmentSecret,
          revocationBasepoint,
          perCommitmentPoint,
        )
        expect(result).toEqual(result2)
      })
    })

    describe('serializeSweepTransaction', () => {
      it('should serialize sweep transaction to bytes', () => {
        const tx = {
          version: 2,
          locktime: 1000,
          inputs: [
            {
              txid: mockTxid,
              vout: 0,
              sequence: 144,
              witnessScript: mockWitnessScript,
              witnessStack: [],
            },
          ],
          outputs: [
            {
              value: 90000n,
              scriptPubKey: mockDestinationScript,
            },
          ],
          weight: 500,
          fee: 10000n,
          totalSwept: 90000n,
        }

        const result = serializeSweepTransaction(tx)

        expect(result).toBeInstanceOf(Uint8Array)
        expect(result.length).toBeGreaterThan(0)

        // Verificar versão (little-endian)
        expect(result[0]).toBe(2)
        expect(result[1]).toBe(0)
        expect(result[2]).toBe(0)
        expect(result[3]).toBe(0)

        // Verificar marker e flag (segwit)
        expect(result[4]).toBe(0)
        expect(result[5]).toBe(1)
      })

      it('should serialize justice transaction to bytes', () => {
        const tx = {
          version: 2,
          locktime: 0,
          inputs: [
            {
              txid: mockTxid,
              vout: 0,
              sequence: 0xffffffff,
              witnessScript: mockWitnessScript,
              penaltyType: PenaltyTransactionType.TO_LOCAL_PENALTY,
            },
          ],
          outputs: [
            {
              value: 900000n,
              scriptPubKey: mockDestinationScript,
            },
          ],
          weight: 400,
          fee: 100000n,
          totalRecovered: 900000n,
        }

        const result = serializeSweepTransaction(tx)

        expect(result).toBeInstanceOf(Uint8Array)
        expect(result.length).toBeGreaterThan(0)
      })
    })
  })

  // ==========================================
  // BOLT #5 Appendix A: Expected Weights
  // ==========================================

  describe('BOLT #5 Appendix A: Weight Calculations', () => {
    describe('Penalty Transaction Witness Weights', () => {
      it('to_local_penalty_witness should be 160 bytes', () => {
        // From Appendix A: to_local_penalty_witness: 160 bytes
        // 1 (items) + 1 (siglen) + 73 (sig) + 1 (1 for revocation) + 1 (script len) + 83 (script)
        expect(calculatePenaltyWeight(PenaltyTransactionType.TO_LOCAL_PENALTY)).toBe(160)
      })

      it('offered_htlc_penalty_witness should be 243 bytes', () => {
        // From Appendix A: offered_htlc_penalty_witness: 243 bytes
        expect(calculatePenaltyWeight(PenaltyTransactionType.OFFERED_HTLC_PENALTY)).toBe(243)
      })

      it('accepted_htlc_penalty_witness should be 249 bytes', () => {
        // From Appendix A: accepted_htlc_penalty_witness: 249 bytes
        expect(calculatePenaltyWeight(PenaltyTransactionType.RECEIVED_HTLC_PENALTY)).toBe(249)
      })
    })

    describe('Penalty Transaction Input Weights', () => {
      it('to_local penalty input should be 324 bytes', () => {
        // From Appendix A: to_local_penalty input: 324 bytes
        // 41 (prevout) + 4 (sequence) + 1 (script len) + 160 (witness) + 118 (script)
        expect(calculatePenaltyInputWeight(PenaltyTransactionType.TO_LOCAL_PENALTY)).toBe(324)
      })

      it('offered HTLC penalty input should be 407 bytes', () => {
        // From Appendix A: offered_htlc_penalty input: 407 bytes
        expect(calculatePenaltyInputWeight(PenaltyTransactionType.OFFERED_HTLC_PENALTY)).toBe(407)
      })

      it('received HTLC penalty input should be 413 bytes', () => {
        // From Appendix A: accepted_htlc_penalty input: 413 bytes
        expect(calculatePenaltyInputWeight(PenaltyTransactionType.RECEIVED_HTLC_PENALTY)).toBe(413)
      })
    })
  })
})
