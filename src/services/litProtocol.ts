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

// --- HELPER: ROBUST DATA CONVERSION ---

/**
 * Chuyển Base64 (kể cả Data URI) sang Hex String an toàn.
 * Khắc phục triệt để lỗi 'InvalidCharacterError' và 'Failed to hex decode'.
 */
function base64ToHex(base64Input: string): string {
  try {
    if (!base64Input) return "";

    // 1. Làm sạch chuỗi: Xóa khoảng trắng, xuống dòng
    let cleanStr = base64Input.replace(/\s/g, "");

    // 2. Xóa Data URI Prefix nếu có (VD: "data:application/octet-stream;base64,")
    if (cleanStr.includes(",")) {
      cleanStr = cleanStr.split(",")[1];
    }

    // 3. Nếu chuỗi trông có vẻ là Hex rồi (chỉ chứa 0-9, a-f), trả về luôn
    // (Tránh trường hợp dữ liệu đã là Hex mà lại đem đi decode Base64)
    if (/^[0-9a-fA-F]+$/.test(cleanStr) && cleanStr.length % 2 === 0) {
      return cleanStr;
    }

    // 4. Giải mã Base64 sang Binary String
    const binaryStr = atob(cleanStr);

    // 5. Chuyển Binary String sang Hex
    let hexResult = "";
    for (let i = 0; i < binaryStr.length; i++) {
      const hex = binaryStr.charCodeAt(i).toString(16).padStart(2, "0");
      hexResult += hex;
    }

    return hexResult;
  } catch (e) {
    console.error("Critical: Base64 to Hex conversion failed.", e);
    // Fallback: Trả về chuỗi gốc để Lit SDK tự xử lý (hy vọng mong manh)
    return base64Input;
  }
}

// LIT ACTION: Verify Ownership on Sui
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

  // --- CONNECTION ---
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

  // --- ACCESS CONTROL CONDITIONS ---
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

  // --- SESSION & WALLET ---
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
    const statement = "Authorize GhostKey access to Lit Protocol.";
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

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

    const accessControlConditions = this.getUnifiedAccessControlConditions();
    const fileContent = await file.text();

    const params: any = {
      accessControlConditions,
      dataToEncrypt: fileContent,
      authSig,
      chain: "ethereum",
    };

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(params, this.litNodeClient!);

    return { ciphertext, dataToEncryptHash };
  }

  // --- DECRYPT ---
  async decryptFile(
    ciphertext: string,
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

    // FIX: Tự động chuẩn hóa dữ liệu đầu vào sang Hex
    const hexCiphertext = base64ToHex(ciphertext);

    const accessControlConditions = this.getUnifiedAccessControlConditions();

    const params: any = {
      accessControlConditions,
      chain: "ethereum",
      ciphertext: hexCiphertext, // Đảm bảo Hex
      dataToEncryptHash,
      authSig,
      litActionCode: LIT_ACTION_VERIFY_ACCESS,
      jsParams: {
        userAddress,
        listingId,
        packageId,
      },
    };

    // Debug Log quan trọng
    console.log("🔓 Decrypt Params:", {
      cipherLen: ciphertext.length,
      hexLen: hexCiphertext.length,
      isHex: /^[0-9a-fA-F]+$/.test(hexCiphertext),
    });

    try {
      const decryptedString = await LitJsSdk.decryptToString(params, this.litNodeClient!);
      return decryptedString;
    } catch (error: any) {
      console.error("Lit Decrypt Failed:", error);

      // Auto-recover session
      if (error.message?.includes("NodeInvalidAuthSig") || error.errorCode === "NodeInvalidMultipleAuthSigs") {
        console.warn("AuthSig invalid, regenerating session...");
        localStorage.removeItem(SESSION_KEY);
        return this.decryptFile(ciphertext, dataToEncryptHash, listingId, packageId, userAddress);
      }

      throw error;
    }
  }
}

export const litService = new LitProtocolService();
