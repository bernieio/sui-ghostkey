/**
 * Sui Blockchain Configuration for GhostKey
 * Package ID from Published.toml - DO NOT MODIFY
 */

export const SUI_CONFIG = {
  network: 'testnet' as const,
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  fallbackRpcUrls: [
    'https://sui-testnet.public.blastapi.io',
    'https://testnet.suiet.app',
    'https://sui-testnet-rpc.bartestnet.com',
  ],
  
  // HTTP-only mode: Disable WebSocket subscriptions
  // Sui testnet public nodes have limited WebSocket support
  // Use React Query polling instead for data freshness
  enableWebsocketSubscriptions: false,
  pollingIntervalMs: 30_000, // 30 seconds
  
  // Smart contract configuration from Published.toml
  packageId: '0x2aa4851e0a844e82880968c26c559e637ec475ffa9375318dae1f3a330d3075c',
  moduleName: 'marketplace',
  
  // Clock object address (shared on Sui)
  clockObjectId: '0x6',
  
  // Contract constants (from marketplace.move)
  constants: {
    MAX_PRICE: 1_000_000_000_000_000n, // 1 million SUI in MIST
    MAX_RENTAL_HOURS: 8760n, // 1 year
    MIN_BASE_PRICE: 1000n, // 0.000001 SUI
    MAX_SLOPE: 114_155_251_141_552n,
    MIN_WITHDRAWAL: 1_000_000n, // 0.001 SUI
    MAX_ACTIVE_RENTALS: 1_000_000n,
    MAX_BATCH_SIZE: 50n,
    DECAY_COOLDOWN_MS: 86_400_000n, // 24 hours
    MAX_DECAY_PER_PERIOD: 100n,
  },
  
  // Object type identifiers
  types: {
    listing: `0x2aa4851e0a844e82880968c26c559e637ec475ffa9375318dae1f3a330d3075c::marketplace::Listing`,
    accessPass: `0x2aa4851e0a844e82880968c26c559e637ec475ffa9375318dae1f3a330d3075c::marketplace::AccessPass`,
  },
} as const;

// Helper to convert SUI to MIST
export const suiToMist = (sui: number): bigint => BigInt(Math.floor(sui * 1_000_000_000));

// Helper to convert MIST to SUI
export const mistToSui = (mist: bigint): number => Number(mist) / 1_000_000_000;

// Helper to format MIST as SUI string
export const formatSui = (mist: bigint, decimals: number = 4): string => {
  const sui = mistToSui(mist);
  return sui.toFixed(decimals);
};

// Helper to truncate address
export const truncateAddress = (address: string, chars: number = 6): string => {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};
