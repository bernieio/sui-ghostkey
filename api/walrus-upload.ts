export const config = {
  runtime: "edge",
};

const PUBLISHERS = [
  "https://publisher.walrus-testnet.walrus.space",
  "https://wal-publisher-testnet.staketab.org",
  "https://walrus-testnet-publisher.bartestnet.com",
  "https://walrus-testnet-publisher.nodeinfra.com",
  "https://walrus-testnet.stakingdefenseleague.com",
  "https://walrus.testnet.pops.one",
  "https://sui-walrus-testnet.bwarelabs.com/publisher",
  "https://walrus-publish-testnet.chainode.tech:9003",
  "https://testnet-publisher.walrus.space",
  "https://walrus-testnet-publisher.redundex.com",
];

const TIMEOUT_MS = 45000;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const hexString = await request.text();

    if (!hexString || hexString.length === 0) {
      return new Response(JSON.stringify({ error: "Empty body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const binaryData = hexToBytes(hexString);
    const errors: Array<{ node: string; status?: number; error: string }> = [];

    for (const publisherUrl of PUBLISHERS) {
      try {
        console.log(`Trying upload to: ${publisherUrl} (${binaryData.length} bytes)`);

        const walrusResp = await fetchWithTimeout(
          `${publisherUrl}/v1/store?epochs=5`,
          {
            method: "PUT",
            body: binaryData,
            headers: { "Content-Type": "application/octet-stream" },
          },
          TIMEOUT_MS,
        );

        if (walrusResp.ok) {
          const result = await walrusResp.json();
          console.log(`Upload successful to ${publisherUrl}`);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const errorText = await walrusResp.text().catch(() => "Unable to read response");
        errors.push({ node: publisherUrl, status: walrusResp.status, error: errorText.slice(0, 200) });
        console.warn(`Node ${publisherUrl} returned ${walrusResp.status}: ${errorText.slice(0, 200)}`);
      } catch (err: any) {
        const errorMsg = err.name === "AbortError" ? "Request timeout" : err.message || String(err);
        errors.push({ node: publisherUrl, error: errorMsg });
        console.warn(`Node ${publisherUrl} failed:`, errorMsg);
      }
    }

    return new Response(
      JSON.stringify({
        error: "Walrus upload failed on all nodes",
        details: errors,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
