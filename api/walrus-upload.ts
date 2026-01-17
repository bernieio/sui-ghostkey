import type { VercelRequest, VercelResponse } from '@vercel/node';

// Walrus testnet publisher endpoint
const WALRUS_PUBLISHER_URL = 'https://publisher.walrus-testnet.walrus.space';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const epochs = req.query.epochs || '5';
    
    // Get the raw body as buffer
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);

    if (body.length === 0) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    console.log(`Proxying upload to Walrus, size: ${body.length} bytes, epochs: ${epochs}`);

    // Forward to Walrus publisher - correct endpoint is /v1/blobs
    const walrusUrl = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;
    console.log(`Walrus URL: ${walrusUrl}`);
    
    const walrusResponse = await fetch(walrusUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: body,
    });

    if (!walrusResponse.ok) {
      const errorText = await walrusResponse.text();
      console.error('Walrus error:', errorText);
      return res.status(walrusResponse.status).json({ 
        error: 'Walrus upload failed', 
        details: errorText 
      });
    }

    const data = await walrusResponse.json();
    console.log('Walrus upload success:', JSON.stringify(data));
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

export const config = {
  api: {
    bodyParser: false, // We handle raw body manually
  },
};
