import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CONFIG } from "@/config/sui";
import { litService } from "@/services/litProtocol";
import { uploadToWalrus } from "@/services/walrus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload as UploadIcon, FileText, X } from "lucide-react";

const Upload = () => {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handlePublish = async () => {
    if (!account) return toast.error("Please connect your wallet first");
    if (!file || !title || !price) return toast.error("Please fill in all required fields");

    setIsPublishing(true);
    const toastId = toast.loading("Processing...");

    try {
      // 1. Encrypt (Get Hex String)
      toast.loading("Encrypting...", { id: toastId });
      const tempId = crypto.randomUUID();
      const { ciphertext, dataToEncryptHash } = await litService.encryptFile(
        file,
        tempId,
        SUI_CONFIG.packageId,
        account.address,
      );

      toast.loading("Uploading to Walrus...", { id: toastId });
      const blobId = await uploadToWalrus(ciphertext);

      // 3. Create Listing
      toast.loading("Confirming on Sui...", { id: toastId });
      const txb = new Transaction();
      const priceInMist = BigInt(Math.floor(parseFloat(price) * 1_000_000_000));
      const slopeInMist = BigInt(1000);

      txb.moveCall({
        target: `${SUI_CONFIG.packageId}::marketplace::create_listing`,
        arguments: [
          txb.pure.string(blobId),
          txb.pure.string(dataToEncryptHash),
          txb.pure.u64(priceInMist),
          txb.pure.u64(slopeInMist),
          txb.pure.string(file.type || "text/plain"),
        ],
      });

      signAndExecute(
        { transaction: txb },
        {
          onSuccess: () => {
            toast.success("Published successfully!", { id: toastId });
            setTimeout(() => navigate("/"), 1500);
          },
          onError: (err) => {
            console.error(err);
            toast.error("Transaction failed", { id: toastId });
            setIsPublishing(false);
          },
        },
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed", { id: toastId });
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-8">Create New Listing</h1>
        <Card className="bg-[#1a1a1a] border-gray-800 p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-gray-300">Content File</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${file ? "border-primary/50 bg-primary/5" : "border-gray-700 hover:border-gray-500"}`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-4">
                  <FileText className="text-primary" />
                  <p className="text-white truncate">{file.name}</p>
                  <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                    <X size={20} />
                  </Button>
                </div>
              ) : (
                <>
                  <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                    <UploadIcon className="text-gray-400 mb-2" />
                    <span className="text-white">Click to upload</span>
                  </label>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-black/20 border-gray-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label>Price (SUI)</Label>
            <Input
              type="number"
              step="0.1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-black/20 border-gray-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-black/20 border-gray-700 text-white"
            />
          </div>
          <Button className="w-full bg-primary text-black font-bold" onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? <Loader2 className="animate-spin" /> : "Publish Listing"}
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Upload;
