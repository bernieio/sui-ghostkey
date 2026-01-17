import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { litService } from "@/services/litProtocol";
import { fetchFromWalrus } from "@/services/walrus";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Loader2, Lock, AlertTriangle, Download, CheckCircle } from "lucide-react";
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

  useEffect(() => {
    const fetchListing = async () => {
      if (!listingId) {
        setLoading(false);
        return;
      }
      try {
        const obj = await suiClient.getObject({ id: listingId, options: { showContent: true } });
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;
          setListing({
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
          });
        }
      } catch (err) {
        setError("Failed to load listing");
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
      // 1. Fetch HEX from Walrus
      const ciphertextHex = await fetchFromWalrus(listing.walrusBlobId);

      // 2. Decrypt
      const content = await litService.decryptFile(
        ciphertextHex,
        listing.litDataHash,
        listingId,
        SUI_CONFIG.packageId,
        account.address,
      );
      setDecryptedContent(content);
      toast.success("Decrypted successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Decryption failed");
    } finally {
      setDecrypting(false);
    }
  };

  const renderContent = () => {
    if (!decryptedContent) return null;
    if (decryptedContent.startsWith("data:")) {
      const mimeType = decryptedContent.split(";")[0].split(":")[1];
      if (mimeType.startsWith("image/")) {
        return <img src={decryptedContent} alt="Decrypted" className="max-w-full h-auto rounded-lg" />;
      }
      if (mimeType.startsWith("text/") || mimeType.includes("json")) {
        try {
          const text = atob(decryptedContent.split(",")[1]);
          return (
            <SyntaxHighlighter language="json" style={atomDark}>
              {text}
            </SyntaxHighlighter>
          );
        } catch (e) {}
      }
      return (
        <div className="text-center p-8">
          <Button onClick={() => window.open(decryptedContent)}>Download File</Button>
        </div>
      );
    }
    return (
      <SyntaxHighlighter language="text" style={atomDark}>
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
  if (!listing) return <div className="pt-24 text-center">Not Found</div>;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="bg-[#1a1a1a] border-gray-800 p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-white">Protected Content</h1>
            {decryptedContent ? <CheckCircle className="text-green-500" /> : <Lock className="text-gray-400" />}
          </div>

          {!account ? (
            <div className="text-center py-12 border-dashed border border-gray-700 rounded-lg">
              <p className="text-gray-400">Connect wallet to view</p>
            </div>
          ) : !decryptedContent ? (
            <div className="text-center py-12">
              <Button
                size="lg"
                onClick={handleDecrypt}
                disabled={decrypting}
                className="bg-primary text-black font-bold"
              >
                {decrypting ? <Loader2 className="animate-spin mr-2" /> : <Lock className="mr-2 h-4 w-4" />}
                {decrypting ? "Decrypting..." : "Unlock Content"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 rounded-lg overflow-hidden border border-gray-700 bg-black">{renderContent()}</div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ContentViewer;
