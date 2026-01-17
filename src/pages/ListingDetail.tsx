import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Tag, ShieldCheck, ArrowLeft } from "lucide-react";

const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const account = useCurrentAccount();

  // FIX 1: Updated Hook Name for latest dapp-kit
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [renting, setRenting] = useState(false);

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

          // FIX 2: Mapping snake_case (Contract) -> camelCase (Frontend Interface)
          // Fixes TS2353 & TS2551 errors
          setListing({
            id: obj.data.objectId,
            seller: fields.seller,
            basePrice: fields.base_price, // Map base_price -> basePrice
            priceSlope: fields.price_slope, // Map price_slope -> priceSlope
            activeRentals: fields.active_rentals, // Map active_rentals -> activeRentals
            walrusBlobId: fields.walrus_blob_id, // Map walrus_blob_id -> walrusBlobId
            litDataHash: fields.lit_data_hash, // Map lit_data_hash -> litDataHash
            mimeType: fields.mime_type || "text/plain",
            balance: fields.balance,
            isActive: fields.is_active, // Map is_active -> isActive
          } as Listing); // Explicit cast to ensure type safety
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

  const handleRent = async () => {
    if (!account) {
      toast.error("Please connect wallet first");
      return;
    }
    if (!listing) return;

    setRenting(true);
    try {
      // FIX 3: Use Transaction instead of TransactionBlock
      const txb = new Transaction();

      // FIX 4: Use mapped camelCase properties for calculation
      // Calculate Price: Base + (Slope * ActiveRentals)
      const basePrice = BigInt(listing.basePrice);
      const slope = BigInt(listing.priceSlope);
      const activeRentals = BigInt(listing.activeRentals);

      const currentPrice = basePrice + slope * activeRentals;
      const hours = 1; // Default rental 1 hour for MVP

      // Split coin for payment
      const [coin] = txb.splitCoins(txb.gas, [txb.pure.u64(currentPrice * BigInt(hours))]);

      txb.moveCall({
        target: `${SUI_CONFIG.packageId}::marketplace::rent_access`,
        arguments: [txb.object(listing.id), coin, txb.pure.u64(hours), txb.object(SUI_CONFIG.clockObjectId)],
      });

      signAndExecute(
        { transaction: txb }, // Note: Prop name is 'transaction', not 'transactionBlock' in newer SDK
        {
          onSuccess: (result) => {
            console.log("Rental success:", result);
            toast.success("Rent successful! Redirecting...");

            // Wait a bit for indexing then redirect
            setTimeout(() => {
              navigate(`/view/${listing.id}`);
            }, 2000);
          },
          onError: (err) => {
            console.error("Rental failed:", err);
            toast.error("Transaction failed. Please try again.");
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
        <h2 className="text-xl text-red-500">Listing not found</h2>
        <Button variant="link" onClick={() => navigate("/")} className="mt-4 text-primary">
          Return to Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d] container mx-auto px-4">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-6 text-gray-400 hover:text-white pl-0">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Marketplace
      </Button>

      <Card className="bg-[#1a1a1a] border-gray-800 p-8 max-w-3xl mx-auto shadow-2xl">
        <h1 className="text-3xl font-bold text-white mb-6">Rent Access</h1>

        <div className="grid gap-6 mb-8">
          <div className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <Tag className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm text-gray-500">Listing ID</p>
              <p className="font-mono text-gray-200 text-sm break-all">{listing.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm text-gray-500">Security</p>
              <p className="text-gray-200 text-sm">End-to-End Encrypted via Lit Protocol & Walrus</p>
            </div>
          </div>

          <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-sm text-gray-400 mb-1">Current Rental Price</p>
            <p className="text-2xl font-bold text-primary">
              {(Number(listing.basePrice) + Number(listing.priceSlope) * Number(listing.activeRentals)) / 1_000_000_000}{" "}
              SUI
            </p>
            <p className="text-xs text-gray-500 mt-1">Includes dynamic pricing based on demand</p>
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
                Processing...
              </>
            ) : (
              "Rent Access (1 Hour)"
            )}
          </Button>

          <Button
            variant="outline"
            className="flex-1 h-12 text-lg border-gray-700 hover:bg-gray-800"
            onClick={() => navigate(`/view/${listing.id}`)}
          >
            Already Rented? View Content
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ListingDetail;
