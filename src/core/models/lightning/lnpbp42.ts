// LNPBP-0046: Deterministic derivation paths for LNP
// Based on https://github.com/LNP-BP/LNPBPs/blob/master/lnpbp-0046.md

// Constants
export const LIGHTNING_PURPOSE = 9735 // BIP-43 purpose for Lightning

export enum Purpose {
  LIGHTNING = LIGHTNING_PURPOSE,
}

export enum Chain {
  Bitcoin = 0x80000000, // 0' - Bitcoin mainnet
}

// Enums
export enum LnVersion {
  BOLT = 0,
  BIFROST = 1,
}

export enum BasepointType {
  FUNDING = 0,
  PAYMENT = 1,
  DELAYED = 2,
  REVOCATION = 3,
  PER_COMMITMENT = 4,
  HTLC = 5,
  PTLC = 6,
}

export enum FundingWalletCase {
  RECEIVE = 0,
  CHANGE = 1,
  SHUTDOWN = 2,
  RGB20_RECEIVE = 200,
  RGB20_CHANGE = 201,
  RGB20_SHUTDOWN = 202,
}

export enum NodeIndex {
  NODE = 0x80000000, // 0' - Node level
  CHANNEL = 0x80000001, // 1' - Channel level
  FUNDING_WALLET = 0x80000002, // 2' - Funding wallet level
}

// Types
export type PerCommitmentIndex = number // Unhardened index for per-commitment points
export type FundingIndex = number // Sequential index for funding wallet
export type ChannelIndex = number // Hardened index constructed from channel id bits

// Interfaces
export interface DerivationPath {
  purpose: Purpose.LIGHTNING
  chain: Chain
  nodeIndex: NodeIndex
  lnVer?: LnVersion // Only for channel basepoints
  channel?: ChannelIndex // Only for channel basepoints
  basepoint?: BasepointType // For basepoints
  perCommitment?: PerCommitmentIndex // For per-commitment points
  fundingCase?: FundingWalletCase // For funding wallet
  fundingIndex?: FundingIndex // For funding wallet
}

export interface LightningKeyDerivation {
  extendedLightningKey: DerivationPath // m/9735'/
  nodeKey: DerivationPath // m/9735'/chain'/0'/node_index'
  channelBasepoint: DerivationPath // m/9735'/chain'/1'/ln_ver'/channel'
  basepoints: {
    funding: DerivationPath // /0
    payment: DerivationPath // /1
    delayed: DerivationPath // /2
    revocation: DerivationPath // /3
    perCommitment: DerivationPath // /4/*
    htlc: DerivationPath // /5
    ptlc: DerivationPath // /6
  }
  fundingWallet: DerivationPath // m/9735'/chain'/2'/case/index'
  shutdownKey: DerivationPath // Derived from funding wallet
}

// Utility functions (placeholders, to be implemented)
export function constructChannelIndex(channelId: string): ChannelIndex {
  // Construct hardened index from channel id bits (1 to 32, zero-based)
  // Implementation based on LNPBP-46: use most significant bits starting from 1 to 32
  const channelIdBytes = new Uint8Array(channelId.length / 2)
  for (let i = 0; i < channelIdBytes.length; i++) {
    channelIdBytes[i] = parseInt(channelId.substr(i * 2, 2), 16)
  }
  // Example: take first 4 bytes and convert to number, but adjust for hardening
  const view = new DataView(channelIdBytes.buffer)
  const index = (view.getUint32(0, false) >>> 1) | 0x80000000 // Hardened
  return index
}

export function buildDerivationPath(path: DerivationPath): string {
  let derivation = `m/${path.purpose}'/${path.chain >>> 0}'/${path.nodeIndex >>> 0}'`
  if (path.lnVer !== undefined) {
    derivation += `/${path.lnVer}'`
  }
  if (path.channel !== undefined) {
    derivation += `/${path.channel}'`
  }
  if (path.basepoint !== undefined) {
    derivation += `/${path.basepoint}`
    if (path.perCommitment !== undefined) {
      derivation += `/${path.perCommitment}`
    }
  }
  if (path.fundingCase !== undefined && path.fundingIndex !== undefined) {
    derivation += `/${path.fundingCase}/${path.fundingIndex}`
  }
  return derivation
}
