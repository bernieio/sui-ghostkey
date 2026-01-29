/**
 * Lit Protocol Service for GhostKey
 * Refactored: Walrus stores ciphertext, Sui stores dataToEncryptHash
 * 
 * Architecture:
 * - Seller encrypts file with Lit Protocol
 * - Ciphertext (large) -> stored on Walrus
 * - dataToEncryptHash (small) -> stored on Sui (lit_data_hash field)
 * - Buyer fetches ciphertext from Walrus, hash from Sui, then decrypts via Lit
 */

import * as LitJsSdk from '@lit-protocol/lit-node-client';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
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
  ciphertext: string;         // Base64 encoded - stored on Walrus
  dataToEncryptHash: string;  // Stored on Sui (lit_data_hash)
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

    if (LIT_CONFIG.burnerPrivateKey) {
      console.log('Using configured burner wallet');
      this.burnerWallet = new ethers.Wallet(LIT_CONFIG.burnerPrivateKey);
      return this.burnerWallet;
    }

    const storedKey = sessionStorage.getItem(BURNER_WALLET_KEY);
    if (storedKey) {
      this.burnerWallet = new ethers.Wallet(storedKey);
      return this.burnerWallet;
    }

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

  private getStoredSession(): SessionData | null {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  private storeSession(data: SessionData): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(BURNER_WALLET_KEY);
    this.burnerWallet = null;
  }

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

  async ensureSession(): Promise<SessionData> {
    if (this.hasValidSession()) {
      return this.getStoredSession()!;
    }
    return this.generateSession();
  }

  /**
   * Get session expiry date (for UI display)
   */
  getSessionExpiry(): Date | null {
    const session = this.getStoredSession();
    if (!session) return null;
    return new Date(session.expiry);
  }

  /**
   * Get Access Control Conditions for Lit Protocol
   * Simple EVM condition - actual access check is via verifyAccess() before decrypt
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
   * ENCRYPT FILE (Used by Seller during upload)
   * 
   * Returns:
   * - ciphertext: Base64 string to upload to Walrus
   * - dataToEncryptHash: Hash to store on Sui (lit_data_hash field)
   */
  async encryptFile(
    file: File,
    listingId: string,
    packageId: string,
    userAddress: string
  ): Promise<EncryptionResult> {
    await this.connect();
    await this.ensureSession();
    
    const wallet = this.getBurnerWallet();
    const session = this.getStoredSession()!;
    
    const authSig = {
      sig: session.signature,
      derivedVia: 'web3.eth.personal.sign',
      signedMessage: `Authorize GhostKey access to Lit Protocol.\nExpires: ${new Date(session.expiry).toISOString()}`,
      address: wallet.address,
    };
    
    const accessControlConditions = this.getAccessControlConditions();
    
    // Read file content as text
    const fileContent = await file.text();
    
    console.log('🔐 Encrypting file with Lit Protocol...', { listingId, fileSize: fileContent.length });
    
    // Encrypt using Lit Protocol
    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt: fileContent,
      },
      this.litNodeClient!,
    );
    
    console.log('✅ File encrypted successfully');
    console.log('📦 Ciphertext length:', ciphertext.length);
    console.log('📦 dataToEncryptHash:', dataToEncryptHash);
    
    // Return separately:
    // - ciphertext -> upload to Walrus
    // - dataToEncryptHash -> store on Sui (lit_data_hash)
    return {
      ciphertext,
      dataToEncryptHash,
    };
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
   * DECRYPT FILE (Used by Buyer to view content)
   * 
   * Parameters:
   * - ciphertext: Base64 string fetched from Walrus
   * - dataToEncryptHash: Hash fetched from Sui (lit_data_hash field)
   * - listingId: ID of the listing
   * - packageId: Sui package ID
   * - userAddress: Buyer's wallet address
   */
  async decryptFile(
    ciphertext: string,        // From Walrus
    dataToEncryptHash: string, // From Sui (lit_data_hash)
    listingId: string,
    packageId: string,
    userAddress: string
  ): Promise<string> {
    await this.connect();
    await this.ensureSession();
    
    console.log('🔐 Starting decryption...', {
      ciphertextLength: ciphertext.length,
      hash: dataToEncryptHash,
      listingId,
      userAddress,
    });

    // First verify access via direct RPC
    const hasAccess = await this.verifyAccess(userAddress, listingId);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have a valid AccessPass for this listing');
    }
    
    const wallet = this.getBurnerWallet();
    const session = this.getStoredSession()!;
    
    const authSig = {
      sig: session.signature,
      derivedVia: 'web3.eth.personal.sign',
      signedMessage: `Authorize GhostKey access to Lit Protocol.\nExpires: ${new Date(session.expiry).toISOString()}`,
      address: wallet.address,
    };
    
    const accessControlConditions = this.getAccessControlConditions();
    
    try {
      console.log('🔓 Decrypting with Lit Protocol...');
      
      const decryptedString = await LitJsSdk.decryptToString(
        {
          accessControlConditions,
          chain: 'ethereum',
          ciphertext,
          dataToEncryptHash,
          authSig,
        },
        this.litNodeClient!,
      );
      
      console.log('✅ Decryption successful, content length:', decryptedString.length);
      return decryptedString;
    } catch (error: unknown) {
      console.error('❌ Lit decryption failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Decryption failed: ${message}`);
    }
  }
}

export const litService = new LitProtocolService();
