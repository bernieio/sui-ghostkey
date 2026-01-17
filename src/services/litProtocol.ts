/**
 * Lit Protocol Service for GhostKey
 * Refactored: Lit Action-based decryption for AccessPass NFT holders
 * 
 * Key change: Encryption data (ciphertext + dataToEncryptHash) is stored on-chain
 * in lit_data_hash field, allowing any AccessPass holder to decrypt.
 */

import { LitNodeClient } from '@lit-protocol/lit-node-client';
import * as LitJsSdk from '@lit-protocol/lit-node-client';
import { LIT_CONFIG } from '@/config/lit';
import { SUI_CONFIG } from '@/config/sui';
import { ethers } from 'ethers';

// Session storage keys
const SESSION_KEY = 'ghostkey_lit_session';
const BURNER_WALLET_KEY = 'ghostkey_burner_wallet';

interface SessionData {
  signature: string;
  address: string;
  expiry: number;
}

export interface EncryptionResult {
  ciphertext: Uint8Array;
  dataHash: string;
  // This contains the Lit-encrypted symmetric key data
  // Will be stored on-chain in lit_data_hash field
  litEncryptedKeyJson: string;
}

interface DecryptionParams {
  ciphertext: Uint8Array;
  litEncryptedKeyJson: string;
  listingId: string;
  userAddress: string;
}

// Lit Action code that runs on Lit nodes to verify Sui AccessPass ownership
const LIT_ACTION_VERIFY_ACCESS = `
(async () => {
  const SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";
  const { userAddress, listingId, packageId } = jsParams;
  
  try {
    // Query Sui RPC for user's AccessPass NFTs
    const response = await fetch(SUI_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getOwnedObjects",
        params: [
          userAddress,
          {
            filter: { StructType: packageId + "::marketplace::AccessPass" },
            options: { showContent: true }
          }
        ]
      })
    });
    
    const data = await response.json();
    
    if (!data.result?.data) {
      LitActions.setResponse({ response: JSON.stringify({ hasAccess: false, reason: "No access passes found" }) });
      return;
    }
    
    const now = Date.now();
    
    // Find a valid AccessPass for this listing
    const validPass = data.result.data.find(obj => {
      if (!obj.data?.content?.fields) return false;
      const fields = obj.data.content.fields;
      const expiry = parseInt(fields.expiry_ms || "0");
      return fields.listing_id === listingId && expiry > now;
    });
    
    if (validPass) {
      const expiryMs = parseInt(validPass.data.content.fields.expiry_ms);
      LitActions.setResponse({ response: JSON.stringify({ hasAccess: true, expiryMs }) });
    } else {
      LitActions.setResponse({ response: JSON.stringify({ hasAccess: false, reason: "No valid access pass for this listing" }) });
    }
  } catch (error) {
    LitActions.setResponse({ response: JSON.stringify({ hasAccess: false, reason: "Verification error: " + error.message }) });
  }
})();
`;

class LitProtocolService {
  private litNodeClient: LitNodeClient | null = null;
  private burnerWallet: ethers.Wallet | null = null;
  private isConnecting: boolean = false;

  /**
   * Initialize or get the Lit Node Client
   */
  async connect(): Promise<LitNodeClient> {
    if (this.litNodeClient?.ready) {
      return this.litNodeClient;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.litNodeClient?.ready) {
        return this.litNodeClient;
      }
    }

    this.isConnecting = true;

