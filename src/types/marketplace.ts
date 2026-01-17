/**
 * GhostKey Marketplace Types
 * Matching smart contract struct definitions
 */

/**
 * Listing object from smart contract
 * Represents a marketplace listing for AI prompts/datasets
 */
export interface Listing {
  id: string;
  seller: string;
  walrusBlobId: string;
  litDataHash: string;
  basePrice: bigint;
  priceSlope: bigint;
  activeRentals: bigint;
  mimeType: string;
  balance: bigint;
  isActive: boolean;
  lastDecayTimestamp: bigint;
  decayedThisPeriod: bigint;
}

/**
 * AccessPass NFT from smart contract
 * Grants time-limited access to a listing
 */
export interface AccessPass {
  id: string;
  listingId: string;
  expiryMs: bigint;
  originalBuyer: string;
}

/**
 * Parsed listing with computed fields
 */
export interface ListingWithMeta extends Listing {
  currentPrice: bigint;
  pricePerHour: bigint;
  objectId: string;
}

/**
 * Events emitted by the smart contract
 */
export interface ListingCreatedEvent {
  listingId: string;
  seller: string;
  basePrice: bigint;
  priceSlope: bigint;
  walrusBlobId: string;
  mimeType: string;
}

export interface AccessRentedEvent {
  listingId: string;
  buyer: string;
  pricePaid: bigint;
  hours: bigint;
  expiryMs: bigint;
  walrusBlobId: string;
}

export interface BalanceWithdrawnEvent {
  listingId: string;
  seller: string;
  amount: bigint;
}

/**
 * Frontend-specific types
 */
export interface ListingFormData {
  title: string;
  description: string;
  category: string;
  basePrice: number; // in SUI
  priceSlope: number; // in MIST per rental
  file: File | null;
}

export interface RentalFormData {
  hours: number;
  maxPricePerHour: bigint;
}

export type ContentCategory = 
  | 'ai-prompt'
  | 'dataset'
  | 'code'
  | 'document'
  | 'image'
  | 'other';

export const CONTENT_CATEGORIES: { value: ContentCategory; label: string }[] = [
  { value: 'ai-prompt', label: 'AI Prompt' },
  { value: 'dataset', label: 'Dataset' },
  { value: 'code', label: 'Code' },
  { value: 'document', label: 'Document' },
  { value: 'image', label: 'Image' },
  { value: 'other', label: 'Other' },
];
