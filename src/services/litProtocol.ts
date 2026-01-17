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

// Helper: Convert Base64 to Hex String (Fix "Failed to hex decode")
// Lit SDK decrypt expects Hex string for ciphertext in some versions
function base64ToHex(base64: string): string {
  try {
    const raw = atob(base64);
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      const hex = raw.charCodeAt(i).toString(16);
      result += hex.length === 2 ? hex : "0" + hex;
    }
    return result;
  } catch (e) {
    // If not valid base64, assume it is already hex or raw string
    return base64;
  }
}

// LIT ACTION CODE
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

  // ENCRYPT
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

  // DECRYPT
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

    const accessControlConditions = this.getUnifiedAccessControlConditions();

    // FIX: Try to handle both Base64 and Hex ciphertext
    // Lit might be picky, so let's try raw first, if fail, try to fix format
    // But here we just assume it might need specific format.

    // NOTE: If ciphertext comes from `LitJsSdk.encryptString`, it is Base64.
    // If `decryptToString` throws "hex decode" error, it means it expects Hex.
    // Let's try to pass it as is first, if error, we catch and retry with Hex conversion.
    // Or better, assume V6 wants it as is, but we need to ensure the INPUT string is clean.

    const params: any = {
      accessControlConditions,
      chain: "ethereum",
      ciphertext,
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
      const decryptedString = await LitJsSdk.decryptToString(params, this.litNodeClient!);
      return decryptedString;
    } catch (error: any) {
      console.error("Lit Decrypt Attempt 1 Failed:", error);

      // Auto-recover: Invalid Auth Sig -> Retry with new session
      if (error.message?.includes("NodeInvalidAuthSig") || error.errorCode === "NodeInvalidMultipleAuthSigs") {
        console.warn("AuthSig invalid, regenerating session...");
        localStorage.removeItem(SESSION_KEY);
        // Recursive retry (Use `this.` to ensure context)
        // Note: Be careful of infinite loop, but auth logic should prevent it
        return this.decryptFile(ciphertext, dataToEncryptHash, listingId, packageId, userAddress);
      }

      // Auto-recover: Failed to hex decode -> Try converting Base64 to Hex
      if (error.message?.includes("hex decode") || error.message?.includes("invalid hex")) {
        console.warn("Hex decode error detected. Attempting Base64 -> Hex conversion...");
        const hexCiphertext = base64ToHex(ciphertext);

        const retryParams = { ...params, ciphertext: hexCiphertext };

        try {
          return await LitJsSdk.decryptToString(retryParams, this.litNodeClient!);
        } catch (retryError) {
          console.error("Retry with Hex also failed:", retryError);
          throw retryError;
        }
      }

      throw error;
    }
  }
}

export const litService = new LitProtocolService();
