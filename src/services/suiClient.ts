/**
 * Sui Client Service for GhostKey Marketplace
 * Provides blockchain interaction for listings and access passes
 */

import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CONFIG, suiToMist } from '@/config/sui';
import type { ListingWithMeta, AccessPass } from '@/types/marketplace';

// Re-export types for backward compatibility
export type { ListingWithMeta, AccessPass };

const WS_RPC_BY_NETWORK: Record<typeof SUI_CONFIG.network, string> = {
  testnet: 'wss://rpc.testnet.sui.io:443',
};

// Initialize Sui client.
// IMPORTANT: HTTP RPC uses fullnode.* but WebSocket subscriptions should use rpc.*
export const suiClient = new SuiClient({
  transport: new SuiHTTPTransport({
    url: SUI_CONFIG.rpcUrl,
    websocket: {
      url: WS_RPC_BY_NETWORK[SUI_CONFIG.network],
      reconnectTimeout: 1000,
    },
  }),
});

export default suiClient;

// ============= Data Fetching =============

/**
 * Parse listing object from Sui response
 * Maps smart contract fields to ListingWithMeta type
 */
function parseListing(objectId: string, fields: Record<string, unknown>): ListingWithMeta {
  const basePrice = BigInt(fields.base_price as string || '0');
  const priceSlope = BigInt(fields.price_slope as string || '0');
  const activeRentals = BigInt(fields.active_rentals as string || '0');
  
  // Calculate current price: base_price + (price_slope * active_rentals)
  const currentPrice = basePrice + (priceSlope * activeRentals);
  
  // Calculate price per hour (same as base_price for first rental)
  const pricePerHour = basePrice;
  
  return {
    // ListingWithMeta specific fields
    objectId,
    currentPrice,
    pricePerHour,
    
    // Base Listing fields
    id: objectId,
    seller: fields.seller as string,
    walrusBlobId: fields.blob_id as string,
    litDataHash: fields.lit_data_hash as string,
    basePrice,
    priceSlope,
    activeRentals,
    mimeType: fields.mime_type as string || 'application/octet-stream',
    balance: BigInt(fields.balance as string || '0'),
    isActive: !(fields.is_paused as boolean || false),
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
 */
export async function fetchSellerListings(sellerAddress: string): Promise<ListingWithMeta[]> {
  try {
    const response = await suiClient.getOwnedObjects({
      owner: sellerAddress,
      filter: {
        StructType: SUI_CONFIG.types.listing,
      },
      options: {
        showContent: true,
      },
    });

    const listings: ListingWithMeta[] = [];

    for (const obj of response.data) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as Record<string, unknown>;
        listings.push(parseListing(obj.data.objectId, fields));
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
 */
export function buildRentAccessTx(
  listingId: string,
  hours: number,
  paymentAmountMist: bigint,
  maxPricePerHourMist: bigint
): Transaction {
  const tx = new Transaction();
  
  // Split coin for payment
  const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmountMist)]);
  
  tx.moveCall({
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::rent_access`,
    arguments: [
      tx.object(listingId),
      tx.pure.u64(BigInt(hours)),
      paymentCoin,
      tx.pure.u64(maxPricePerHourMist),
      tx.object(SUI_CONFIG.clockObjectId),
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
 * NOTE: Sui testnet public fullnode has limited WebSocket support.
 * This function will fail gracefully if WebSocket is not available.
 * Use polling-based approach (React Query refetch) as primary method.
 */
export async function subscribeToEvents(
  eventType: string,
  callback: (event: unknown) => void
): Promise<() => void> {
  try {
    const unsubscribe = await suiClient.subscribeEvent({
      filter: {
        MoveEventType: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::${eventType}`,
      },
      onMessage: callback,
    });
    
    return unsubscribe;
  } catch (error) {
    // WebSocket subscription failed - this is expected on public Sui nodes
    // Log warning but don't throw - app will use polling via React Query instead
    console.warn(`WebSocket subscription for ${eventType} not available (this is normal on public nodes)`);
    
    // Return a no-op unsubscribe function
    return () => {};
  }
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
