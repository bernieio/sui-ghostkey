/**
 * Sui Client Service for GhostKey Marketplace
 * Provides blockchain interaction for listings and access passes
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CONFIG, suiToMist } from '@/config/sui';
import type { ListingWithMeta, AccessPass } from '@/types/marketplace';

// Re-export types for backward compatibility
export type { ListingWithMeta, AccessPass };

// Initialize Sui client - HTTP only mode
// WebSocket subscriptions are disabled due to public node limitations
// Data freshness is handled by React Query polling
export const suiClient = new SuiClient({
  url: SUI_CONFIG.rpcUrl,
});

export default suiClient;

// ============= Data Fetching =============

/**
 * Extract string value from Sui field (handles both raw strings and nested objects)
 * Sui can return strings as either direct values or as { fields: { ... } } objects
 */
function extractStringField(field: unknown): string {
  if (typeof field === 'string') {
    return field;
  }
  // Handle Sui String type which may be wrapped
  if (typeof field === 'object' && field !== null) {
    const obj = field as Record<string, unknown>;
    // Check for direct value
    if (typeof obj.value === 'string') return obj.value;
    // Check for fields wrapper (common in Move String types)
    if (obj.fields && typeof obj.fields === 'object') {
      const fields = obj.fields as Record<string, unknown>;
      if (typeof fields.value === 'string') return fields.value;
      // Some String types use 'bytes' field
      if (fields.bytes) return String(fields.bytes);
    }
  }
  return '';
}

/**
 * Parse listing object from Sui response
 * Maps smart contract fields to ListingWithMeta type
 */
function parseListing(objectId: string, fields: Record<string, unknown>): ListingWithMeta {
  // Debug: Log raw fields to understand structure
  console.log('📋 Parsing listing fields:', objectId, JSON.stringify(fields, (_, v) => 
    typeof v === 'bigint' ? v.toString() : v
  , 2));
  
  const basePrice = BigInt(fields.base_price as string || '0');
  const priceSlope = BigInt(fields.price_slope as string || '0');
  const activeRentals = BigInt(fields.active_rentals as string || '0');
  
  // Calculate current price: base_price + (price_slope * active_rentals)
  const currentPrice = basePrice + (priceSlope * activeRentals);
  
  // Calculate price per hour (same as base_price for first rental)
  const pricePerHour = basePrice;

  // Extract balance value - handle both raw value and Balance<SUI> object
  let balanceValue = BigInt(0);
  if (fields.balance !== undefined) {
    if (typeof fields.balance === 'string' || typeof fields.balance === 'number') {
      balanceValue = BigInt(fields.balance);
    } else if (typeof fields.balance === 'object' && fields.balance !== null) {
      // Balance<SUI> is stored as { value: string }
      const balObj = fields.balance as { value?: string };
      balanceValue = BigInt(balObj.value || '0');
    }
  }

  // Extract string fields using helper (handles Sui's String type wrapping)
  const walrusBlobId = extractStringField(fields.walrus_blob_id);
  const litDataHash = extractStringField(fields.lit_data_hash);
  const mimeType = extractStringField(fields.mime_type) || 'application/octet-stream';
  
  // Debug: Log extracted values
  console.log('📋 Extracted listing values:', {
    objectId,
    walrusBlobId: walrusBlobId || 'MISSING!',
    litDataHash: litDataHash || 'MISSING!',
    mimeType,
    seller: fields.seller,
    isActive: fields.is_active,
  });

  // Validate required fields
  if (!walrusBlobId) {
    console.error('❌ walrus_blob_id is missing or empty! Raw field:', fields.walrus_blob_id);
  }
  
  return {
    // ListingWithMeta specific fields
    objectId,
    currentPrice,
    pricePerHour,
    
    // Base Listing fields
    id: objectId,
    seller: fields.seller as string,
    walrusBlobId,
    litDataHash,
    basePrice,
    priceSlope,
    activeRentals,
    mimeType,
    balance: balanceValue,
    isActive: fields.is_active as boolean ?? true,
    lastDecayTimestamp: BigInt(fields.last_decay_timestamp as string || '0'),
    decayedThisPeriod: BigInt(fields.decayed_this_period as string || '0'),
  };
}

/**
 * Parse access pass object from Sui response
 * Maps smart contract fields to AccessPass type
 */
