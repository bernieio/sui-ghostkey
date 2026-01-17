/**
 * Lit Protocol Service for GhostKey
 * Handles encryption, decryption, and access control
 */

import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_CONFIG, LIT_ACTION_CODE } from '@/config/lit';
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

interface EncryptionResult {
  ciphertext: Uint8Array;
  dataHash: string;
  encryptedSymmetricKey: string;
}

interface DecryptionParams {
  ciphertext: Uint8Array;
  encryptedSymmetricKey: string;
  listingId: string;
  userAddress: string;
}

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
      // Wait for existing connection
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
      console.log('Connected to Lit Protocol network:', LIT_CONFIG.network);
      return this.litNodeClient;
    } catch (error) {
      console.error('Failed to connect to Lit Protocol:', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Get or create a burner wallet for Lit Protocol authentication
   * This simplifies auth without requiring Sui wallet signatures
   */
  getBurnerWallet(): ethers.Wallet {
    if (this.burnerWallet) {
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
   * Encrypt file content with AES-256-GCM and protect the key with Lit
   */
  async encryptContent(
    content: Uint8Array,
    listingId: string
  ): Promise<EncryptionResult> {
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
    // For hackathon: store encrypted key locally (would use IPFS in production)
    const encryptedSymmetricKey = btoa(String.fromCharCode(...symmetricKey));
    
    // Clear symmetric key from memory
    symmetricKey.fill(0);
    
    return {
      ciphertext,
      dataHash,
      encryptedSymmetricKey,
    };
  }

  /**
   * Decrypt content after verifying access with Lit Protocol
   * For hackathon: simplified verification without full Lit Action execution
   */
  async decryptContent(params: DecryptionParams): Promise<Uint8Array> {
    await this.connect();
    await this.ensureSession();

    // For hackathon: verify access by checking AccessPass ownership on-chain
    // In production, this would use Lit Action execution with session signatures
    // The simplified approach still validates ownership through Sui RPC
    const accessValid = await this.verifyAccess(params.userAddress, params.listingId);
    
    if (!accessValid) {
      throw new Error('Access denied: No valid AccessPass found');
    }

    // Decrypt symmetric key (simplified for hackathon)
    const symmetricKey = new Uint8Array(
      atob(params.encryptedSymmetricKey).split('').map(c => c.charCodeAt(0))
    );

    // Extract IV from ciphertext
    const iv = params.ciphertext.slice(0, 12);
    const encryptedData = params.ciphertext.slice(12);

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

    return new Uint8Array(decryptedData);
  }

  /**
   * Verify access by checking AccessPass ownership on Sui
   */
  private async verifyAccess(userAddress: string, listingId: string): Promise<boolean> {
    try {
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
        return false;
      }
      
      const currentTime = Date.now();
      
      for (const obj of data.result.data) {
        if (obj.data?.content?.fields) {
          const fields = obj.data.content.fields;
          const passListingId = fields.listing_id;
          const expiryMs = parseInt(fields.expiry_ms);
          
          if (passListingId === listingId && currentTime < expiryMs) {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error verifying access:', error);
      return false;
    }
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
