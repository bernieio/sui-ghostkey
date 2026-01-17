import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { litService } from "@/services/litProtocol";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace"; // Giả sử Listing type đã đúng
import { Loader2, Lock, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
// Đã khai báo trong vite-env.d.ts nên import này sẽ OK
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const ContentViewer = () => {
  const { id: listingId } = useParams();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListing = async () => {
      if (!listingId) return;
      try {
        const obj = await suiClient.getObject({
          id: listingId,
          options: { showContent: true },
        });

        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;
          // FIX: Mapping snake_case (Sui) -> camelCase (Frontend Type)
          setListing({
            id: obj.data.objectId,
            seller: fields.seller,
            basePrice: fields.base_price, // Fix TS2353
            priceSlope: fields.price_slope,
            activeRentals: fields.active_rentals,
            walrusBlobId: fields.walrus_blob_id, // Fix TS2551
            litDataHash: fields.lit_data_hash, // Fix TS2551
            mimeType: fields.mime_type || "text/plain", // Fix TS2551
            balance: fields.balance,
            isActive: fields.is_active,
          } as any); // Cast any tạm thời nếu Listing type chưa update kịp
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load listing details");
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [listingId, suiClient]);

  const handleDecrypt = async () => {
    // Fix: Access property using camelCase map
    if (!listing || !account || !listingId) return;

    setDecrypting(true);
    try {
      // Fix TS2551: use correct property name from state mapping
      const blobId = (listing as any).walrusBlobId || (listing as any).walrus_blob_id;

      const aggregatorUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
      console.log("📥 Fetching from Walrus:", blobId);

      const response = await fetch(aggregatorUrl);
      if (!response.ok) throw new Error(`Walrus fetch failed: ${response.statusText}`);

      const ciphertext = await response.text();

      // Fix TS2551 & TS2551: use correct prop and config key
      const dataHash = (listing as any).litDataHash || (listing as any).lit_data_hash;
      const packageId = SUI_CONFIG.packageId; // Fix TS2551 (lowercase p)

      const content = await litService.decryptFile(ciphertext, dataHash, listingId, packageId, account.address);

      setDecryptedContent(content);
      toast.success("Content decrypted successfully!");
    } catch (err: any) {
      console.error("Decryption failed:", err);
      toast.error(err.message || "Decryption failed");
    } finally {
      setDecrypting(false);
    }
  };

  // ... (Phần render giữ nguyên)
  if (loading) return <div>Loading...</div>; // Rút gọn cho ví dụ
  if (!listing) return <div>Not found</div>;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="bg-[#1a1a1a] border-gray-800 p-6 mb-8">
          {/* ... Header ... */}

          {!decryptedContent ? (
            <div className="text-center">
              <Button onClick={handleDecrypt} disabled={decrypting}>
                {decrypting ? "Unlocking..." : "Unlock Content"}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden border border-gray-700 bg-[#0d0d0d]">
              <SyntaxHighlighter
                language={(listing as any).mimeType === "application/json" ? "json" : "text"}
                style={atomDark}
                customStyle={{ margin: 0, padding: "1.5rem" }}
                showLineNumbers
              >
                {decryptedContent}
              </SyntaxHighlighter>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ContentViewer;
