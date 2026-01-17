export const config = {
  runtime: "edge",
};

const PUBLISHERS = [
  "https://publisher.walrus-testnet.walrus.space",
  "https://sui-walrus-testnet-publisher.bwarelabs.com",
  "https://publisher.testnet.walrus.atalma.io",
  "https://walrus-testnet.blockscope.net:11444",
  "https://walrus-testnet-publisher.chainbase.online",
];

const TIMEOUT_MS = 30000;

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
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  try {
    const body = await request.text();

    if (!body || body.length === 0) {
      return new Response(JSON.stringify({ error: "Empty body" }), { status: 400 });
    }

    const errors: Array<{ node: string; status?: number; error: string }> = [];

    for (const publisherUrl of PUBLISHERS) {
      try {
        console.log(`Trying upload to: ${publisherUrl}`);

        const walrusResp = await fetchWithTimeout(
          `${publisherUrl}/v1/store?epochs=5`,
          {
            method: "PUT",
            body: body,
            headers: { "Content-Type": "application/octet-stream" },
          },
          TIMEOUT_MS,
        );

        if (walrusResp.ok) {
          const result = await walrusResp.json();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const errorText = await walrusResp.text().catch(() => "Unable to read response");
        errors.push({ node: publisherUrl, status: walrusResp.status, error: errorText });
        console.warn(`Node ${publisherUrl} returned ${walrusResp.status}: ${errorText}`);
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
