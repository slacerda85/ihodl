// BOLT #3: Bitcoin Transaction and Script Formats
// Based on https://github.com/lightning/bolts/blob/master/03-transactions.md

import { Sha256, Point } from './base'

// Constants
export const ANCHOR_AMOUNT_SAT = 330n
export const DUST_LIMIT_P2PKH = 546n
export const DUST_LIMIT_P2SH = 540n
export const DUST_LIMIT_P2WSH = 354n
export const DUST_LIMIT_UNKNOWN_SEGWIT = 354n
export const MIN_DEPTH = 6
export const MAX_HTLC_NUMBER = 483

// Key Types (derived from base points)
export type PrivateKey = Uint8Array // 32 bytes
export type LocalPubkey = Point
export type RemotePubkey = Point
export type RevocationPubkey = Point
export type LocalHtlcPubkey = Point
export type RemoteHtlcPubkey = Point
export type LocalDelayedPubkey = Point
export type RemoteDelayedPubkey = Point

// Payment Hash and Preimage
export type PaymentHash = Sha256
export type PaymentPreimage = Uint8Array // 32 bytes

// CLTV Expiry
export type CltvExpiry = number // block height

// Amounts
export type Satoshis = bigint
export type Millisatoshis = bigint

// Transaction Input
export interface CommitmentInput {
  fundingTxid: Sha256
  fundingOutputIndex: number
  sequence: number
  scriptSig: Uint8Array
  witness: WitnessStack
}

// Witness Stack
export type WitnessStack = Uint8Array[]

// Transaction Output
export interface BaseOutput {
  value: Satoshis
  scriptPubKey: Uint8Array
}

// Funding Transaction
export interface FundingTransaction {
  version: number
  locktime: number
  inputs: any[] // Standard Bitcoin inputs
  outputs: FundingOutput[]
  witnesses?: WitnessStack[]
}

export interface FundingOutput extends BaseOutput {
  // P2WSH script: 2 <local_funding_pubkey> <remote_funding_pubkey> 2 CHECKMULTISIG
  localFundingPubkey: Point
  remoteFundingPubkey: Point
}

// Commitment Transaction
export interface CommitmentTransaction {
  version: number
  locktime: number
  inputs: CommitmentInput[]
  outputs: CommitmentOutput[]
  witnesses?: WitnessStack[]
}

// Commitment Output Types
export enum CommitmentOutputType {
  TO_LOCAL = 'to_local',
  TO_REMOTE = 'to_remote',
  OFFERED_HTLC = 'offered_htlc',
  RECEIVED_HTLC = 'received_htlc',
  TO_LOCAL_ANCHOR = 'to_local_anchor',
  TO_REMOTE_ANCHOR = 'to_remote_anchor',
}

export interface ToLocalOutput extends BaseOutput {
  type: CommitmentOutputType.TO_LOCAL
  // P2WSH with revocation and delayed payment
}

export interface ToRemoteOutput extends BaseOutput {
  type: CommitmentOutputType.TO_REMOTE
  // P2WPKH to remote_pubkey
}

export interface OfferedHtlcOutput extends BaseOutput {
  type: CommitmentOutputType.OFFERED_HTLC
  cltvExpiry: CltvExpiry
  paymentHash: PaymentHash
  // P2WSH with revocation, timeout, and success conditions
}

export interface ReceivedHtlcOutput extends BaseOutput {
  type: CommitmentOutputType.RECEIVED_HTLC
  cltvExpiry: CltvExpiry
  paymentHash: PaymentHash
  // P2WSH with revocation, success, and timeout conditions
}

export interface AnchorOutput extends BaseOutput {
  type: CommitmentOutputType.TO_LOCAL_ANCHOR | CommitmentOutputType.TO_REMOTE_ANCHOR
  // P2WSH with anyone-can-spend after 16 blocks
}

export type CommitmentOutput =
  | ToLocalOutput
  | ToRemoteOutput
  | OfferedHtlcOutput
  | ReceivedHtlcOutput
  | AnchorOutput

// HTLC Transactions
export interface HtlcTimeoutTransaction {
  version: number
  locktime: CltvExpiry
  inputs: HtlcInput[]
  outputs: HtlcOutput[]
  witnesses?: WitnessStack[]
}

export interface HtlcSuccessTransaction {
  version: number
  locktime: number
  inputs: HtlcInput[]
  outputs: HtlcOutput[]
  witnesses?: WitnessStack[]
}

export interface HtlcInput {
  commitmentTxid: Sha256
  commitmentOutputIndex: number
  sequence: number
  scriptSig: Uint8Array
  witness: WitnessStack
}

