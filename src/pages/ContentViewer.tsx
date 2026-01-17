import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { litService } from "@/services/litProtocol";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Loader2, Lock, AlertTriangle, FileText, Download, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
// Import SyntaxHighlighter
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const ContentViewer = () => {
  const { id: listingId } = useParams();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  // State management
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch listing data
  useEffect(() => {
    const fetchListing = async () => {
      // FIX 1: Nếu không có listingId, tắt loading ngay để hiện lỗi "Not found" thay vì treo
      if (!listingId) {
        setLoading(false);
        return;
      }

      try {
        console.log("🔍 Fetching listing:", listingId);

        const obj = await suiClient.getObject({
          id: listingId,
          options: { showContent: true },
        });

        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;

          console.log("📋 Parsing listing fields:", obj.data.objectId, fields);

          // Mapping Data từ Sui (snake_case) sang App (camelCase)
          const mappedListing = {
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
          };

          setListing(mappedListing as any);
        } else {
          setError("Listing data not found or invalid type");
        }
      } catch (err) {
        console.error("❌ Error fetching listing:", err);
        setError("Failed to load listing details");
      } finally {
        // FIX 2: Luôn tắt loading dù thành công hay thất bại
        setLoading(false);
      }
    };

    fetchListing();
  }, [listingId, suiClient]);

  // Handle Decryption
  const handleDecrypt = async () => {
    if (!listing || !account || !listingId) return;

    setDecrypting(true);
    try {
      // Lấy Blob ID từ state đã map
      const blobId = (listing as any).walrusBlobId;

      console.log("📥 Fetching ciphertext from Walrus:", blobId);

      // 1. Fetch từ Walrus Aggregator
      const aggregatorUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
      const response = await fetch(aggregatorUrl);

      if (!response.ok) throw new Error(`Walrus fetch failed: ${response.statusText}`);

      // 2. Lấy ciphertext (text)
      const ciphertext = await response.text();
      console.log("✅ Ciphertext fetched, size:", ciphertext.length);

      // 3. Gọi Lit Service để giải mã
      const litHash = (listing as any).litDataHash;

      const content = await litService.decryptFile(
        ciphertext,
        litHash,
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

  // --- RENDER UI ---

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex justify-center items-center bg-[#0d0d0d]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-gray-400 animate-pulse">Loading listing data...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen pt-24 container mx-auto px-4 bg-[#0d0d0d]">
        <div className="text-center py-12 bg-[#1a1a1a] rounded-lg border border-red-900/50">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Listing Not Found</h3>
          <p className="text-gray-400">{error || "This listing does not exist or has been removed."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="bg-[#1a1a1a] border-gray-800 p-6 mb-8 shadow-2xl shadow-green-900/10">
          <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-primary" />
                Protected Content Viewer
              </h1>
              <p className="text-sm text-gray-500 mt-1">ID: {listing.id.toString().slice(0, 8)}...</p>
            </div>
            <div className="flex items-center space-x-2 text-xs bg-gray-800 px-3 py-1 rounded-full text-gray-300">
              <Lock className="w-3 h-3" />
              <span>End-to-End Encrypted</span>
            </div>
          </div>

          {!account ? (
            <div className="text-center py-16 bg-black/40 rounded-xl border border-dashed border-gray-700">
              <p className="text-gray-400 mb-4">Please connect your wallet to verify ownership.</p>
            </div>
          ) : !decryptedContent ? (
            <div className="text-center py-16 bg-black/40 rounded-xl border border-dashed border-gray-700 transition-all hover:border-gray-600">
              <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-gray-700">
                <Lock className="w-10 h-10 text-primary/80" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Content is Locked</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                You need a valid <strong>Access Pass</strong> to view this content.
                <br />
                Lit Protocol will verify your ownership on-chain.
              </p>

              <Button
                size="lg"
                onClick={handleDecrypt}
                disabled={decrypting}
                className="bg-primary hover:bg-primary/90 text-black font-bold min-w-[200px] h-12 shadow-[0_0_20px_rgba(0,255,65,0.3)]"
              >
                {decrypting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Verifying Access...
                  </>
                ) : (
                  <>
                    <KeyIcon className="w-5 h-5 mr-2" />
                    Unlock Content
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-500">
              <div className="flex justify-between items-center mb-4 px-1">
                <div className="flex items-center gap-2 text-green-400 bg-green-950/30 px-3 py-1 rounded-md border border-green-900/50">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold tracking-wider">DECRYPTED • LIVE SESSION</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 hover:bg-gray-800"
                  onClick={() => {
                    navigator.clipboard.writeText(decryptedContent);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Copy Content
                </Button>
              </div>

              <div className="rounded-xl overflow-hidden border border-gray-700 bg-[#0d0d0d] shadow-inner relative group">
                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-gray-500 font-mono">{(listing as any).mimeType}</span>
                </div>
                <SyntaxHighlighter
                  language={(listing as any).mimeType === "application/json" ? "json" : "text"}
                  style={atomDark}
                  customStyle={{ margin: 0, padding: "1.5rem", fontSize: "0.9rem", lineHeight: "1.5" }}
                  showLineNumbers={true}
                  wrapLines={true}
                >
                  {decryptedContent}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

// Helper Icon Component
function KeyIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

export default ContentViewer;
