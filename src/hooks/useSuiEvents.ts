/**
 * useSuiEvents Hook
 * Subscribe to real-time Sui blockchain events
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

  useEffect(() => {
    if (!enabled) return;

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
        console.log(`✅ Subscribed to ${eventType} events`);
      } catch (error) {
        console.error(`Failed to subscribe to ${eventType}:`, error);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
        console.log(`🔌 Unsubscribed from ${eventType} events`);
      }
    };
  }, [eventType, callback, enabled, queryClient, options?.invalidateQueries]);
}

/**
 * Subscribe to multiple Sui event types
 */
export function useSuiEvents(handlers: EventHandler[], enabled: boolean = true) {
  const queryClient = useQueryClient();
  const unsubscribesRef = useRef<Map<EventType, () => void>>(new Map());

  useEffect(() => {
    if (!enabled) return;

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
          console.log(`✅ Subscribed to ${handler.eventType} events`);
        } catch (error) {
          console.error(`Failed to subscribe to ${handler.eventType}:`, error);
        }
      }
    };

    subscribeAll();

    return () => {
      unsubscribesRef.current.forEach((unsubscribe, eventType) => {
        unsubscribe();
        console.log(`🔌 Unsubscribed from ${eventType} events`);
      });
      unsubscribesRef.current.clear();
    };
  }, [handlers, enabled, queryClient]);
}

/**
 * Pre-configured hook for marketplace events
 * Automatically invalidates relevant queries when events occur
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