function parseAccessPass(objectId: string, fields: Record<string, unknown>): AccessPass {
  return {
    id: objectId,
    listingId: fields.listing_id as string,
    expiryMs: BigInt(fields.expiry_ms as string || fields.expires_at as string || '0'),
    originalBuyer: fields.original_buyer as string || fields.buyer as string || '',
  };
}

/**
 * Fetch all listings from the marketplace
 */
export async function fetchListings(): Promise<ListingWithMeta[]> {
  try {
    // Query for ListingCreated events to get all listing IDs
    const eventsResponse = await suiClient.queryEvents({
      query: {
        MoveEventType: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::ListingCreated`,
      },
      limit: 50,
      order: 'descending',
    });

    const listingIds = eventsResponse.data.map(event => {
      const parsed = event.parsedJson as { listing_id: string };
      return parsed.listing_id;
    });

    if (listingIds.length === 0) {
      return [];
    }

    // Fetch all listing objects
    const objects = await suiClient.multiGetObjects({
      ids: listingIds,
      options: {
        showContent: true,
        showOwner: true,
      },
    });

    const listings: ListingWithMeta[] = [];

    for (const obj of objects) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as Record<string, unknown>;
        listings.push(parseListing(obj.data.objectId, fields));
      }
    }

    return listings;
  } catch (error) {
    console.error('Error fetching listings:', error);
    return [];
  }
}

/**
 * Fetch a single listing by ID
 */
export async function fetchListing(listingId: string): Promise<ListingWithMeta | null> {
  try {
    const response = await suiClient.getObject({
      id: listingId,
      options: {
        showContent: true,
        showOwner: true,
      },
    });

    if (response.data?.content?.dataType === 'moveObject') {
      const fields = response.data.content.fields as Record<string, unknown>;
      return parseListing(response.data.objectId, fields);
    }

    return null;
  } catch (error) {
    console.error('Error fetching listing:', error);
    return null;
  }
}

/**
 * Fetch user's access passes
 */
export async function fetchUserAccessPasses(address: string): Promise<AccessPass[]> {
  try {
    const response = await suiClient.getOwnedObjects({
      owner: address,
      filter: {
        StructType: SUI_CONFIG.types.accessPass,
      },
      options: {
        showContent: true,
      },
    });

    const passes: AccessPass[] = [];

    for (const obj of response.data) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as Record<string, unknown>;
        passes.push(parseAccessPass(obj.data.objectId, fields));
      }
    }

    return passes;
  } catch (error) {
    console.error('Error fetching access passes:', error);
    return [];
  }
}

/**
 * Fetch seller's listings
 * NOTE: Listings are shared objects, not owned by seller.
 * We query ListingCreated events and filter by seller field in the object.
 */
export async function fetchSellerListings(sellerAddress: string): Promise<ListingWithMeta[]> {
  try {
    // Query for ListingCreated events to get all listing IDs
    const eventsResponse = await suiClient.queryEvents({
      query: {
        MoveEventType: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::ListingCreated`,
      },
      limit: 100,
      order: 'descending',
    });

    const listingIds = eventsResponse.data.map(event => {
      const parsed = event.parsedJson as { listing_id: string };
      return parsed.listing_id;
    });

    if (listingIds.length === 0) {
      return [];
    }

    // Fetch all listing objects
    const objects = await suiClient.multiGetObjects({
      ids: listingIds,
      options: {
        showContent: true,
      },
    });

    const listings: ListingWithMeta[] = [];

    for (const obj of objects) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as Record<string, unknown>;
        // Filter by seller address
        if (fields.seller === sellerAddress) {
          listings.push(parseListing(obj.data.objectId, fields));
        }
      }
    }

    return listings;
  } catch (error) {
    console.error('Error fetching seller listings:', error);
    return [];
  }
}

// ============= Transaction Building =============

/**
 * Build transaction to create a new listing
 */
export function buildCreateListingTx(
  blobId: string,
  litDataHash: string,
  basePriceSui: number,
  slopeMist: number,
  mimeType: string
): Transaction {
  const tx = new Transaction();
  
  const basePriceMist = suiToMist(basePriceSui);
  
  // Contract signature: create_listing(blob_id, lit_data_hash, base_price, slope, mime_type)
  // Note: ctx is handled automatically by Sui, Clock is NOT needed for create_listing
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::create_listing`,
    arguments: [
      tx.pure.string(blobId),
      tx.pure.string(litDataHash),
      tx.pure.u64(basePriceMist),
      tx.pure.u64(BigInt(slopeMist)),
      tx.pure.string(mimeType),
    ],
  });

  return tx;
}

/**
 * Build transaction to rent access to a listing
 * Contract signature: rent_access(listing, payment, hours, clock, ctx)
 */
export function buildRentAccessTx(
  listingId: string,
  hours: number,
  paymentAmountMist: bigint
): Transaction {
  const tx = new Transaction();
  
  // Split coin for payment
  const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmountMist)]);
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::rent_access`,
    arguments: [
      tx.object(listingId),       // listing: &mut Listing
      paymentCoin,                // payment: Coin<SUI>
      tx.pure.u64(BigInt(hours)), // hours: u64
      tx.object(SUI_CONFIG.clockObjectId), // clock: &Clock
    ],
  });

  return tx;
}

