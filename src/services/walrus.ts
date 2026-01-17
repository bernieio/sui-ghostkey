import { WALRUS_CONFIG } from "@/config/walrus";

/**
 * Upload thông qua Vercel Proxy để tránh CORS
 */
export const uploadToWalrus = async (data: string, mimeType: string = "text/plain"): Promise<string> => {
  try {
    console.log("🚀 Uploading to Walrus via Proxy...");

    // Gọi về API Route của chính mình
    const response = await fetch("/api/walrus-upload", {
      method: "POST",
      body: data, // Gửi Hex String
      headers: {
        "Content-Type": "text/plain",
      },
    });

    if (!response.ok) {
      const err = await response.json();
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

/**
 * Fetch trực tiếp từ Aggregator (Thường Aggregator cho phép CORS GET)
 * Nếu cần thiết cũng có thể proxy nốt cái này, nhưng thử trực tiếp trước cho nhanh.
 */
export const fetchFromWalrus = async (blobId: string): Promise<string> => {
  let lastError: any;

  for (const aggregatorUrl of WALRUS_CONFIG.AGGREGATORS) {
    try {
      const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);

      if (!response.ok) {
        if (response.status === 404) throw new Error("Not found");
        throw new Error(`Status ${response.status}`);
      }

      // Trả về Text (Hex String)
      return await response.text();
    } catch (error) {
      console.warn(`Fetch failed ${aggregatorUrl}:`, error);
      lastError = error;
    }
  }
  throw lastError || new Error("All aggregators failed");
};
