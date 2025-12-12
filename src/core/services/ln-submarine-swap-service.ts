/**
 * Lightning Submarine Swap Service
 *
 * Camada fina de serviço para expor tipos e helpers de submarine swap
 * à UI, mantendo a fronteira UI → Services → Lib.
 */

import {
  SwapType,
  SwapState,
  SwapData,
  SwapFees,
  SwapOffer,
  SwapManager,
  calculateSwapFee,
  MIN_SWAP_AMOUNT_SAT,
} from '../lib/lightning/submarineSwap'

export {
  SwapType,
  SwapState,
  SwapData,
  SwapFees,
  SwapOffer,
  SwapManager,
  calculateSwapFee,
  MIN_SWAP_AMOUNT_SAT,
}

// Facilita mocks em testes e mantém ponto único de import na UI
export const createSwapManager = (
  network: 'mainnet' | 'testnet' | 'regtest' = 'mainnet',
): SwapManager => new SwapManager(network)