/**
 * Build transaction to withdraw earnings from a listing
 */
export function buildWithdrawTx(listingId: string, amountMist: bigint): Transaction {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::withdraw_balance`,
    arguments: [
      tx.object(listingId),
      tx.pure.u64(amountMist),
    ],
  });

  return tx;
}

/**
 * Build transaction to pause a listing
 */
export function buildPauseListingTx(listingId: string): Transaction {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::pause_listing`,
    arguments: [
      tx.object(listingId),
    ],
  });

  return tx;
}

/**
 * Build transaction to resume a listing
 */
export function buildResumeListingTx(listingId: string): Transaction {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::resume_listing`,
    arguments: [
      tx.object(listingId),
    ],
  });

  return tx;
}

/**
 * Build transaction to update listing pricing
 */
export function buildUpdatePricingTx(
  listingId: string,
  newBasePriceMist: bigint,
  newSlopeMist: bigint
): Transaction {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::update_pricing`,
    arguments: [
      tx.object(listingId),
      tx.pure.u64(newBasePriceMist),
      tx.pure.u64(newSlopeMist),
    ],
  });

  return tx;
}

/**
 * Build transaction to transfer listing ownership
 */
export function buildTransferListingTx(listingId: string, newOwner: string): Transaction {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::transfer_listing`,
    arguments: [
      tx.object(listingId),
      tx.pure.address(newOwner),
    ],
  });

  return tx;
}

/**
 * Build transaction to decay expired rentals
 */
export function buildDecayRentalsTx(listingId: string, expiryMsList: bigint[]): Transaction {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::decay_rentals`,
    arguments: [
      tx.object(listingId),
      tx.pure.vector('u64', expiryMsList),
      tx.object(SUI_CONFIG.clockObjectId),
    ],
  });

  return tx;
}

// ============= Event Subscription =============

/**
 * Subscribe to blockchain events
 * NOTE: WebSocket subscriptions are DISABLED in HTTP-only mode.
 * Data freshness is handled by React Query polling (refetchInterval).
 * 
 * This function is kept for API compatibility but returns no-op immediately
 * when enableWebsocketSubscriptions is false.
 */
export async function subscribeToEvents(
  _eventType: string,
  _callback: (event: unknown) => void
): Promise<() => void> {
  // HTTP-only mode: WebSocket subscriptions are disabled
  if (!SUI_CONFIG.enableWebsocketSubscriptions) {
    console.debug('[Sui] WebSocket disabled (HTTP-only mode). Using React Query polling for data freshness.');
    return () => {};
  }
  
  // WebSocket mode would go here if enabled
  // Currently disabled - return no-op
  return () => {};
}

/**
 * Fetch rental events for a listing (for revenue charts)
 */
export async function fetchRentalEvents(listingId?: string): Promise<{
  listingId: string;
  buyer: string;
  pricePaid: bigint;
  hours: bigint;
  timestamp: number;
}[]> {
  try {
    const response = await suiClient.queryEvents({
      query: {
        MoveEventType: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::AccessRented`,
      },
      limit: 100,
      order: 'descending',
    });

    const events = response.data
      .filter(event => {
        if (!listingId) return true;
        const parsed = event.parsedJson as { listing_id: string };
        return parsed.listing_id === listingId;
      })
      .map(event => {
        const parsed = event.parsedJson as {
          listing_id: string;
          buyer: string;
          price_paid: string;
          hours: string;
        };
        return {
          listingId: parsed.listing_id,
          buyer: parsed.buyer,
          pricePaid: BigInt(parsed.price_paid),
          hours: BigInt(parsed.hours),
          timestamp: Number(event.timestampMs),
        };
      });

    return events;
  } catch (error) {
    console.error('Error fetching rental events:', error);
    return [];
  }
}
