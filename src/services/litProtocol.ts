import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LIT_CONFIG } from "@/config/lit";
import { ethers } from "ethers";

const SESSION_KEY = "ghostkey_lit_session";
const BURNER_WALLET_KEY = "ghostkey_burner_wallet";

export interface SessionData {
  signature: string;
  address: string;
  expiry: number;
  signedMessage: string;
}

export interface EncryptionResult {
  ciphertext: string; // HEX String
  dataToEncryptHash: string;
}

// --- HELPERS ---

/**
 * Chuyển Base64 sang Hex an toàn
 */
function base64ToHex(base64: string): string {
  try {
    const raw = atob(base64);
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      const hex = raw.charCodeAt(i).toString(16).padStart(2, "0");
      result += hex;
    }
    return result;
  } catch (e) {
    console.error("Base64 to Hex failed:", e);
    return base64;
  }
}

/**
 * Convert File to Data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// LIT ACTION CODE (Giữ nguyên logic verify)
const LIT_ACTION_VERIFY_ACCESS = `
(async () => {
  const checkSuiAccess = async () => {
    const { userAddress, listingId, packageId } = jsParams;
    const rpcUrl = "https://fullnode.testnet.sui.io:443";
    
    const body = JSON.stringify({
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
    });

    try {
      const resp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      const res = await resp.json();
      if (!res.result || !res.result.data) return false;

      const objects = res.result.data;
      const now = Date.now();

      const validPass = objects.find(obj => {
        const fields = obj.data.content.fields;
        const expiry = parseInt(fields.expiry_ms);
        return fields.listing_id === listingId && expiry > now;
      });
      
      return !!validPass;
    } catch (e) { return false; }
  };

  const hasAccess = await checkSuiAccess();
  LitActions.setConditions({ conditions: [{ operator: "always", returnValue: hasAccess }], permanent: false });
  LitActions.setResponse({ response: JSON.stringify({ hasAccess }) });
})();
`;

class LitProtocolService {
  public litNodeClient: LitNodeClient | null = null;
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
      return this.litNodeClient;
    } finally {
      this.isConnecting = false;
    }
  }

  private getUnifiedAccessControlConditions() {
    return [
      {
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":userAddress"],
        returnValueTest: { comparator: "=", value: ":userAddress" },
      },
    ];
  }

  // --- SESSION MANAGE (Giữ nguyên logic SIWE chuẩn) ---
  private getBurnerWallet(): ethers.Wallet {
    if (this.burnerWallet) return this.burnerWallet;
    const storedKey = localStorage.getItem(BURNER_WALLET_KEY);
    if (storedKey) return (this.burnerWallet = new ethers.Wallet(storedKey));
    this.burnerWallet = ethers.Wallet.createRandom();
    localStorage.setItem(BURNER_WALLET_KEY, this.burnerWallet.privateKey);
    return this.burnerWallet;
  }

  private getStoredSession(): SessionData | null {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      return stored && Date.now() < JSON.parse(stored).expiry ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private async createSessionInternal(): Promise<SessionData> {
    const wallet = this.getBurnerWallet();
    const address = await wallet.getAddress();
    const expiryDays = 7;
    const expiration = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    const issuedAt = new Date().toISOString();

    const domain = window.location.host || "localhost";
    const origin = window.location.origin || "http://localhost:5173";
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const siweMessage = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nAuthorize GhostKey access to Lit Protocol.\n\nURI: ${origin}\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiration}`;

    const signature = await wallet.signMessage(siweMessage);
    const sessionData = { signature, address, expiry: Date.parse(expiration), signedMessage: siweMessage };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    return sessionData;
  }

  async ensureSession(): Promise<SessionData> {
    const session = this.getStoredSession();
    return session ? session : this.createSessionInternal();
  }

  getSessionExpiry(): number | null {
    return this.getStoredSession()?.expiry || null;
  }
  async generateSession() {
    return this.createSessionInternal();
  }
  async verifyAccess() {
    return true;
  }

  // --- ENCRYPT (UPDATED: RETURN HEX) ---
  async encryptFile(file: File, listingId: string, packageId: string, userAddress: string): Promise<EncryptionResult> {
    await this.connect();
    const session = await this.ensureSession();

    const authSig = {
      sig: session.signature,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: session.signedMessage,
      address: session.address,
    };

    const fileContentBase64 = await fileToDataUrl(file);

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions: this.getUnifiedAccessControlConditions(),
        dataToEncrypt: fileContentBase64,
        authSig,
        chain: "ethereum",
      },
      this.litNodeClient!,
    );

    // FIX: Convert Base64 to Hex immediately for safe storage
    const ciphertextHex = base64ToHex(ciphertext);

    return { ciphertext: ciphertextHex, dataToEncryptHash };
  }

  // --- DECRYPT (UPDATED: EXPECT HEX) ---
  async decryptFile(
    ciphertextHex: string, // Expect Hex String
    dataToEncryptHash: string,
    listingId: string,
    packageId: string,
    userAddress: string,
  ): Promise<string> {
    await this.connect();
    const session = await this.ensureSession();

    const authSig = {
      sig: session.signature,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: session.signedMessage,
      address: session.address,
    };

    console.log("🔓 Decrypting Hex Length:", ciphertextHex.length);

    try {
      const decryptedDataUrl = await LitJsSdk.decryptToString(
        {
          accessControlConditions: this.getUnifiedAccessControlConditions(),
          chain: "ethereum",
          ciphertext: ciphertextHex, // Pass Hex
          dataToEncryptHash,
          authSig,
          litActionCode: LIT_ACTION_VERIFY_ACCESS,
          jsParams: { userAddress, listingId, packageId },
        },
        this.litNodeClient!,
      );
      return decryptedDataUrl;
    } catch (error: any) {
      if (error.message?.includes("NodeInvalidAuthSig") || error.errorCode === "NodeInvalidMultipleAuthSigs") {
        localStorage.removeItem(SESSION_KEY);
        return this.decryptFile(ciphertextHex, dataToEncryptHash, listingId, packageId, userAddress);
      }
      throw error;
    }
  }
}

export const litService = new LitProtocolService();
