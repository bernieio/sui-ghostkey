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
  ciphertext: string;
  dataToEncryptHash: string;
}

// --- UNIVERSAL DATA ADAPTER ---

/**
 * Chuyển đổi mọi loại dữ liệu đầu vào (Raw Bytes, Base64 String, Hex String)
 * thành định dạng HEX String chuẩn mà Lit SDK V6 yêu cầu.
 */
function adaptCiphertextToHex(data: Uint8Array): string {
  try {
    // 1. Thử convert bytes sang string để kiểm tra format
    const textDecoder = new TextDecoder();
    const str = textDecoder.decode(data).trim();

    // Case A: Dữ liệu là HEX String (VD: "7b226d...")
    // Chỉ chứa 0-9, a-f và độ dài chẵn
    if (/^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0) {
      console.log("Detected format: HEX String");
      return str;
    }

    // Case B: Dữ liệu là Base64 String (VD: "eyJt...")
    // Chứa ký tự Base64 và có thể có padding "="
    // Kiểm tra sơ bộ bằng Regex Base64
    if (/^[A-Za-z0-9+/=]+$/.test(str)) {
      try {
        const raw = atob(str);
        console.log("Detected format: Base64 String");
        // Convert raw binary string to Hex
        let hex = "";
        for (let i = 0; i < raw.length; i++) {
          hex += raw.charCodeAt(i).toString(16).padStart(2, "0");
        }
        return hex;
      } catch (e) {
        // Nếu atob lỗi, nghĩa là không phải Base64 hợp lệ -> Fallthrough xuống Case C
      }
    }

    // Case C: Dữ liệu là Raw Binary (Ciphertext gốc)
    // Convert trực tiếp từng byte sang Hex
    console.log("Detected format: Raw Binary");
    return Array.from(data)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (e) {
    console.error("Ciphertext adaptation failed:", e);
    throw new Error("Failed to process ciphertext format");
  }
}

// --- HELPER: FILE TO DATA URL ---
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- LIT ACTION ---
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
      const objects = res.result?.data || [];
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
      console.log("✅ Lit Protocol Connected");
      return this.litNodeClient;
    } catch (error) {
      console.error("❌ Failed to connect to Lit:", error);
      throw error;
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
        returnValueTest: {
          comparator: "=",
          value: ":userAddress",
        },
      },
    ];
  }

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

    const accessControlConditions = this.getUnifiedAccessControlConditions();

    // Convert file to Data URL to preserve binary content
    const fileContentBase64 = await fileToDataUrl(file);

    const params: any = {
      accessControlConditions,
      dataToEncrypt: fileContentBase64,
      authSig,
      chain: "ethereum",
    };

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(params, this.litNodeClient!);

    // IMPORTANT: Always normalize to HEX before returning
    // encryptString returns Base64, but we want to store HEX for robustness
    const ciphertextHex = adaptCiphertextToHex(new TextEncoder().encode(ciphertext));

    return {
      ciphertext: ciphertextHex,
      dataToEncryptHash,
    };
  }

  // --- DECRYPT ---
  async decryptFile(
    ciphertextBytes: Uint8Array, // Nhận Raw Bytes từ Walrus
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

    // 1. Chuẩn hóa dữ liệu đầu vào thành HEX String
    const ciphertextHex = adaptCiphertextToHex(ciphertextBytes);

    const accessControlConditions = this.getUnifiedAccessControlConditions();

    const params: any = {
      accessControlConditions,
      chain: "ethereum",
      ciphertext: ciphertextHex,
      dataToEncryptHash,
      authSig,
      litActionCode: LIT_ACTION_VERIFY_ACCESS,
      jsParams: {
        userAddress,
        listingId,
        packageId,
      },
    };

    console.log("🔓 Decrypting Hex (len):", ciphertextHex.length);

    try {
      const decryptedDataUrl = await LitJsSdk.decryptToString(params, this.litNodeClient!);
      return decryptedDataUrl;
    } catch (error: any) {
      console.error("Lit Decrypt Failed:", error);
      if (error.message?.includes("NodeInvalidAuthSig") || error.errorCode === "NodeInvalidMultipleAuthSigs") {
        localStorage.removeItem(SESSION_KEY);
        // Retry recursively
        return this.decryptFile(ciphertextBytes, dataToEncryptHash, listingId, packageId, userAddress);
      }
      throw error;
    }
  }
}

export const litService = new LitProtocolService();
