import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Tag, ShieldCheck, ArrowLeft, Coins, Clock } from "lucide-react";

const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [renting, setRenting] = useState(false);

  // 1. FETCH DATA & MAP FIELDS
  useEffect(() => {
    const fetchListing = async () => {
      if (!id) return;
      try {
        const obj = await suiClient.getObject({
          id,
          options: { showContent: true },
        });

        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as any;

          // MAPPING: Từ Sui (snake_case) -> Frontend (camelCase)
          // FIX TS2739: Bổ sung 2 trường thiếu (lastDecayTimestamp, decayedThisPeriod)
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

            // --- CÁC TRƯỜNG MỚI ĐƯỢC BỔ SUNG ---
            lastDecayTimestamp: fields.last_decay_timestamp || "0",
            decayedThisPeriod: fields.decayed_this_period || "0",
          };

          setListing(mappedListing);
        } else {
          toast.error("Invalid listing object type");
        }
      } catch (error) {
        console.error("Error fetching listing:", error);
        toast.error("Failed to fetch listing details");
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [id, suiClient]);

  // 2. HANDLE RENT (Thuê)
  const handleRent = async () => {
    if (!account) {
      toast.error("Please connect wallet first");
      return;
    }
    if (!listing) return;

    setRenting(true);
    try {
      const txb = new Transaction();

      const basePriceBig = BigInt(listing.basePrice);
      const slopeBig = BigInt(listing.priceSlope);
      const rentalsBig = BigInt(listing.activeRentals);

      // Tính giá: Base + (Slope * Rentals)
      const currentPrice = basePriceBig + slopeBig * rentalsBig;
      const hours = 1; // Default 1 hour

      const [coin] = txb.splitCoins(txb.gas, [txb.pure.u64(currentPrice * BigInt(hours))]);

      txb.moveCall({
        target: `${SUI_CONFIG.packageId}::marketplace::rent_access`,
        arguments: [txb.object(listing.id), coin, txb.pure.u64(hours), txb.object(SUI_CONFIG.clockObjectId)],
      });

      signAndExecute(
        { transaction: txb },
        {
          onSuccess: (result) => {
            console.log("Rental success:", result);
            toast.success("Rent successful! Redirecting to viewer...");

            setTimeout(() => {
              navigate(`/view/${listing.id}`);
            }, 2000);
          },
          onError: (err) => {
            console.error("Rental failed:", err);
            toast.error("Transaction failed. Try again.");
          },
        },
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to construct transaction");
    } finally {
      setRenting(false);
    }
  };

  // 3. RENDER UI
  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex justify-center items-center bg-[#0d0d0d]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen pt-24 text-center bg-[#0d0d0d]">
        <h2 className="text-xl text-red-500 mb-4">Listing not found</h2>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Return Home
        </Button>
      </div>
    );
  }

  const displayPrice =
    (Number(listing.basePrice) + Number(listing.priceSlope) * Number(listing.activeRentals)) / 1_000_000_000;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d] container mx-auto px-4">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="mb-6 text-gray-400 hover:text-white pl-0 hover:bg-transparent"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Marketplace
      </Button>

      <Card className="bg-[#1a1a1a] border-gray-800 p-8 max-w-3xl mx-auto shadow-2xl shadow-primary/5">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Rent Content Access</h1>
            <p className="text-gray-400">Unlock encrypted content securely via Lit Protocol</p>
          </div>
          <div className="bg-primary/10 px-4 py-2 rounded-full border border-primary/20">
            <span className="text-primary font-mono font-bold">{displayPrice} SUI</span>
            <span className="text-primary/60 text-xs ml-1">/ hour</span>
          </div>
        </div>

        <div className="grid gap-6 mb-8">
          <div className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <Tag className="w-5 h-5 text-primary" />
            <div className="overflow-hidden">
              <p className="text-sm text-gray-500">Listing Object ID</p>
              <p className="font-mono text-gray-200 text-sm truncate">{listing.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm text-gray-500">Security Mechanism</p>
              <p className="text-gray-200 text-sm">Decentralized Encryption (Walrus + Lit)</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <Coins className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="text-sm text-gray-500">Dynamic Pricing</p>
              <p className="text-gray-200 text-sm">
                Base: {Number(listing.basePrice) / 1_000_000_000} SUI + Slope:{" "}
                {Number(listing.priceSlope) / 1_000_000_000} SUI/rental
              </p>
            </div>
          </div>

          {/* Hiển thị thêm thông tin Decay nếu cần debug */}
          <div className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <Clock className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm text-gray-500">Rental Stats</p>
              <p className="text-gray-200 text-sm">Active Rentals: {listing.activeRentals.toString()}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={handleRent}
            disabled={renting}
            className="bg-primary hover:bg-primary/90 text-black font-bold flex-1 h-12 text-lg"
          >
            {renting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing Payment...
              </>
            ) : (
              "Rent Access (1 Hour)"
            )}
          </Button>

          <Button
            variant="outline"
            className="flex-1 h-12 text-lg border-gray-700 hover:bg-gray-800 hover:text-white"
            onClick={() => navigate(`/view/${listing.id}`)}
          >
            Already Rented? View Now
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ListingDetail;
