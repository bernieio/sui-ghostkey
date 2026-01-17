import { WALRUS_CONFIG } from "@/config/walrus";

/**
 * Upload dữ liệu lên Walrus (String -> Blob ID)
 */
export const uploadToWalrus = async (data: string, mimeType: string = "text/plain"): Promise<string> => {
  let lastError: any;

  // Sử dụng WALRUS_CONFIG.PUBLISHERS
  for (const publisherUrl of WALRUS_CONFIG.PUBLISHERS) {
    try {
      console.log(`📡 Uploading to node: ${publisherUrl}`);

      const response = await fetch(`${publisherUrl}/v1/store?epochs=${WALRUS_CONFIG.DEFAULT_EPOCHS}`, {
        method: "PUT",
        body: data,
        headers: { "Content-Type": mimeType },
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const result = await response.json();

      if (result.newlyCreated?.blobObject?.blobId) {
        return result.newlyCreated.blobObject.blobId;
      } else if (result.alreadyCertified?.blobId) {
        return result.alreadyCertified.blobId;
      }
      throw new Error("Invalid response from Walrus");
    } catch (error) {
      console.warn(`⚠️ Failed ${publisherUrl}:`, error);
      lastError = error;
    }
  }
  throw lastError || new Error("All publishers failed");
};

/**
 * Tải dữ liệu từ Walrus (Blob ID -> String)
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

      // Luôn trả về Text (Vì chúng ta lưu Hex String)
      return await response.text();
    } catch (error) {
      console.warn(`⚠️ Fetch failed ${aggregatorUrl}:`, error);
      lastError = error;
    }
  }
  throw lastError || new Error("All aggregators failed");
};
