/**
 * Sui Client Service for GhostKey
 * Handles blockchain queries and transaction construction
 */

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CONFIG, suiToMist, mistToSui } from '@/config/sui';
import type { Listing, ListingWithMeta, AccessPass } from '@/types/marketplace';

// Create Sui client instance
export const suiClient = new SuiClient({
  url: getFullnodeUrl(SUI_CONFIG.network),
});

/**
 * Parse a raw Listing object from Sui RPC response
 */
function parseListing(objectId: string, fields: Record<string, unknown>): ListingWithMeta {
  const basePrice = BigInt(fields.base_price as string);
  const priceSlope = BigInt(fields.price_slope as string);
  const activeRentals = BigInt(fields.active_rentals as string);
  
  // Calculate current price using bonding curve formula
  const currentPrice = basePrice + (activeRentals * priceSlope);
  
  return {
    id: (fields.id as { id: string })?.id || objectId,
    objectId,
    seller: fields.seller as string,
    walrusBlobId: fields.walrus_blob_id as string,
    litDataHash: fields.lit_data_hash as string,
    basePrice,
    priceSlope,
    activeRentals,
    mimeType: fields.mime_type as string,
    balance: BigInt((fields.balance as string) || '0'),
    isActive: fields.is_active as boolean,
    lastDecayTimestamp: BigInt((fields.last_decay_timestamp as string) || '0'),
    decayedThisPeriod: BigInt((fields.decayed_this_period as string) || '0'),
    currentPrice,
    pricePerHour: currentPrice,
  };
}

/**
 * Parse a raw AccessPass object from Sui RPC response
 */
function parseAccessPass(objectId: string, fields: Record<string, unknown>): AccessPass {
  return {
    id: objectId,
    listingId: fields.listing_id as string,
    expiryMs: BigInt(fields.expiry_ms as string),
    originalBuyer: fields.original_buyer as string,
  };
}

/**
 * Fetch all marketplace listings
 */
export async function fetchListings(): Promise<ListingWithMeta[]> {
  try {
    const response = await suiClient.queryEvents({
      query: {
        MoveEventType: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::ListingCreated`,
      },
      limit: 50,
      order: 'descending',
    });

    const listingIds = response.data.map(event => {
      const parsedJson = event.parsedJson as { listing_id: string };
      return parsedJson.listing_id;
    });

    if (listingIds.length === 0) {
      return [];
    }

    // Fetch listing objects
    const objects = await suiClient.multiGetObjects({
      ids: listingIds,
      options: { showContent: true },
    });

    const listings: ListingWithMeta[] = [];
    
    for (const obj of objects) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = (obj.data.content as { fields: Record<string, unknown> }).fields;
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
      options: { showContent: true },
    });

    if (response.data?.content?.dataType === 'moveObject') {
      const fields = (response.data.content as { fields: Record<string, unknown> }).fields;
      return parseListing(listingId, fields);
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching listing:', error);
    return null;
  }
}

/**
 * Fetch AccessPass objects owned by an address
 */
export async function fetchUserAccessPasses(address: string): Promise<AccessPass[]> {
  try {
    const response = await suiClient.getOwnedObjects({
      owner: address,
      filter: {
        StructType: SUI_CONFIG.types.accessPass,
      },
      options: { showContent: true },
    });

    const passes: AccessPass[] = [];
    
    for (const obj of response.data) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = (obj.data.content as { fields: Record<string, unknown> }).fields;
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
 * Fetch listings created by a specific seller
 */
export async function fetchSellerListings(sellerAddress: string): Promise<ListingWithMeta[]> {
  const allListings = await fetchListings();
  return allListings.filter(listing => listing.seller === sellerAddress);
}

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
 * Build transaction to rent access with slippage protection
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
    target: `${SUI_CONFIG.packageId}::${SUI_CONFIG.moduleName}::rent_access_with_max_price`,
    arguments: [
      tx.object(listingId),
      paymentCoin,
      tx.pure.u64(BigInt(hours)),
      tx.pure.u64(maxPricePerHourMist),
      tx.object(SUI_CONFIG.clockObjectId),
    ],
  });
  
  return tx;
}

/**
 * Build transaction to withdraw balance
 */
export function buildWithdrawTx(
  listingId: string,
  amountMist: bigint
): Transaction {
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
    arguments: [tx.object(listingId)],
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
    arguments: [tx.object(listingId)],
  });
  
  return tx;
}

export default suiClient;
