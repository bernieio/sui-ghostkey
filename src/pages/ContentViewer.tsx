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

          // Map fields chuẩn camelCase từ dữ liệu on-chain (snake_case)
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
            // Xử lý trường hợp thiếu field cho các object cũ
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
      // Service uploadToWalrus đã đảm bảo dữ liệu lên là Hex String an toàn
      const ciphertextHex = await fetchFromWalrus(listing.walrusBlobId);

      console.log("✅ Ciphertext fetched from Walrus. Length:", ciphertextHex.length);

      // BƯỚC 2: Gọi Lit Protocol để giải mã
      // Lit Service decryptFile giờ nhận input là Hex String trực tiếp
      const content = await litService.decryptFile(
        ciphertextHex,
        listing.litDataHash,
        listingId,
        SUI_CONFIG.packageId,
        account.address,
      );

      // content trả về sẽ là Data URL (vd: "data:image/png;base64,iVB...")
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

    // Check Data URL format (data:mime/type;base64,...)
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
      if (
        mimeType.startsWith("text/") ||
        mimeType.includes("json") ||
        mimeType.includes("script") ||
        mimeType.includes("xml")
      ) {
        try {
          // Decode Base64 to show readable text
          const text = atob(base64Data);
          return (
            <div className="relative group">
              <SyntaxHighlighter
                language={mimeType.includes("json") ? "json" : "text"}
                style={atomDark}
                customStyle={{ margin: 0, padding: "1.5rem", borderRadius: "0.5rem", fontSize: "0.9rem" }}
                showLineNumbers
                wrapLines
              >
                {text}
              </SyntaxHighlighter>
            </div>
          );
        } catch (e) {
          return (
            <div className="text-red-400 p-4 border border-red-900 bg-red-950/30 rounded">
              Error decoding text content
            </div>
          );
        }
      }

      // C. PDF / Other Binary (Download Link)
      return (
        <div className="text-center p-12 bg-gray-900/50 rounded-lg border border-dashed border-gray-700">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-white text-lg font-medium mb-2">Binary File Content</p>
          <p className="text-gray-500 mb-6 font-mono text-sm">{mimeType}</p>
          <a
            href={decryptedContent}
            download={`decrypted-file-${listingId}.${mimeType.split("/")[1]}`}
            className="inline-flex items-center justify-center px-6 py-3 bg-primary text-black font-bold rounded-md hover:bg-primary/90 transition-colors"
          >
            <Download className="mr-2 h-5 w-5" /> Download File
          </a>
        </div>
      );
    }

    // D. Fallback (Plain String - nếu lỡ lưu dạng raw text)
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
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-gray-400 animate-pulse font-medium">Loading secure content...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen pt-24 container mx-auto px-4 bg-[#0d0d0d]">
        <div className="text-center py-16 bg-[#1a1a1a] rounded-lg border border-red-900/30 shadow-lg">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4 opacity-80" />
          <h3 className="text-2xl font-bold text-white mb-2">Content Unavailable</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            {error || "This listing could not be found or has been removed."}
          </p>
          <Button variant="outline" className="mt-6" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="bg-[#1a1a1a] border-gray-800 p-6 mb-8 shadow-2xl shadow-primary/5">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-gray-800 gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <Lock className="w-6 h-6 md:w-8 md:h-8 text-primary" />
                Protected Content Viewer
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-500 text-sm">Listing ID:</span>
                <code className="bg-black/30 px-2 py-1 rounded text-xs font-mono text-gray-300">{listingId}</code>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full border ${decryptedContent ? "bg-green-950/30 border-green-500/30 text-green-400" : "bg-gray-800 border-gray-700 text-gray-400"}`}
            >
              {decryptedContent ? <CheckCircle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span className="font-bold text-sm tracking-wide">{decryptedContent ? "DECRYPTED" : "ENCRYPTED"}</span>
            </div>
          </div>

          {/* Main Content Area */}
          {!account ? (
            <div className="text-center py-20 bg-black/20 rounded-xl border-2 border-dashed border-gray-800">
              <p className="text-gray-400 mb-6 text-lg">Connect your wallet to verify ownership and decrypt.</p>
              {/* Nút connect wallet thường ở header, nhưng có thể thêm nhắc nhở ở đây */}
            </div>
          ) : !decryptedContent ? (
            <div className="text-center py-20 bg-black/20 rounded-xl border-2 border-dashed border-gray-800 transition-all hover:border-primary/20 hover:bg-black/30 group relative overflow-hidden">
              {/* Background Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

              <div className="relative z-10">
                <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-gray-800 group-hover:ring-primary/20 transition-all duration-500 shadow-xl">
                  <Lock className="w-10 h-10 text-gray-500 group-hover:text-primary transition-colors duration-300" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Content is Locked</h3>
                <p className="text-gray-400 mb-8 max-w-lg mx-auto leading-relaxed">
                  You have a valid Access Pass. Click the button below to verify your ownership on-chain and decrypt the
                  content via Lit Protocol.
                </p>

                <Button
                  size="lg"
                  onClick={handleDecrypt}
                  disabled={decrypting}
                  className="bg-primary hover:bg-primary/90 text-black font-bold h-14 px-8 text-lg shadow-[0_0_25px_rgba(0,255,65,0.15)] hover:shadow-[0_0_35px_rgba(0,255,65,0.3)] transition-all transform hover:-translate-y-0.5"
                >
                  {decrypting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                      Verifying & Decrypting...
                    </>
                  ) : (
                    <span className="flex items-center">
                      <Lock className="w-4 h-4 mr-2" /> Unlock Content
                    </span>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-500 slide-in-from-bottom-4">
              {/* Toolbar */}
              <div className="flex justify-between items-center mb-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                    {(listing as any).mimeType.toUpperCase()}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 hover:bg-gray-800 text-gray-300 hover:text-white"
                  onClick={() => {
                    navigator.clipboard.writeText(decryptedContent);
                    toast.success("Content copied to clipboard");
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Copy Raw Data
                </Button>
              </div>

              {/* Content Display */}
              <div className="rounded-xl overflow-hidden border border-gray-700 bg-[#0d0d0d] shadow-inner relative min-h-[200px]">
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
