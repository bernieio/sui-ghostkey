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
    return base64;
  }
}

function hexToBase64(hex: string): string {
  try {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
  } catch (e) {
    return hex;
  }
}

// Helper: File -> Data URL
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

class LitProtocolService {
  public litNodeClient: LitNodeClient | null = null;
  private burnerWallet: ethers.Wallet | null = null;
  private isConnecting: boolean = false;

  async connect() {
    if (this.litNodeClient?.ready) return this.litNodeClient;
    if (this.isConnecting) {
      while (this.isConnecting) await new Promise((r) => setTimeout(r, 100));
      if (this.litNodeClient?.ready) return this.litNodeClient;
    }
    this.isConnecting = true;
    try {
      this.litNodeClient = new LitNodeClient({ litNetwork: LIT_CONFIG.network, debug: false });
      await this.litNodeClient.connect();
      return this.litNodeClient;
    } finally {
      this.isConnecting = false;
    }
  }

  private getBurnerWallet(): ethers.Wallet {
    if (this.burnerWallet) return this.burnerWallet;
    const storedKey = localStorage.getItem(BURNER_WALLET_KEY);
    if (storedKey) return (this.burnerWallet = new ethers.Wallet(storedKey));
    this.burnerWallet = ethers.Wallet.createRandom();
    localStorage.setItem(BURNER_WALLET_KEY, this.burnerWallet.privateKey);
    return this.burnerWallet;
  }

  private async createSessionInternal(): Promise<SessionData> {
    const wallet = this.getBurnerWallet();
    const address = await wallet.getAddress();
    const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const siweMessage = `${window.location.host} wants you to sign in with your Ethereum account:\n${address}\n\nAuthorize GhostKey.\n\nURI: ${window.location.origin}\nVersion: 1\nChain ID: 1\nNonce: ${Math.random().toString(36)}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${expiration}`;
    const signature = await wallet.signMessage(siweMessage);
    const session = { signature, address, expiry: Date.parse(expiration), signedMessage: siweMessage };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async ensureSession() {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored && Date.now() < JSON.parse(stored).expiry) return JSON.parse(stored);
    return this.createSessionInternal();
  }

  getSessionExpiry() {
    const s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s).expiry : null;
  }
  async generateSession() {
    return this.createSessionInternal();
  }
  async verifyAccess() {
    return true;
  }

  // --- ENCRYPT (Returns HEX) ---
  async encryptFile(file: File, listingId: string, packageId: string, userAddress: string): Promise<EncryptionResult> {
    await this.connect();
    const session = await this.ensureSession();

    // Convert to Data URL (preserve binary)
    const fileDataUrl = await fileToDataUrl(file);

    const params: any = {
      accessControlConditions: [
        {
          contractAddress: "",
          standardContractType: "",
          chain: "ethereum",
          method: "",
          parameters: [":userAddress"],
          returnValueTest: { comparator: "=", value: ":userAddress" },
        },
      ],
      dataToEncrypt: fileDataUrl,
      authSig: {
        sig: session.signature,
        derivedVia: "web3.eth.personal.sign",
        signedMessage: session.signedMessage,
        address: session.address,
      },
      chain: "ethereum",
    };

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(params, this.litNodeClient!);

    // Convert Base64 -> HEX for safe storage
    return { ciphertext: base64ToHex(ciphertext), dataToEncryptHash };
  }

  async decryptFile(
    ciphertextHex: string,
    dataToEncryptHash: string,
    listingId: string,
    packageId: string,
    userAddress: string,
  ): Promise<string> {
    await this.connect();
    const session = await this.ensureSession();

    const ciphertextBase64 = hexToBase64(ciphertextHex);

    const params: any = {
      accessControlConditions: [
        {
          contractAddress: "",
          standardContractType: "",
          chain: "ethereum",
          method: "",
          parameters: [":userAddress"],
          returnValueTest: { comparator: "=", value: ":userAddress" },
        },
      ],
      chain: "ethereum",
      ciphertext: ciphertextBase64,
      dataToEncryptHash,
      authSig: {
        sig: session.signature,
        derivedVia: "web3.eth.personal.sign",
        signedMessage: session.signedMessage,
        address: session.address,
      },
    };

    try {
      return await LitJsSdk.decryptToString(params, this.litNodeClient!);
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
