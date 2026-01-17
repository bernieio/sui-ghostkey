export const WALRUS_CONFIG = {
  // Danh sách Node (Failover)
  PUBLISHERS: [
    "https://publisher.walrus-testnet.walrus.space",
    "https://sui-walrus-testnet-publisher.bwarelabs.com",
    "https://publisher.testnet.walrus.atalma.io",
    "https://walrus-testnet.blockscope.net:11444",
    "https://walrus-testnet-publisher.chainbase.online",
  ],
  AGGREGATORS: [
    "https://aggregator.walrus-testnet.walrus.space",
    "https://sui-walrus-tn-aggregator.bwarelabs.com",
    "https://aggregator.testnet.walrus.atalma.io",
    "https://walrus-testnet.blockscope.net",
    "https://walrus-testnet-aggregator.brightlystake.com",
  ],

  // Các tham số cấu hình mặc định (Fix lỗi TS2339)
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
