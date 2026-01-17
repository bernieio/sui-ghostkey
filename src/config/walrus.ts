export const WALRUS_CONFIG = {
  // Danh sách Node Publisher (Dùng cho Server-side Proxy)
  PUBLISHERS: [
    "https://publisher.walrus-testnet.walrus.space",
    "https://sui-walrus-testnet-publisher.bwarelabs.com",
    "https://publisher.testnet.walrus.atalma.io",
    "https://walrus-testnet.blockscope.net:11444",
    "https://walrus-testnet-publisher.chainbase.online",
  ],
  // Danh sách Aggregator (Dùng cho Client-side Download)
  AGGREGATORS: [
    "https://aggregator.walrus-testnet.walrus.space",
    "https://sui-walrus-tn-aggregator.bwarelabs.com",
    "https://aggregator.testnet.walrus.atalma.io",
    "https://walrus-testnet.blockscope.net",
    "https://walrus-testnet-aggregator.brightlystake.com",
  ],

  DEFAULT_EPOCHS: 5,
  MAX_FILE_SIZE_MB: 10,
  SUPPORTED_MIME_TYPES: [
    "text/plain",
    "text/markdown",
    "application/json",
    "image/png",
    "image/jpeg",
    "image/gif",
    "application/pdf",
  ],
};
