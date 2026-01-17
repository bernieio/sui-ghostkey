import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransactionBlock } from "@mysten/dapp-kit";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SUI_CONFIG } from "@/config/sui";
import { Listing } from "@/types/marketplace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Tag, Clock, ShieldCheck } from "lucide-react";

const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransactionBlock();

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
          setListing({
            id: obj.data.objectId,
            seller: fields.seller,
            base_price: fields.base_price,
            price_slope: fields.price_slope,
            active_rentals: fields.active_rentals,
            walrus_blob_id: fields.walrus_blob_id,
            lit_data_hash: fields.lit_data_hash,
            mime_type: fields.mime_type,
            balance: fields.balance,
            is_active: fields.is_active,
          });
        }
      } catch (error) {
        console.error("Error fetching listing:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [id, suiClient]);

  const handleRent = async () => {
    if (!account || !listing) {
      toast.error("Please connect wallet first");
      return;
    }

    setRenting(true);
    try {
      const txb = new TransactionBlock();

      // Calculate Price: Base + (Slope * ActiveRentals)
      // Note: This is simplified. Production should fetch get_current_price from chain
      const currentPrice = BigInt(listing.base_price) + BigInt(listing.price_slope) * BigInt(listing.active_rentals);
      const hours = 1; // Default rental 1 hour for MVP

      // Split coin for payment
      const [coin] = txb.splitCoins(txb.gas, [txb.pure(currentPrice * BigInt(hours))]);

      txb.moveCall({
        target: `${SUI_CONFIG.packageId}::marketplace::rent_access`,
        arguments: [txb.object(listing.id), coin, txb.pure(hours), txb.object(SUI_CONFIG.clockObjectId)],
      });

      signAndExecute(
        { transactionBlock: txb },
        {
          onSuccess: (result) => {
            console.log("Rental success:", result);
            toast.success("Rent successful! Redirecting to content...");

            // --- FIX ĐIỀU HƯỚNG TẠI ĐÂY ---
            // Đợi 2s để blockchain index sự kiện rồi mới chuyển trang
            setTimeout(() => {
              navigate(`/view/${listing.id}`); // Đảm bảo listing.id có giá trị
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

  if (loading) return <div className="pt-24 text-center">Loading...</div>;
  if (!listing) return <div className="pt-24 text-center">Listing not found</div>;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d] container mx-auto px-4">
      <Card className="bg-[#1a1a1a] border-gray-800 p-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-4">AI Prompt Listing</h1>
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2 text-gray-400">
            <Tag className="w-4 h-4" /> <span>ID: {listing.id}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <ShieldCheck className="w-4 h-4" /> <span>Encrypted on Walrus & Lit</span>
          </div>
        </div>

        {/* Nút Xem Ngay (Nếu đã thuê) */}
        <div className="flex gap-4">
          <Button onClick={handleRent} disabled={renting} className="bg-primary text-black font-bold flex-1">
            {renting ? <Loader2 className="animate-spin" /> : "Rent Access (1 Hour)"}
          </Button>

          {/* Nút chuyển trang View thủ công */}
          <Button variant="outline" className="flex-1" onClick={() => navigate(`/view/${listing.id}`)}>
            Already Rented? View Content
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ListingDetail;