export interface HtlcOutput {
  value: Satoshis
  scriptPubKey: Uint8Array
  // Usually to local or remote pubkey
  pubkey: Point
}

// Closing Transactions
export interface LegacyClosingTransaction {
  version: number
  locktime: number
  inputs: ClosingInput[]
  outputs: ClosingOutput[]
  witnesses?: WitnessStack[]
}

export interface ClosingTransaction {
  version: number
  locktime: number
  inputs: ClosingInput[]
  outputs: ClosingOutput[]
  witnesses?: WitnessStack[]
}

export interface ClosingInput {
  commitmentTxid: Sha256
  commitmentOutputIndex: number
  sequence: number
  scriptSig: Uint8Array
  witness: WitnessStack
}

export interface ClosingOutput {
  value: Satoshis
  scriptPubKey: Uint8Array
  // To local and remote addresses
  address: string
}

// Fee Calculation
export interface FeeCalculation {
  feeratePerKw: number
  baseFee: Satoshis
  actualFee: Satoshis
}

// Dust Limits
export interface DustLimits {
  p2pkh: Satoshis
  p2sh: Satoshis
  p2wpkh: Satoshis
  p2wsh: Satoshis
  unknownSegwit: Satoshis
}

// Commitment Transaction Construction Parameters
export interface CommitmentParams {
  fundingTxid: Sha256
  fundingOutputIndex: number
  commitmentNumber: bigint
  localFundingPubkey: Point
  remoteFundingPubkey: Point
  localPaymentBasepoint: Point
  localPaymentBasepointPriv: PrivateKey
  remotePaymentBasepoint: Point
  remotePubkey: Point
  localHtlcBasepoint: Point
  localHtlcBasepointPriv: PrivateKey
  remoteHtlcBasepoint: Point
  remoteHtlcPubkey: Point
  localDelayedPaymentBasepoint: Point
  localDelayedPaymentBasepointPriv: PrivateKey
  remoteDelayedPaymentBasepoint: Point
  remoteDelayedPubkey: Point
  revocationBasepoint: Point
  revocationBasepointPriv: PrivateKey
  localToSelfDelay: number
  remoteToSelfDelay: number
  toLocalMsat: Millisatoshis
  toRemoteMsat: Millisatoshis
  localDustLimit: Satoshis
  remoteDustLimit: Satoshis
  feeratePerKw: number
  obscuringFactor: bigint
  optionAnchors: boolean
  htlcs: Htlc[]
}

export interface Htlc {
  id: bigint
  amountMsat: Millisatoshis
  cltvExpiry: CltvExpiry
  paymentHash: PaymentHash
  direction: 'offered' | 'received'
}

// Key Derivation Results
export interface DerivedKeys {
  localPubkey: LocalPubkey
  localHtlcPubkey: LocalHtlcPubkey
  localDelayedPubkey: LocalDelayedPubkey
  revocationPubkey: RevocationPubkey
}

// Script Templates (as strings for readability, convert to Uint8Array as needed)
export const OFFERED_HTLC_SCRIPT_TEMPLATE = `
OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
OP_IF
    OP_CHECKSIG
OP_ELSE
    <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
    OP_NOTIF
        OP_DROP 2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
    OP_ELSE
        OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
        OP_CHECKSIG
    OP_ENDIF
    1 OP_CHECKSEQUENCEVERIFY OP_DROP  # for option_anchors
OP_ENDIF
`

export const RECEIVED_HTLC_SCRIPT_TEMPLATE = `
OP_DUP OP_HASH160 <RIPEMD160(SHA256(revocationpubkey))> OP_EQUAL
OP_IF
    OP_CHECKSIG
OP_ELSE
    <remote_htlcpubkey> OP_SWAP OP_SIZE 32 OP_EQUAL
    OP_IF
        OP_HASH160 <RIPEMD160(payment_hash)> OP_EQUALVERIFY
        2 OP_SWAP <local_htlcpubkey> 2 OP_CHECKMULTISIG
    OP_ELSE
        OP_DROP <cltv_expiry> OP_CHECKLOCKTIMEVERIFY OP_DROP
        OP_CHECKSIG
    OP_ENDIF
    1 OP_CHECKSEQUENCEVERIFY OP_DROP  # for option_anchors
OP_ENDIF
`

export const TO_LOCAL_SCRIPT_TEMPLATE = `
OP_IF
    <revocationpubkey>
OP_ELSE
    <local_delayedpubkey>
OP_ENDIF
OP_CHECKSIG
`

export const ANCHOR_SCRIPT_TEMPLATE = `
OP_1
`