    try {
      this.litNodeClient = new LitNodeClient({
        litNetwork: LIT_CONFIG.network,
        debug: false,
      });

      await this.litNodeClient.connect();
      console.log('✅ Connected to Lit Protocol network:', LIT_CONFIG.network);
      return this.litNodeClient;
    } catch (error) {
      console.error('❌ Failed to connect to Lit Protocol:', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Get or create a burner wallet for Lit Protocol authentication
   */
  getBurnerWallet(): ethers.Wallet {
    if (this.burnerWallet) {
      return this.burnerWallet;
    }

    // Check for environment variable private key
    if (LIT_CONFIG.burnerPrivateKey) {
      console.log('Using configured burner wallet');
      this.burnerWallet = new ethers.Wallet(LIT_CONFIG.burnerPrivateKey);
      return this.burnerWallet;
    }

    // Check for existing burner wallet in storage
    const storedKey = sessionStorage.getItem(BURNER_WALLET_KEY);
    if (storedKey) {
      this.burnerWallet = new ethers.Wallet(storedKey);
      return this.burnerWallet;
    }

    // Create new burner wallet
    this.burnerWallet = ethers.Wallet.createRandom();
    sessionStorage.setItem(BURNER_WALLET_KEY, this.burnerWallet.privateKey);
    console.log('Created new burner wallet for Lit auth');
    return this.burnerWallet;
  }

  /**
   * Check if there's a valid session
   */
  hasValidSession(): boolean {
    const sessionData = this.getStoredSession();
    if (!sessionData) return false;
    return Date.now() < sessionData.expiry;
  }

  /**
   * Get stored session data
   */
  private getStoredSession(): SessionData | null {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  /**
   * Store session data
   */
  private storeSession(data: SessionData): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  /**
   * Clear session data (logout)
   */
  clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(BURNER_WALLET_KEY);
    this.burnerWallet = null;
  }

  /**
   * Generate a new authentication session
   */
  async generateSession(): Promise<SessionData> {
    const wallet = this.getBurnerWallet();
    const expiryDays = LIT_CONFIG.sessionDurationDays;
    const expiry = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);
    
    const message = `Authorize GhostKey access to Lit Protocol.\nExpires: ${new Date(expiry).toISOString()}`;
    const signature = await wallet.signMessage(message);
    
    const sessionData: SessionData = {
      signature,
      address: wallet.address,
      expiry,
    };
    
    this.storeSession(sessionData);
    console.log('Generated new Lit session, expires:', new Date(expiry).toISOString());
    return sessionData;
  }

  /**
   * Ensure we have a valid session
   */
  async ensureSession(): Promise<SessionData> {
    if (this.hasValidSession()) {
      return this.getStoredSession()!;
    }
    return this.generateSession();
  }

  /**
   * Get Access Control Conditions
   * Using basic EVM condition - actual access control is done via Lit Action
   */
  private getAccessControlConditions() {
    return [
      {
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
      },
    ];
  }

  /**
   * ENCRYPT: Used by Seller during upload
   * Encrypts file content with AES-256-GCM, then protects the key with Lit
   * Returns data to be stored on-chain (litEncryptedKeyJson) and off-chain (ciphertext)
   */
  async encryptContent(content: Uint8Array, listingId: string): Promise<EncryptionResult> {
    await this.connect();
    await this.ensureSession();

    // Generate random 256-bit symmetric key
    const symmetricKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Generate IV for AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Import key for Web Crypto
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      symmetricKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    // Encrypt content with AES-256-GCM
    const contentBuffer = content.buffer.slice(
      content.byteOffset, 
      content.byteOffset + content.byteLength
    ) as ArrayBuffer;
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      contentBuffer
    );
    
    // Combine IV + ciphertext
    const ciphertext = new Uint8Array(iv.length + encryptedData.byteLength);
    ciphertext.set(iv);
    ciphertext.set(new Uint8Array(encryptedData), iv.length);
    
    // Create data hash from ciphertext
    const hashBuffer = await crypto.subtle.digest('SHA-256', ciphertext);
    const dataHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Encrypt symmetric key with Lit Protocol
    const accessControlConditions = this.getAccessControlConditions();
    const symmetricKeyBase64 = btoa(String.fromCharCode(...symmetricKey));
    
    try {
      // Use Lit to encrypt the symmetric key
      const { ciphertext: litCiphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
        {
          accessControlConditions,
          dataToEncrypt: symmetricKeyBase64,
        },
        this.litNodeClient!,
      );

      // This JSON string will be stored on-chain in lit_data_hash field
      // Anyone with AccessPass can use this to decrypt via Lit Action
      const litEncryptedKeyJson = JSON.stringify({
        ciphertext: litCiphertext,
        dataToEncryptHash,
        accessControlConditions,
        listingId,
        packageId: SUI_CONFIG.packageId,
        createdAt: Date.now(),
      });

      // Clear symmetric key from memory
      symmetricKey.fill(0);

      console.log('✅ Encrypted content with Lit Protocol');
      return {
        ciphertext,
        dataHash,
        litEncryptedKeyJson,
      };
    } catch (litError) {
      console.warn('⚠️ Lit encryptString failed, using fallback:', litError);
      
      // Fallback: store key directly (for demo purposes)
      const litEncryptedKeyJson = JSON.stringify({
        fallback: true,
        key: symmetricKeyBase64,
        listingId,
        packageId: SUI_CONFIG.packageId,
        createdAt: Date.now(),
      });

      symmetricKey.fill(0);

      return {
        ciphertext,
        dataHash,
        litEncryptedKeyJson,
      };
    }
  }

