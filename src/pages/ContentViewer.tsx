import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { litService } from "@/services/litProtocol";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Loader2, Lock, AlertTriangle, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { fetchFromWalrus } from "@/services/walrus"; // Import service mới

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
      if (!listingId) {
        setLoading(false);
        return;
      }
      try {
        const obj = await suiClient.getObject({
          id: listingId,
          options: { showContent: true },
        });

        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;
          const mappedListing: Listing = {
            id: obj.data.objectId,
            seller: fields.seller,
            basePrice: fields.base_price,
            priceSlope: fields.price_slope,
            activeRentals: fields.active_rentals,
            walrusBlobId: fields.walrus_blob_id,
            litDataHash: fields.lit_data_hash,
            mimeType: fields.mime_type || "text/plain",
            balance: fields.balance,
            isActive: fields.is_active,
            lastDecayTimestamp: fields.last_decay_timestamp || "0",
            decayedThisPeriod: fields.decayed_this_period || "0",
          };
          setListing(mappedListing);
        } else {
          setError("Listing data not found");
        }
      } catch (err) {
        setError("Failed to load listing details");
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [listingId, suiClient]);

  const handleDecrypt = async () => {
    if (!listing || !account || !listingId) return;

    setDecrypting(true);
    try {
      // 1. Fetch HEX từ Walrus (Dùng service có Failover)
      // Không cần fetch URL thủ công nữa
      const ciphertextHex = await fetchFromWalrus(listing.walrusBlobId);

      console.log("✅ Ciphertext fetched, hex len:", ciphertextHex.length);

      // 2. Decrypt (Đầu vào là Hex -> Lit xử lý ngon ơ)
      const content = await litService.decryptFile(
        ciphertextHex,
        listing.litDataHash,
        listingId,
        SUI_CONFIG.packageId,
        account.address,
      );

      setDecryptedContent(content);
      toast.success("Content decrypted successfully!");
    } catch (err: any) {
      console.error("Decryption failed:", err);
      toast.error(err.message || "Decryption failed");
    } finally {
      setDecrypting(false);
    }
  };

  const renderContent = () => {
    if (!decryptedContent) return null;

    if (decryptedContent.startsWith("data:")) {
      const mimeType = decryptedContent.split(";")[0].split(":")[1];

      if (mimeType.startsWith("image/")) {
        return (
          <div className="flex justify-center p-4">
            <img src={decryptedContent} alt="Decrypted" className="max-w-full h-auto rounded-lg shadow-lg" />
          </div>
        );
      }

      if (mimeType.startsWith("text/") || mimeType.includes("json")) {
        try {
          const base64Part = decryptedContent.split(",")[1];
          const text = atob(base64Part);
          return (
            <SyntaxHighlighter language="json" style={atomDark} customStyle={{ margin: 0, padding: "1.5rem" }}>
              {text}
            </SyntaxHighlighter>
          );
        } catch (e) {
          return <div>Error decoding text content</div>;
        }
      }
    }

    return (
      <SyntaxHighlighter language="text" style={atomDark} customStyle={{ margin: 0, padding: "1.5rem" }}>
        {decryptedContent}
      </SyntaxHighlighter>
    );
  };

  if (loading)
    return (
      <div className="pt-24 text-center">
        <Loader2 className="animate-spin mx-auto" />
      </div>
    );
  if (!listing) return <div className="pt-24 text-center">Listing not found</div>;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="bg-[#1a1a1a] border-gray-800 p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-white">Protected Content Viewer</h1>
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <Lock className="w-4 h-4" />
              <span>End-to-End Encrypted</span>
            </div>
          </div>

          {!account ? (
            <div className="text-center py-12 bg-black/20 rounded-lg border border-dashed border-gray-700">
              <p className="text-gray-400 mb-4">Please connect your wallet</p>
            </div>
          ) : !decryptedContent ? (
            <div className="text-center py-12 bg-black/20 rounded-lg border border-dashed border-gray-700">
              <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Content Locked</h3>
              <Button
                size="lg"
                onClick={handleDecrypt}
                disabled={decrypting}
                className="bg-primary hover:bg-primary/90 text-black font-semibold mt-4"
              >
                {decrypting ? <Loader2 className="animate-spin mr-2" /> : null}
                {decrypting ? "Decrypting..." : "Unlock Content"}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden border border-gray-700 bg-[#0d0d0d]">{renderContent()}</div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ContentViewer;
