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

  // Fetch listing data
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
          setListing({
            id: obj.data.objectId,
            seller: fields.seller,
            base_price: fields.base_price,
            price_slope: fields.price_slope,
            active_rentals: fields.active_rentals,
            walrus_blob_id: fields.walrus_blob_id,
            lit_data_hash: fields.lit_data_hash,
            mime_type: fields.mime_type || "text/plain",
            balance: fields.balance,
            is_active: fields.is_active,
          });
        }
      } catch (err) {
        setError("Failed to load listing details");
      } finally {
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
      // 1. Fetch encrypted blob from Walrus Aggregator
      // Dùng Aggregator Testnet
      const aggregatorUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${listing.walrus_blob_id}`;
      console.log("📥 Fetching from Walrus:", listing.walrus_blob_id);

      const response = await fetch(aggregatorUrl);
      if (!response.ok) throw new Error(`Walrus fetch failed: ${response.statusText}`);

      // 2. Lấy Ciphertext (Text gốc)
      // Walrus trả về đúng cái chuỗi ciphertext mà ta đã upload, không cần decode gì cả nếu upload đúng
      const ciphertext = await response.text();

      console.log("✅ Ciphertext received, length:", ciphertext.length);

      // 3. Giải mã qua Lit Protocol
      const content = await litService.decryptFile(
        ciphertext,
        listing.lit_data_hash,
        listingId,
        SUI_CONFIG.PACKAGE_ID,
        account.address,
      );

      setDecryptedContent(content);
      toast.success("Content decrypted successfully!");
    } catch (err: any) {
      console.error("Decryption failed:", err);
      const msg = err.message || "Decryption failed";
      toast.error(msg);
      setError(msg);
    } finally {
      setDecrypting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen pt-24 container mx-auto px-4">
        <div className="text-center text-red-500">Listing not found</div>
      </div>
    );
  }

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
              <p className="text-gray-400 mb-4">Please connect your wallet to verify access</p>
            </div>
          ) : !decryptedContent ? (
            <div className="text-center py-12 bg-black/20 rounded-lg border border-dashed border-gray-700">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Content is Locked</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                You need a valid Access Pass to view this content. Lit Protocol will verify your ownership on the Sui
                network.
              </p>

              {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded flex items-center justify-center text-red-400 gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                size="lg"
                onClick={handleDecrypt}
                disabled={decrypting}
                className="bg-primary hover:bg-primary/90 text-black font-semibold min-w-[200px]"
              >
                {decrypting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying & Decrypting...
                  </>
                ) : (
                  "Unlock Content"
                )}
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-mono">DECRYPTED • LIVE SESSION</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(decryptedContent);
                    toast.success("Copied to clipboard");
                  }}
                >
                  Copy Content
                </Button>
              </div>

              <div className="rounded-lg overflow-hidden border border-gray-700 bg-[#0d0d0d]">
                <SyntaxHighlighter
                  language={listing.mime_type === "application/json" ? "json" : "text"}
                  style={atomDark}
                  customStyle={{ margin: 0, padding: "1.5rem" }}
                  showLineNumbers
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

export default ContentViewer;