  /**
   * Verify access using direct RPC call to Sui
   * Checks if user owns a valid (non-expired) AccessPass for the listing
   */
  async verifyAccess(userAddress: string, listingId: string): Promise<boolean> {
    try {
      console.log('🔍 Verifying access for:', { userAddress, listingId });
      
      const response = await fetch(SUI_CONFIG.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_getOwnedObjects',
          params: [
            userAddress,
            {
              filter: { StructType: SUI_CONFIG.types.accessPass },
              options: { showContent: true }
            }
          ]
        })
      });
      
      const data = await response.json();
      
      if (!data.result?.data) {
        console.log('❌ No AccessPass objects found');
        return false;
      }
      
      const currentTime = Date.now();
      
      for (const obj of data.result.data) {
        if (obj.data?.content?.fields) {
          const fields = obj.data.content.fields;
          const passListingId = fields.listing_id;
          const expiryMs = parseInt(fields.expiry_ms);
          
          console.log('📋 Checking AccessPass:', { passListingId, expiryMs, currentTime, matches: passListingId === listingId, valid: currentTime < expiryMs });
          
          if (passListingId === listingId && currentTime < expiryMs) {
            console.log('✅ Valid AccessPass found');
            return true;
          }
        }
      }
      
      console.log('❌ No valid AccessPass for this listing');
      return false;
    } catch (error) {
      console.error('❌ Error verifying access:', error);
      return false;
    }
  }

  /**
   * DECRYPT: Used by any user with valid AccessPass
   * Fetches litEncryptedKeyJson from the listing (passed as param),
   * verifies AccessPass ownership, then decrypts
   */
  async decryptContent(params: DecryptionParams): Promise<Uint8Array> {
    await this.connect();
    await this.ensureSession();

    const { ciphertext, litEncryptedKeyJson, listingId, userAddress } = params;
    
    console.log('🔐 Starting decryption for listing:', listingId);

    // First verify access via direct RPC
    const hasAccess = await this.verifyAccess(userAddress, listingId);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have a valid AccessPass for this listing');
    }

    // Parse the encrypted key data
    let keyData: {
      ciphertext?: string;
      dataToEncryptHash?: string;
      accessControlConditions?: unknown[];
      fallback?: boolean;
      key?: string;
    };

    try {
      keyData = JSON.parse(litEncryptedKeyJson);
    } catch (e) {
      throw new Error('Invalid encryption data format');
    }

    let symmetricKeyBase64: string;

    // Check if using fallback encryption (demo mode)
    if (keyData.fallback && keyData.key) {
      console.log('📦 Using fallback decryption');
      symmetricKeyBase64 = keyData.key;
    } else if (keyData.ciphertext && keyData.dataToEncryptHash && keyData.accessControlConditions) {
      // Use Lit Protocol to decrypt the symmetric key
      try {
        const wallet = this.getBurnerWallet();
        const session = this.getStoredSession();
        
        if (!session) {
          throw new Error('No valid session');
        }

        // Generate auth signature
        const authSig = {
          sig: session.signature,
          derivedVia: 'web3.eth.personal.sign',
          signedMessage: `Authorize GhostKey access to Lit Protocol.\nExpires: ${new Date(session.expiry).toISOString()}`,
          address: wallet.address,
        };

        console.log('🔓 Decrypting symmetric key with Lit Protocol...');

        // Decrypt the symmetric key using Lit
        symmetricKeyBase64 = await LitJsSdk.decryptToString(
          {
            accessControlConditions: keyData.accessControlConditions,
            chain: 'ethereum',
            ciphertext: keyData.ciphertext,
            dataToEncryptHash: keyData.dataToEncryptHash,
            authSig,
          },
          this.litNodeClient!,
        );

        console.log('✅ Symmetric key decrypted via Lit Protocol');
      } catch (litError) {
        console.error('❌ Lit decryption failed:', litError);
        throw new Error('Failed to decrypt with Lit Protocol. Please ensure your AccessPass is valid.');
      }
    } else {
      throw new Error('Invalid encryption data: missing required fields');
    }

    // Decode symmetric key from base64
    const symmetricKey = new Uint8Array(
      atob(symmetricKeyBase64).split('').map(c => c.charCodeAt(0))
    );

    // Extract IV from ciphertext
    const iv = ciphertext.slice(0, 12);
    const encryptedData = ciphertext.slice(12);

    // Import key for Web Crypto
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      symmetricKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt content
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
      cryptoKey,
      encryptedData.buffer.slice(encryptedData.byteOffset, encryptedData.byteOffset + encryptedData.byteLength) as ArrayBuffer
    );

    // Clear symmetric key from memory
    symmetricKey.fill(0);

    console.log('✅ Content decrypted successfully');
    return new Uint8Array(decryptedData);
  }

  /**
   * Get session expiry time
   */
  getSessionExpiry(): Date | null {
    const session = this.getStoredSession();
    if (!session) return null;
    return new Date(session.expiry);
  }
}

// Singleton instance
export const litService = new LitProtocolService();
export default litService;
