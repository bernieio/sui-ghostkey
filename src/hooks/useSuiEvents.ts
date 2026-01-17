/**
 * useSuiEvents Hook
 * Subscribe to real-time Sui blockchain events
 * 
 * NOTE: Sui testnet public nodes have limited WebSocket support.
 * This hook will attempt WebSocket subscription but fail gracefully.
 * Primary data refresh is handled by React Query polling/refetch.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToEvents } from '@/services/suiClient';

type EventType = 'ListingCreated' | 'AccessRented' | 'BalanceWithdrawn' | 'ListingPaused' | 'ListingResumed';

interface EventHandler {
  eventType: EventType;
  callback?: (event: unknown) => void;
  invalidateQueries?: string[];
}

/**
 * Subscribe to a single Sui event type
 * Will fail gracefully if WebSocket is not available
 */
export function useSuiEvent(
  eventType: EventType,
  callback?: (event: unknown) => void,
  options?: {
    enabled?: boolean;
    invalidateQueries?: string[];
  }
) {
  const queryClient = useQueryClient();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const enabled = options?.enabled ?? true;
  const hasSubscribedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    
    // Prevent duplicate subscriptions
    if (hasSubscribedRef.current) return;
    hasSubscribedRef.current = true;

    const subscribe = async () => {
      try {
        const unsubscribe = await subscribeToEvents(eventType, (event) => {
          console.log(`📡 Event received: ${eventType}`, event);
          
          // Call custom callback if provided
          callback?.(event);
          
          // Invalidate specified queries
          if (options?.invalidateQueries) {
            options.invalidateQueries.forEach(queryKey => {
              queryClient.invalidateQueries({ queryKey: [queryKey] });
            });
          }
        });
        
        unsubscribeRef.current = unsubscribe;
        // Only log if subscription actually succeeded (check if unsubscribe is not no-op)
      } catch (error) {
        // Silently fail - WebSocket not available on public nodes
        console.debug(`Event subscription for ${eventType} not available`);
      }
    };

    subscribe();

    return () => {
      hasSubscribedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [eventType, enabled]); // Removed callback and options from deps to prevent re-subscription
}

/**
 * Subscribe to multiple Sui event types
 * Will fail gracefully if WebSocket is not available
 */
export function useSuiEvents(handlers: EventHandler[], enabled: boolean = true) {
  const queryClient = useQueryClient();
  const unsubscribesRef = useRef<Map<EventType, () => void>>(new Map());
  const hasSubscribedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    
    // Prevent duplicate subscriptions
    if (hasSubscribedRef.current) return;
    hasSubscribedRef.current = true;

    const subscribeAll = async () => {
      for (const handler of handlers) {
        try {
          const unsubscribe = await subscribeToEvents(handler.eventType, (event) => {
            console.log(`📡 Event received: ${handler.eventType}`, event);
            
            // Call custom callback if provided
            handler.callback?.(event);
            
            // Invalidate specified queries
            if (handler.invalidateQueries) {
              handler.invalidateQueries.forEach(queryKey => {
                queryClient.invalidateQueries({ queryKey: [queryKey] });
              });
            }
          });
          
          unsubscribesRef.current.set(handler.eventType, unsubscribe);
        } catch (error) {
          // Silently fail - WebSocket not available on public nodes
          console.debug(`Event subscription for ${handler.eventType} not available`);
        }
      }
    };

    subscribeAll();

    return () => {
      hasSubscribedRef.current = false;
      unsubscribesRef.current.forEach((unsubscribe) => {
        unsubscribe();
      });
      unsubscribesRef.current.clear();
    };
  }, [enabled]); // Removed handlers from deps to prevent re-subscription
}

/**
 * Pre-configured hook for marketplace events
 * Automatically invalidates relevant queries when events occur
 * 
 * NOTE: Due to Sui testnet WebSocket limitations, this hook may not
 * receive real-time events. React Query refetchInterval is the primary
 * mechanism for data freshness.
 */
export function useMarketplaceEvents(options?: {
  enabled?: boolean;
  onListingCreated?: (event: unknown) => void;
  onAccessRented?: (event: unknown) => void;
  onBalanceWithdrawn?: (event: unknown) => void;
}) {
  const enabled = options?.enabled ?? true;

  useSuiEvent('ListingCreated', options?.onListingCreated, {
    enabled,
    invalidateQueries: ['listings', 'seller-listings'],
  });

  useSuiEvent('AccessRented', options?.onAccessRented, {
    enabled,
    invalidateQueries: ['listing', 'seller-listings', 'user-access-passes', 'rental-events'],
  });

  useSuiEvent('BalanceWithdrawn', options?.onBalanceWithdrawn, {
    enabled,
    invalidateQueries: ['listing', 'seller-listings'],
  });
}

export default useSuiEvents;
