/**
 * Lit Protocol Service for GhostKey
 * FIXED: SIWE Compliant AuthSig Generation
 */

import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LIT_CONFIG } from "@/config/lit";
import { SUI_CONFIG } from "@/config/sui";
import { ethers } from "ethers";

// Session storage keys
const SESSION_KEY = "ghostkey_lit_session";
const BURNER_WALLET_KEY = "ghostkey_burner_wallet";

// Cập nhật interface để lưu luôn message gốc đã ký
interface SessionData {
  signature: string;
  address: string;
  expiry: number;
  signedMessage: string; // <--- QUAN TRỌNG: Lưu message gốc để gửi lại cho Lit
}

export interface EncryptionResult {
  ciphertext: string;
  dataToEncryptHash: string;
}

// Lit Action code giữ nguyên
const LIT_ACTION_VERIFY_ACCESS = `
(async () => {
  const SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";
  const { userAddress, listingId, packageId } = jsParams;
  
  try {
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

  async connect(): Promise<LitNodeClient> {
    if (this.litNodeClient?.ready) return this.litNodeClient;

    if (this.isConnecting) {
      while (this.isConnecting) await new Promise((r) => setTimeout(r, 100));
      if (this.litNodeClient?.ready) return this.litNodeClient;
    }

    this.isConnecting = true;
    try {
      this.litNodeClient = new LitNodeClient({
        litNetwork: LIT_CONFIG.network,
        debug: false,
      });
      await this.litNodeClient.connect();
      console.log("✅ Connected to Lit Protocol network:", LIT_CONFIG.network);
      return this.litNodeClient;
    } catch (error) {
      console.error("❌ Failed to connect to Lit Protocol:", error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  getBurnerWallet(): ethers.Wallet {
    if (this.burnerWallet) return this.burnerWallet;
    if (LIT_CONFIG.burnerPrivateKey) {
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
    return this.burnerWallet;
  }

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

  // --- FIX: GENERATE STANDARD SIWE MESSAGE ---
  async generateSession(): Promise<SessionData> {
    const wallet = this.getBurnerWallet();
    const expiryDays = LIT_CONFIG.sessionDurationDays || 7;
    const expiration = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    const issuedAt = new Date().toISOString();

    // Construct valid SIWE message
    const domain = window.location.host || "localhost";
    const origin = window.location.origin || "http://localhost:5173";
    const statement = "Authorize GhostKey access to Lit Protocol.";
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const message = `${domain} wants you to sign in with your Ethereum account:
${wallet.address}

${statement}

URI: ${origin}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiration}`;

    const signature = await wallet.signMessage(message);

    const sessionData: SessionData = {
      signature,
      address: wallet.address,
      expiry: Date.parse(expiration),
      signedMessage: message, // Store exact message string
    };

    this.storeSession(sessionData);
    console.log("✅ Generated new Lit session (SIWE compliant)");
    return sessionData;
  }

  async ensureSession(): Promise<SessionData> {
    if (this.hasValidSession()) {
      return this.getStoredSession()!;
    }
    return this.generateSession();
  }

  private getAccessControlConditions() {
    return [
      {
        conditionType: "evmBasic",
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: "=",
          value: ":userAddress",
        },
      },
    ];
  }

  async encryptFile(file: File, listingId: string, packageId: string, userAddress: string): Promise<EncryptionResult> {
    await this.connect();
    const session = await this.ensureSession();

    // FIX: Use stored session message
    const authSig = {
      sig: session.signature,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: session.signedMessage, // Must match signature exactly
      address: session.address,
    };

    const accessControlConditions = this.getAccessControlConditions();
    const fileContent = await file.text();

    console.log("🔐 Encrypting file...");

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt: fileContent,
        authSig, // Pass authSig explicitly in v6
        chain: "ethereum",
      },
      this.litNodeClient!,
    );

    return { ciphertext, dataToEncryptHash };
  }

  async decryptFile(
    ciphertext: string,
    dataToEncryptHash: string,
    listingId: string,
    packageId: string,
    userAddress: string,
  ): Promise<string> {
    await this.connect();
    const session = await this.ensureSession(); // Ensure valid session

    // FIX: Use stored session message
    const authSig = {
      sig: session.signature,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: session.signedMessage,
      address: session.address,
    };

    // Inject Lit Action
    const litActionCode = LIT_ACTION_VERIFY_ACCESS;
    const jsParams = {
      userAddress,
      listingId,
      packageId,
    };

    console.log("🔓 Decrypting with Lit Protocol...");

    try {
      const decryptedString = await LitJsSdk.decryptToString(
        {
          accessControlConditions: this.getAccessControlConditions(),
          chain: "ethereum",
          ciphertext,
          dataToEncryptHash,
          authSig,
          litActionCode, // Pass action code
          jsParams, // Pass params
        },
        this.litNodeClient!,
      );

      console.log("✅ Decryption successful");
      return decryptedString;
    } catch (error: any) {
      console.error("❌ Lit decryption failed:", error);
      // Clean error message
      if (error.message?.includes("NodeInvalidAuthSig")) {
        // Clear session to force regenerate next time
        this.clearSession();
        throw new Error("Session expired or invalid. Please refresh the page.");
      }
      throw error;
    }
  }
}

export const litService = new LitProtocolService();
