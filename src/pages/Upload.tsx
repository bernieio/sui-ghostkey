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

  // State management
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Main Publish Logic
  const handlePublish = async () => {
    // 1. Validation
    if (!account) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!file || !title || !price) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsPublishing(true);
    const toastId = toast.loading("Starting publication process...");

    try {
      // 2. Encrypt File (Lit Protocol)
      // Output: ciphertext (HEX String) và dataToEncryptHash
      toast.loading("Encrypting content...", { id: toastId });

      const tempId = crypto.randomUUID(); // ID tạm dùng cho điều kiện encryption

      const { ciphertext, dataToEncryptHash } = await litService.encryptFile(
        file,
        tempId,
        SUI_CONFIG.packageId,
        account.address,
      );

      console.log("🔐 Encryption done. Ciphertext Hex Length:", ciphertext.length);

      // 3. Upload to Walrus (Failover Mechanism)
      // Upload chuỗi HEX lên Walrus (An toàn tuyệt đối về encoding so với Base64)
      toast.loading("Uploading encrypted data to Walrus...", { id: toastId });

      // uploadToWalrus nhận vào string (Hex) và trả về string (Blob ID)
      const blobId = await uploadToWalrus(ciphertext, "text/plain");

      console.log("📦 Walrus Upload done. Blob ID:", blobId);

      // 4. Create Listing on Sui Blockchain
      toast.loading("Creating listing on Sui...", { id: toastId });

      const txb = new Transaction();
      // Convert Price SUI -> MIST (1 SUI = 1,000,000,000 MIST)
      const priceInMist = BigInt(Math.floor(parseFloat(price) * 1_000_000_000));
      const slopeInMist = BigInt(1000); // Default dynamic pricing slope

      txb.moveCall({
        target: `${SUI_CONFIG.packageId}::marketplace::create_listing`,
        arguments: [
          txb.pure.string(blobId), // Walrus Blob ID
          txb.pure.string(dataToEncryptHash), // Lit Data Hash
          txb.pure.u64(priceInMist), // Base Price
          txb.pure.u64(slopeInMist), // Price Slope
          txb.pure.string(file.type || "text/plain"), // MIME Type gốc để hiển thị bên Viewer
        ],
      });

      // 5. Execute Transaction
      signAndExecute(
        { transaction: txb },
        {
          onSuccess: (result) => {
            console.log("✅ Listing created:", result);
            toast.success("Listing published successfully!", { id: toastId });

            // Đợi 1.5s để indexer cập nhật rồi chuyển về trang chủ
            setTimeout(() => navigate("/"), 1500);
          },
          onError: (err) => {
            console.error("❌ Transaction failed:", err);
            toast.error("Transaction failed. Please try again.", { id: toastId });
            setIsPublishing(false);
          },
        },
      );
    } catch (error: any) {
      console.error("❌ Publishing failed:", error);
      toast.error(error.message || "Failed to publish listing", { id: toastId });
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create New Listing</h1>
          <p className="text-gray-400">Share your premium prompts or content securely via Walrus & Lit Protocol.</p>
        </div>

        <Card className="bg-[#1a1a1a] border-gray-800 p-6 space-y-6 shadow-xl">
          {/* File Upload Area */}
          <div className="space-y-2">
            <Label className="text-gray-300">Content File</Label>
            <div
              className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors relative group
              ${file ? "border-primary/50 bg-primary/5" : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"}
            `}
            >
              {file ? (
                <div className="flex items-center justify-center gap-4 animate-in fade-in zoom-in">
                  <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                    <FileText size={24} />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(2)} KB • {file.type || "Unknown Type"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFile(null)}
                    className="ml-auto text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                  >
                    <X size={20} />
                  </Button>
                </div>
              ) : (
                <>
                  <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center gap-3 w-full h-full"
                  >
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                      <UploadIcon className="text-gray-400 group-hover:text-white transition-colors" size={28} />
                    </div>
                    <div>
                      <span className="text-white font-medium text-lg">Click to upload</span>
                      <p className="text-sm text-gray-500 mt-1">Supports Text, Markdown, JSON, Images, PDF</p>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-gray-300">
              Title
            </Label>
            <Input
              id="title"
              placeholder="e.g. Advanced Trading Bot Prompt"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-black/20 border-gray-700 text-white focus:border-primary/50"
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price" className="text-gray-300">
              Rental Price (SUI)
            </Label>
            <div className="relative">
              <Input
                id="price"
                type="number"
                step="0.1"
                placeholder="0.5"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="bg-black/20 border-gray-700 text-white focus:border-primary/50 pl-4"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-bold">SUI</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="desc" className="text-gray-300">
              Description (Optional)
            </Label>
            <Textarea
              id="desc"
              placeholder="Describe what users will get..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-black/20 border-gray-700 text-white min-h-[100px] focus:border-primary/50"
            />
          </div>

          {/* Submit Button */}
          <Button
            className="w-full h-14 bg-primary hover:bg-primary/90 text-black font-bold text-lg shadow-[0_0_15px_rgba(0,255,65,0.3)] transition-all hover:shadow-[0_0_25px_rgba(0,255,65,0.5)]"
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                Publishing to Blockchain...
              </>
            ) : (
              "Publish Listing"
            )}
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Upload;
