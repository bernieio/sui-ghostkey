import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { LitNetwork } from "@lit-protocol/constants";
import { ethers } from "ethers";

// --- CONSTANTS ---
const LIT_NETWORK = LitNetwork.DatilTest;
const BURNER_WALLET_KEY = "ghostkey_burner_wallet_pk";

// --- LIT ACTION CODE ---
// Code này chạy trên Lit Nodes để verify NFT trên Sui
const LIT_ACTION_CODE = `
(async () => {
  const checkSuiAccess = async () => {
    const { userAddress, listingId, packageId } = jsParams;
    const rpcUrl = "https://fullnode.testnet.sui.io:443";
    
    // Gọi RPC Sui: suix_getOwnedObjects
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
      
      if (!res.result || !res.result.data) {
        return false;
      }

      const objects = res.result.data;
      const now = Date.now();

      // Tìm AccessPass hợp lệ
      const validPass = objects.find(obj => {
        const fields = obj.data.content.fields;
        const expiry = parseInt(fields.expiry_ms);
        
        // Debug log (chỉ hiện trong Lit Action Log nếu debug mode on)
        // console.log("Checking pass:", fields.listing_id, expiry);

        return fields.listing_id === listingId && expiry > now;
      });
      
      return !!validPass;
    } catch (e) {
      return false; 
    }
  };

  const hasAccess = await checkSuiAccess();
  
  // Set điều kiện cho Lit Node
  LitActions.setConditions({ conditions: [{ operator: "always", returnValue: hasAccess }], permanent: false });
  LitActions.setResponse({ response: JSON.stringify({ hasAccess }) });
})();
`;

// --- CLASS SERVICE ---
class LitService {
  private client: LitJsSdk.LitNodeClient;
  private isConnected = false;

  constructor() {
    this.client = new LitJsSdk.LitNodeClient({
      litNetwork: LIT_NETWORK,
      debug: false,
    });
  }

  async connect() {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
      console.log("✅ Lit Protocol Connected:", LIT_NETWORK);
    }
  }

  /**
   * Lấy Burner Wallet từ localStorage hoặc tạo mới.
   * Giữ ví này cố định để session không bị reset khi reload trang.
   */
  private getBurnerWallet(): ethers.Wallet {
    let privateKey = localStorage.getItem(BURNER_WALLET_KEY);
    if (!privateKey) {
      const wallet = ethers.Wallet.createRandom();
      privateKey = wallet.privateKey;
      localStorage.setItem(BURNER_WALLET_KEY, privateKey);
    }
    return new ethers.Wallet(privateKey);
  }

  /**
   * Tạo AuthSig chuẩn SIWE (EIP-4361) thủ công.
   * Khắc phục hoàn toàn lỗi "Missing Preamble Line".
   */
  async getAuthSig() {
    const wallet = this.getBurnerWallet();
    const address = await wallet.getAddress();

    // Các thông số chuẩn SIWE
    const domain = window.location.hostname || "localhost";
    const origin = window.location.origin || "http://localhost:5173";
    const statement = "This is a signed message to authorize GhostKey to perform encryption/decryption operations.";
    const version = "1";
    const chainId = "1"; // Lit mặc định dùng Ethereum chain ID cho auth
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const issuedAt = new Date().toISOString();
    const expirationTime = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(); // 24h

    // Cấu trúc message BẮT BUỘC phải đúng format này
    const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${origin}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}`;

    const signature = await wallet.signMessage(siweMessage);

    return {
      sig: signature,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: siweMessage,
      address: address,
    };
  }

  /**
   * MÃ HÓA
   */
  async encryptFile(file: File, listingId: string, packageId: string, userAddress: string) {
    await this.connect();
    const authSig = await this.getAuthSig();

    const accessControlConditions = [
      {
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [userAddress, listingId, packageId],
        returnValueTest: {
          comparator: "=",
          value: "true",
        },
      },
    ];

    // Encrypt file content directly
    const fileContent = await file.text();
    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        authSig,
        chain: "ethereum",
        dataToEncrypt: fileContent,
      },
      this.client,
    );

    // Trả về JSON string để lưu vào Smart Contract
    return JSON.stringify({
      ciphertext,
      dataToEncryptHash,
    });
  }

  /**
   * GIẢI MÃ
   */
  async decryptFile(
    ciphertextFromWalrus: string,
    litDataHashFromSui: string,
    listingId: string,
    packageId: string,
    userAddress: string,
  ) {
    await this.connect();
    const authSig = await this.getAuthSig();

    // Logic xử lý dữ liệu đầu vào:
    // 1. ciphertextFromWalrus: Là chuỗi base64 ciphertext lấy từ Walrus
    // 2. litDataHashFromSui: Là hash lấy từ Smart Contract (lit_data_hash)

    // Lưu ý: Ở hàm encryptFile trên, ta đã trả về JSON chứa cả 2.
    // Nhưng trong flow thực tế (no-backend), ta lưu:
    // - Ciphertext -> Walrus
    // - Hash -> Sui (lit_data_hash)

    // Tuy nhiên, để tương thích ngược với code frontend cũ,
    // ta cần kiểm tra xem litDataHashFromSui có phải là JSON cũ không.
    let finalHash = litDataHashFromSui;

    try {
      const parsed = JSON.parse(litDataHashFromSui);
      if (parsed.dataToEncryptHash) {
        finalHash = parsed.dataToEncryptHash;
      }
    } catch (e) {
      // Nếu không parse được JSON thì nó chính là hash raw, dùng luôn
    }

    console.log("🔓 Decrypting...", {
      ciphertextLen: ciphertextFromWalrus.length,
      hash: finalHash,
      user: userAddress,
    });

    try {
      const decryptedString = await LitJsSdk.decryptToString(
        {
          authSig,
          ciphertext: ciphertextFromWalrus,
          dataToEncryptHash: finalHash,
          chain: "ethereum",
          litActionCode: LIT_ACTION_CODE,
          jsParams: {
            userAddress,
            listingId,
            packageId,
          },
        },
        this.client,
      );

      return decryptedString;
    } catch (e: any) {
      console.error("Lit Decrypt Detailed Error:", e);
      if (e.message?.includes("NodeInvalidAuthSig")) {
        // Xóa key cũ nếu lỗi auth để tạo lại
        localStorage.removeItem(BURNER_WALLET_KEY);
      }
      throw new Error(e.message || "Decryption failed");
    }
  }
}

export const litService = new LitService();
