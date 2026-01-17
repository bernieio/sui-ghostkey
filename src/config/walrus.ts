/**
 * Walrus Storage Configuration for GhostKey
 * Decentralized storage on Sui
 */

export const WALRUS_CONFIG = {
  // Aggregator endpoints for testnet
  aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
  publisherUrl: 'https://publisher.walrus-testnet.walrus.space',
  
  // Storage configuration
  maxFileSizeMB: 100,
  supportedMimeTypes: [
    'text/plain',
    'text/markdown',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
  ],
  
  // Epochs for storage duration
  defaultEpochs: 5, // ~5 days on testnet
} as const;

/**
 * Get the URL to retrieve a blob from Walrus
 */
export const getWalrusBlobUrl = (blobId: string): string => {
  // Correct aggregator endpoint for blob retrieval
  return `${WALRUS_CONFIG.aggregatorUrl}/v1/blobs/${blobId}`;
};

export default WALRUS_CONFIG;
