/**
 * Sui Wallet Provider for GhostKey
 * Wraps the app with Sui dApp Kit providers
 */

import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SUI_CONFIG } from '@/config/sui';

// Import dapp-kit styles for modal rendering
import '@mysten/dapp-kit/dist/index.css';

// Configure networks
const { networkConfig } = createNetworkConfig({
  testnet: { url: SUI_CONFIG.rpcUrl ?? getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

// Create query client with GhostKey-specific defaults - only once
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

interface SuiProviderProps {
  children: ReactNode;
}

export function SuiProvider({ children }: SuiProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

export default SuiProvider;
