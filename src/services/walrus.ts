import { WALRUS_CONFIG } from "@/config/walrus";

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export const uploadToWalrus = async (hexData: string): Promise<string> => {
  try {
    console.log("Uploading to Walrus via Proxy...");

    const response = await fetch("/api/walrus-upload", {
      method: "POST",
      body: hexData,
      headers: {
        "Content-Type": "text/plain",
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Upload failed: ${err.error || response.statusText}`);
    }

    const result = await response.json();

    if (result.newlyCreated?.blobObject?.blobId) {
      return result.newlyCreated.blobObject.blobId;
    } else if (result.alreadyCertified?.blobId) {
      return result.alreadyCertified.blobId;
    }

    throw new Error("Invalid response format from Walrus Proxy");
  } catch (error) {
    console.error("Walrus Proxy Error:", error);
    throw error;
  }
};

export const fetchFromWalrus = async (blobId: string): Promise<string> => {
  let lastError: any;

  for (const aggregatorUrl of WALRUS_CONFIG.AGGREGATORS) {
    try {
      const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);

      if (!response.ok) {
        if (response.status === 404) throw new Error("Not found");
        throw new Error(`Status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      return bytesToHex(bytes);
    } catch (error) {
      console.warn(`Fetch failed ${aggregatorUrl}:`, error);
      lastError = error;
    }
  }
  throw lastError || new Error("All aggregators failed");
};
