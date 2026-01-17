// Vercel Serverless Function
export const config = {
  runtime: "edge", // Dùng Edge Runtime cho nhanh
};

// Hardcode list để tránh lỗi import alias trong môi trường Serverless
const PUBLISHERS = [
  "https://publisher.walrus-testnet.walrus.space",
  "https://sui-walrus-testnet-publisher.bwarelabs.com",
  "https://publisher.testnet.walrus.atalma.io",
  "https://walrus-testnet.blockscope.net:11444",
  "https://walrus-testnet-publisher.chainbase.online",
];

export default async function handler(request: Request) {
  // Chỉ chấp nhận POST
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  try {
    const body = await request.text(); // Nhận Hex String từ Client

    if (!body || body.length === 0) {
      return new Response(JSON.stringify({ error: "Empty body" }), { status: 400 });
    }

    // Failover Logic: Thử từng node một
    let lastError = null;

    for (const publisherUrl of PUBLISHERS) {
      try {
        console.log(`Proxying upload to: ${publisherUrl}`);

        const walrusResp = await fetch(`${publisherUrl}/v1/store?epochs=5`, {
          method: "PUT",
          body: body,
          headers: {
            "Content-Type": "text/plain", // Hex string là plain text
          },
        });

        if (walrusResp.ok) {
          const result = await walrusResp.json();
          // Trả về kết quả ngay khi thành công
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        console.warn(`Failed to upload to ${publisherUrl}`, err);
        lastError = err;
      }
    }

    // Nếu thất bại cả 5 node
    return new Response(
      JSON.stringify({
        error: "Walrus upload failed on all nodes",
        details: String(lastError),
      }),
      { status: 503 },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
