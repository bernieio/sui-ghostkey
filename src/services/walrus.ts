/**
 * Walrus Storage Service for GhostKey
 * Handles encrypted content upload and retrieval
 */

import { WALRUS_CONFIG, getWalrusBlobUrl } from '@/config/walrus';

interface UploadResult {
  blobId: string;
  url: string;
}

/**
 * Upload encrypted content to Walrus
 */
export async function uploadToWalrus(
  content: Uint8Array,
  epochs: number = WALRUS_CONFIG.defaultEpochs
): Promise<UploadResult> {
  try {
    // Convert Uint8Array to ArrayBuffer for Blob
    const arrayBuffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    
    const response = await fetch(`${WALRUS_CONFIG.publisherUrl}/v1/store?epochs=${epochs}`, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`Walrus upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Walrus returns either newlyCreated or alreadyCertified
    const blobInfo = result.newlyCreated?.blobObject || result.alreadyCertified?.blobObject;
    
    if (!blobInfo) {
      throw new Error('Invalid Walrus response: no blob info');
    }

    const blobId = blobInfo.blobId;
    
    return {
      blobId,
      url: getWalrusBlobUrl(blobId),
    };
  } catch (error) {
    console.error('Walrus upload error:', error);
    throw error;
  }
}

/**
 * Retrieve content from Walrus by blob ID
 */
export async function fetchFromWalrus(blobId: string): Promise<Uint8Array> {
  try {
    const response = await fetch(getWalrusBlobUrl(blobId));
    
    if (!response.ok) {
      throw new Error(`Walrus fetch failed: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('Walrus fetch error:', error);
    throw error;
  }
}

/**
 * Validate file type and size before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSizeBytes = WALRUS_CONFIG.maxFileSizeMB * 1024 * 1024;
  
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${WALRUS_CONFIG.maxFileSizeMB}MB limit`,
    };
  }
  
  if (!WALRUS_CONFIG.supportedMimeTypes.includes(file.type as never)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}`,
    };
  }
  
  return { valid: true };
}

/**
 * Read file content as Uint8Array
 */
export function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      resolve(new Uint8Array(arrayBuffer));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export default {
  uploadToWalrus,
  fetchFromWalrus,
  validateFile,
  readFileAsBytes,
};
