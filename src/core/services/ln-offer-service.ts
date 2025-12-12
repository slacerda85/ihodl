/**
 * Lightning Offer (BOLT12) Service
 * Camada de serviço para criar/decodificar/validar offers.
 */

import {
  createOffer,
  decodeOffer,
  validateOffer,
  getOfferExpiryStatus,
  type CreateOfferParams,
} from '../lib/lightning/negotiation'
import type { Offer, OfferValidation, OfferExpiryStatus } from '../models/lightning/negotiation'
import { uint8ArrayToHex } from '../lib/utils/utils'

export { createOffer, decodeOffer, validateOffer, getOfferExpiryStatus, uint8ArrayToHex }
export type { CreateOfferParams, Offer, OfferValidation, OfferExpiryStatus }
