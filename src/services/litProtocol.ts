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
  ciphertext: string; // HEX String (Safe for Walrus)
  dataToEncryptHash: string;
}

// --- HELPERS ---

/**
 * Chuyển đổi Base64 sang Hex String an toàn.
 * Giúp tránh lỗi encoding khi lưu trữ trên Walrus và lỗi "Failed to hex decode" của Lit.
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
    console.warn("Base64 to Hex conversion warning:", e);
    return base64; // Fallback nếu không convert được
  }
}

/**
 * Chuyển File sang Data URL để bảo toàn nội dung nhị phân (ảnh, pdf...)
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- LIT ACTION CODE ---
// Chạy trên Lit Node để kiểm tra quyền sở hữu NFT trên Sui
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

  // --- CONNECT ---
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
    } catch (error) {
      console.error("❌ Failed to connect to Lit:", error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  // --- CONDITIONS ---
  private getUnifiedAccessControlConditions() {
    return [
      {
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

  // --- SESSION MANAGEMENT ---
  private getBurnerWallet(): ethers.Wallet {
    if (this.burnerWallet) return this.burnerWallet;
    const storedKey = localStorage.getItem(BURNER_WALLET_KEY);
    if (storedKey) {
      this.burnerWallet = new ethers.Wallet(storedKey);
      return this.burnerWallet;
    }
    this.burnerWallet = ethers.Wallet.createRandom();
    localStorage.setItem(BURNER_WALLET_KEY, this.burnerWallet.privateKey);
    return this.burnerWallet;
  }

  private hasValidSession(): boolean {
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

  private async createSessionInternal(): Promise<SessionData> {
    const wallet = this.getBurnerWallet();
    const address = await wallet.getAddress();

    const expiryDays = 7;
    const expiration = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    const issuedAt = new Date().toISOString();

    const domain = window.location.host || "localhost";
    const origin = window.location.origin || "http://localhost:5173";
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${address}

Authorize GhostKey access to Lit Protocol.

URI: ${origin}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiration}`;

    const signature = await wallet.signMessage(siweMessage);

    const sessionData: SessionData = {
      signature,
      address,
      expiry: Date.parse(expiration),
      signedMessage: siweMessage,
    };

    this.storeSession(sessionData);
    return sessionData;
  }

  // --- PUBLIC API ---

  getSessionExpiry(): number | null {
    const session = this.getStoredSession();
    return session ? session.expiry : null;
  }

  async generateSession(): Promise<SessionData> {
    return this.createSessionInternal();
  }

  async ensureSession(): Promise<SessionData> {
    if (this.hasValidSession()) {
      return this.getStoredSession()!;
    }
    return this.createSessionInternal();
  }

  async verifyAccess(): Promise<boolean> {
    return true;
  }

  // --- ENCRYPT ---
  async encryptFile(file: File, listingId: string, packageId: string, userAddress: string): Promise<EncryptionResult> {
    await this.connect();
    const session = await this.ensureSession();

    const authSig = {
      sig: session.signature,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: session.signedMessage,
      address: session.address,
    };

    // 1. Chuyển File -> Data URL (để giữ nguyên binary data)
    const fileContentBase64 = await fileToDataUrl(file);

    // 2. Cấu hình params (Dùng 'as any' để fix lỗi TS2353)
    const params: any = {
      accessControlConditions: this.getUnifiedAccessControlConditions(),
      dataToEncrypt: fileContentBase64,
      authSig,
      chain: "ethereum",
    };

    // 3. Encrypt (Trả về Base64 ciphertext)
    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(params, this.litNodeClient!);

    // 4. Convert Base64 Ciphertext -> HEX String (Quan trọng!)
    // Lit Decrypt yêu cầu Hex, và Hex an toàn hơn khi upload HTTP
    const ciphertextHex = base64ToHex(ciphertext);

    return {
      ciphertext: ciphertextHex,
      dataToEncryptHash,
    };
  }

  // --- DECRYPT ---
  async decryptFile(
    ciphertextHex: string, // Input bắt buộc là HEX String
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

    // 1. Cấu hình params (Dùng 'as any' để fix lỗi TS2353)
    const params: any = {
      accessControlConditions: this.getUnifiedAccessControlConditions(),
      chain: "ethereum",
      ciphertext: ciphertextHex, // Truyền Hex vào đây
      dataToEncryptHash,
      authSig,
      litActionCode: LIT_ACTION_VERIFY_ACCESS,
      jsParams: {
        userAddress,
        listingId,
        packageId,
      },
    };

    try {
      // 2. Decrypt
      const decryptedDataUrl = await LitJsSdk.decryptToString(params, this.litNodeClient!);

      return decryptedDataUrl; // Trả về Data URL (vd: "data:image/png;base64,...")
    } catch (error: any) {
      // Auto-recover session nếu lỗi AuthSig
      if (error.message?.includes("NodeInvalidAuthSig") || error.errorCode === "NodeInvalidMultipleAuthSigs") {
        console.warn("AuthSig invalid, regenerating session...");
        localStorage.removeItem(SESSION_KEY);
        return this.decryptFile(ciphertextHex, dataToEncryptHash, listingId, packageId, userAddress);
      }
      throw error;
    }
  }
}

export const litService = new LitProtocolService();
