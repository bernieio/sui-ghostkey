import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { litService } from "@/services/litProtocol";
import { fetchFromWalrus } from "@/services/walrus"; // Import service có Failover
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Loader2, Lock, AlertTriangle, Download, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const ContentViewer = () => {
  const { id: listingId } = useParams();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  // State
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Listing Data
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

          // Map fields chuẩn camelCase
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
            // Xử lý trường hợp thiếu field cho object cũ
            lastDecayTimestamp: fields.last_decay_timestamp || "0",
            decayedThisPeriod: fields.decayed_this_period || "0",
          };
          setListing(mappedListing);
        } else {
          setError("Listing object not found or invalid.");
        }
      } catch (err) {
        console.error("Fetch listing error:", err);
        setError("Failed to load listing details.");
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [listingId, suiClient]);

  // 2. Handle Decryption Logic
  const handleDecrypt = async () => {
    if (!listing || !account || !listingId) return;

    setDecrypting(true);
    try {
      // BƯỚC 1: Fetch HEX String từ Walrus (Dùng service Failover)
      // Walrus Service trả về string (là chuỗi Hex do Upload.tsx đã convert)
      const ciphertextHex = await fetchFromWalrus(listing.walrusBlobId);

      console.log("✅ Ciphertext fetched from Walrus. Length:", ciphertextHex.length);

      // BƯỚC 2: Gọi Lit Protocol để giải mã
      // Vì Lit Service (Universal Adapter) nhận Uint8Array, ta convert Hex String sang Bytes
      const ciphertextBytes = new TextEncoder().encode(ciphertextHex);

      const content = await litService.decryptFile(
        ciphertextBytes,
        listing.litDataHash,
        listingId,
        SUI_CONFIG.packageId,
        account.address,
      );

      setDecryptedContent(content);
      toast.success("Content decrypted successfully!");
    } catch (err: any) {
      console.error("Decryption failed:", err);
      toast.error(err.message || "Decryption failed. Please try again.");
    } finally {
      setDecrypting(false);
    }
  };

  // 3. Render Helper (Handle Data URLs)
  const renderContent = () => {
    if (!decryptedContent) return null;

    // Check Data URL format (data:image/png;base64,...)
    if (decryptedContent.startsWith("data:")) {
      const [header, base64Data] = decryptedContent.split(",");
      const mimeType = header.split(":")[1].split(";")[0];

      // A. IMAGE
      if (mimeType.startsWith("image/")) {
        return (
          <div className="flex flex-col items-center gap-4">
            <img
              src={decryptedContent}
              alt="Decrypted Content"
              className="max-w-full h-auto rounded-lg shadow-2xl border border-gray-700"
            />
            <Button variant="outline" onClick={() => window.open(decryptedContent)}>
              Open Full Size
            </Button>
          </div>
        );
      }

      // B. TEXT / JSON / CODE
      if (mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("script")) {
        try {
          // Decode Base64 to show readable text
          const text = atob(base64Data);
          return (
            <div className="relative group">
              <SyntaxHighlighter
                language={mimeType.includes("json") ? "json" : "text"}
                style={atomDark}
                customStyle={{ margin: 0, padding: "1.5rem", borderRadius: "0.5rem" }}
                showLineNumbers
                wrapLines
              >
                {text}
              </SyntaxHighlighter>
            </div>
          );
        } catch (e) {
          return <div className="text-red-400 p-4">Error decoding text content</div>;
        }
      }

      // C. PDF / Other Binary (Download Link)
      return (
        <div className="text-center p-8 bg-gray-900 rounded-lg border border-gray-700">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-white mb-4">Binary File ({mimeType})</p>
          <a
            href={decryptedContent}
            download={`decrypted-${listingId}.${mimeType.split("/")[1]}`}
            className="inline-flex items-center justify-center px-4 py-2 bg-primary text-black font-bold rounded-md hover:bg-primary/90"
          >
            <Download className="mr-2 h-4 w-4" /> Download File
          </a>
        </div>
      );
    }

    // D. Fallback (Plain String)
    return (
      <SyntaxHighlighter language="text" style={atomDark} customStyle={{ margin: 0, padding: "1.5rem" }}>
        {decryptedContent}
      </SyntaxHighlighter>
    );
  };

  // --- RENDER MAIN UI ---

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex justify-center items-center bg-[#0d0d0d]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-gray-400 animate-pulse">Loading secure content...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen pt-24 container mx-auto px-4 bg-[#0d0d0d]">
        <div className="text-center py-12 bg-[#1a1a1a] rounded-lg border border-red-900/50">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Content Unavailable</h3>
          <p className="text-gray-400">{error || "This listing could not be found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="bg-[#1a1a1a] border-gray-800 p-6 mb-8 shadow-2xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">Protected Content Viewer</h1>
              <p className="text-sm text-gray-500 mt-1 font-mono">ID: {listingId}</p>
            </div>
            <div className="flex items-center gap-2 text-xs bg-gray-800 px-3 py-1.5 rounded-full border border-gray-700">
              {decryptedContent ? (
                <CheckCircle className="w-3 h-3 text-green-500" />
              ) : (
                <Lock className="w-3 h-3 text-gray-400" />
              )}
              <span className={decryptedContent ? "text-green-500 font-bold" : "text-gray-400"}>
                {decryptedContent ? "UNLOCKED" : "ENCRYPTED"}
              </span>
            </div>
          </div>

          {/* Main Content Area */}
          {!account ? (
            <div className="text-center py-16 bg-black/30 rounded-xl border border-dashed border-gray-700">
              <p className="text-gray-400 mb-4">Connect your wallet to verify ownership and decrypt.</p>
            </div>
          ) : !decryptedContent ? (
            <div className="text-center py-16 bg-black/30 rounded-xl border border-dashed border-gray-700 transition-all hover:border-primary/30 group">
              <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-gray-700 group-hover:ring-primary/50 transition-all">
                <Lock className="w-10 h-10 text-primary/80 group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Content is Locked</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">
                Valid Access Pass found. Click below to verify on-chain and decrypt the content via Lit Protocol.
              </p>

              <Button
                size="lg"
                onClick={handleDecrypt}
                disabled={decrypting}
                className="bg-primary hover:bg-primary/90 text-black font-bold h-12 min-w-[200px] shadow-[0_0_20px_rgba(0,255,65,0.2)]"
              >
                {decrypting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Decrypting...
                  </>
                ) : (
                  "Unlock Content"
                )}
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-500">
              {/* Toolbar */}
              <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                  MIME: {(listing as any).mimeType}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 hover:bg-gray-800 text-gray-300"
                  onClick={() => {
                    navigator.clipboard.writeText(decryptedContent);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Copy Raw
                </Button>
              </div>

              {/* Content Display */}
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-[#0d0d0d] shadow-inner relative">
                {renderContent()}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ContentViewer;
