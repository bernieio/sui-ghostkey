/**
 * Walrus Storage Configuration for GhostKey
 * Decentralized storage on Sui
 */

// Cấu hình danh sách Node Walrus theo tầng ưu tiên
export const WALRUS_CONFIG = {
  PUBLISHERS: [
    "https://publisher.walrus-testnet.walrus.space", // Tầng 1 (Gốc)
    "https://sui-walrus-testnet-publisher.bwarelabs.com", // Tầng 2
    "https://publisher.testnet.walrus.atalma.io", // Tầng 3
    "https://walrus-testnet.blockscope.net:11444", // Tầng 4
    "https://walrus-testnet-publisher.chainbase.online", // Tầng 5
  ],
  AGGREGATORS: [
    "https://aggregator.walrus-testnet.walrus.space", // Tầng 1 (Gốc)
    "https://sui-walrus-tn-aggregator.bwarelabs.com", // Tầng 2
    "https://aggregator.testnet.walrus.atalma.io", // Tầng 3
    "https://walrus-testnet.blockscope.net", // Tầng 4
    "https://walrus-testnet-aggregator.brightlystake.com", // Tầng 5
  ],
};

/**
 * Get the URL to retrieve a blob from Walrus
 */
export const getWalrusBlobUrl = (blobId: string): string => {
  // Correct aggregator endpoint for blob retrieval
  return `${WALRUS_CONFIG.aggregatorUrl}/v1/blobs/${blobId}`;
};

export default WALRUS_CONFIG;
