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
/**
 * Get the appropriate upload URL based on environment
 * Uses Vercel serverless function in production to bypass CORS
 */
function getUploadUrl(epochs: number): string {
  // Check if we're in production (Vercel) or development
  const isProduction = import.meta.env.PROD;
  
  if (isProduction) {
    // Use Vercel serverless function proxy
    return `/api/walrus-upload?epochs=${epochs}`;
  }
  
  // In development, use the correct Walrus API endpoint: /v1/blobs
  return `${WALRUS_CONFIG.publisherUrl}/v1/blobs?epochs=${epochs}`;
}

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
    
    const uploadUrl = getUploadUrl(epochs);
    const isProxy = uploadUrl.startsWith('/api/');
    
    console.log(`Uploading to Walrus via ${isProxy ? 'proxy' : 'direct'}: ${uploadUrl}`);
    
    const response = await fetch(uploadUrl, {
      method: isProxy ? 'POST' : 'PUT', // Vercel uses POST, Walrus uses PUT
      body: blob,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Walrus upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    // Walrus returns either newlyCreated or alreadyCertified
    // Note: alreadyCertified has blobId directly, not inside blobObject
    let blobId: string;
    
    if (result.newlyCreated?.blobObject?.blobId) {
      blobId = result.newlyCreated.blobObject.blobId;
      console.log('Walrus: newly created blob');
    } else if (result.alreadyCertified?.blobId) {
      blobId = result.alreadyCertified.blobId;
      console.log('Walrus: blob already certified');
    } else {
      console.error('Invalid Walrus response:', result);
      throw new Error('Invalid Walrus response: no blob info found');
    }

    console.log('Walrus upload successful, blobId:', blobId);
    
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
 * Walrus HTTP API: GET /v1/blobs/{blobId}
 * See: https://docs.wal.app/docs/usage/web-api
 */
export async function fetchFromWalrus(blobId: string): Promise<Uint8Array> {
  // Validate blobId before making request
  if (!blobId || blobId === 'undefined' || blobId.trim() === '') {
    console.error('❌ fetchFromWalrus called with invalid blobId:', blobId);
    throw new Error('Invalid blob ID: cannot fetch content without a valid Walrus blob ID');
  }
  
  const url = getWalrusBlobUrl(blobId);
  console.log('🌊 Walrus fetch URL:', url);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ Walrus fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        url,
        error: errorText,
      });
      throw new Error(`Walrus fetch failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }
    
    const buffer = await response.arrayBuffer();
    console.log('✅ Walrus fetch successful, size:', buffer.byteLength, 'bytes');
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('❌ Walrus fetch error:', error);
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
