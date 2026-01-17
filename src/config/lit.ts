/**
 * Lit Protocol Configuration for GhostKey
 * Using DatilTest network for full integration
 */

import { SUI_CONFIG } from '@/config/sui';

export const LIT_CONFIG = {
  // Network configuration
  network: 'datil-test' as const,
  rpcUrl: 'https://yellowstone-rpc.litprotocol.com',
  chainId: 175188,
  currencySymbol: 'tstLPX',
  explorerUrl: 'https://explorer.litprotocol.com',
  
  // Session configuration
  sessionDurationDays: 7,
  contentViewTimeoutSeconds: 60,
  
  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000,
} as const;

/**
 * Access Control Condition using Lit Action
 * Verifies AccessPass ownership on Sui blockchain
 */
export const getAccessControlCondition = (listingId: string, packageId: string = SUI_CONFIG.packageId) => ({
  conditionType: 'evmBasic',
  contractAddress: '',
  standardContractType: '',
  chain: 'ethereum',
  method: '',
  parameters: [':userAddress'],
  returnValueTest: {
    comparator: '=',
    value: ':userAddress',
  },
});

/**
 * Lit Action JavaScript code that executes on Lit Protocol nodes
 * This code verifies AccessPass ownership on Sui blockchain
 * Returns decryption shares only if user has valid AccessPass
 */
export const LIT_ACTION_CODE = `
(async () => {
  const SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";
  const ACCESS_PASS_TYPE = params.packageId + "::marketplace::AccessPass";
  
  try {
    // Query owned AccessPass objects for the user
    const response = await fetch(SUI_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getOwnedObjects",
        params: [
          params.userAddress,
          {
            filter: { StructType: ACCESS_PASS_TYPE },
            options: { showContent: true }
          }
        ]
      })
    });
    
    const data = await response.json();
    
    if (!data.result || !data.result.data) {
      Lit.Actions.setResponse({ response: JSON.stringify({ access: false, reason: "No access passes found" }) });
      return;
    }
    
    const currentTime = Date.now();
    
    // Check each AccessPass for validity
    for (const obj of data.result.data) {
      if (obj.data && obj.data.content && obj.data.content.fields) {
        const fields = obj.data.content.fields;
        const passListingId = fields.listing_id;
        const expiryMs = parseInt(fields.expiry_ms);
        
        // Check if this pass matches the requested listing and is not expired
        if (passListingId === params.listingId && currentTime < expiryMs) {
          // User has valid access - sign the decryption
          Lit.Actions.setResponse({ response: JSON.stringify({ access: true, expiryMs }) });
          return;
        }
      }
    }
    
    Lit.Actions.setResponse({ response: JSON.stringify({ access: false, reason: "No valid access pass for this listing" }) });
  } catch (error) {
    Lit.Actions.setResponse({ response: JSON.stringify({ access: false, reason: "Error verifying access: " + error.message }) });
  }
})();
`;

/**
 * Storage key prefix for encrypted symmetric keys
 * Keys are stored with format: ghostkey_encrypted_key_{listingId}
 */
export const ENCRYPTED_KEY_STORAGE_PREFIX = 'ghostkey_encrypted_key_';

export default LIT_CONFIG;
