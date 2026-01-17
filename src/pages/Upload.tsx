/**
 * Upload Page - Create new listing wizard
 * Multi-step form for uploading encrypted content
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CONFIG } from "@/config/sui";
import { litService } from "@/services/litProtocol";
import { uploadToWalrus } from "@/services/walrus"; // Service mới có Failover
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload as UploadIcon, FileText, X } from "lucide-react";

type Step = "file" | "metadata" | "processing" | "complete";

interface FormData {
  file: File | null;
  title: string;
  description: string;
  category: string;
  basePrice: string;
  priceSlope: string;
}

const INITIAL_FORM: FormData = {
  file: null,
  title: "",
  description: "",
  category: "ai-prompt",
  basePrice: "0.01",
  priceSlope: "1000",
};

interface ProcessingStep {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "pending" | "processing" | "complete" | "error";
}

const Upload = () => {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  // State
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

      // Tạo ID tạm thời cho việc mã hóa (trong thực tế nên dùng Listing ID thật sau khi tạo object)
      // Nhưng flow ở đây cần Hash trước khi tạo Listing trên Chain.
      const tempId = crypto.randomUUID();

      const { ciphertext, dataToEncryptHash } = await litService.encryptFile(
        file,
        tempId, // Lưu ý: Listing ID thực tế sẽ khác, cần flow update contract nếu muốn chặt chẽ hơn
        SUI_CONFIG.packageId,
        account.address,
      );

      console.log("Encryption done. Ciphertext Hex Length:", ciphertext.length);

      // 3. Upload to Walrus (Failover Mechanism)
      // Upload chuỗi HEX lên Walrus (An toàn tuyệt đối về encoding)
      toast.loading("Uploading encrypted data to Walrus...", { id: toastId });

      const blobId = await uploadToWalrus(ciphertext, "text/plain");

      console.log("Walrus Upload done. Blob ID:", blobId);

      // 4. Create Listing on Sui Blockchain
      toast.loading("Creating listing on Sui...", { id: toastId });

      const txb = new Transaction();
      const priceInMist = BigInt(parseFloat(price) * 1_000_000_000); // SUI to MIST
      const slopeInMist = BigInt(1000); // Default dynamic pricing slope

      txb.moveCall({
        target: `${SUI_CONFIG.packageId}::marketplace::create_listing`,
        arguments: [
          txb.pure.string(blobId), // Walrus Blob ID
          txb.pure.string(dataToEncryptHash), // Lit Data Hash
          txb.pure.u64(priceInMist), // Base Price
          txb.pure.u64(slopeInMist), // Price Slope
          txb.pure.string(file.type), // MIME Type (để hiển thị đúng bên Viewer)
        ],
      });

      // 5. Execute Transaction
      signAndExecute(
        { transaction: txb },
        {
          onSuccess: (result) => {
            console.log("Listing created:", result);
            toast.success("Listing published successfully!", { id: toastId });

            // Đợi 1 chút cho indexer rồi chuyển về trang chủ
            setTimeout(() => navigate("/"), 1500);
          },
          onError: (err) => {
            console.error("Transaction failed:", err);
            toast.error("Transaction failed. Please try again.", { id: toastId });
            setIsPublishing(false);
          },
        },
      );
    } catch (error: any) {
      console.error("Publishing failed:", error);
      toast.error(error.message || "Failed to publish listing", { id: toastId });
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-[#0d0d0d]">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create New Listing</h1>
          <p className="text-gray-400">Share your premium prompts or content securely.</p>
        </div>

        <Card className="bg-[#1a1a1a] border-gray-800 p-6 space-y-6">
          {/* File Upload Area */}
          <div className="space-y-2">
            <Label className="text-gray-300">Content File</Label>
            <div
              className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${file ? "border-primary/50 bg-primary/5" : "border-gray-700 hover:border-gray-600"}
            `}
            >
              {file ? (
                <div className="flex items-center justify-center gap-4">
                  <div className="w-10 h-10 bg-primary/20 rounded flex items-center justify-center text-primary">
                    <FileText size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFile(null)}
                    className="ml-auto text-gray-400 hover:text-red-400"
                  >
                    <X size={20} />
                  </Button>
                </div>
              ) : (
                <>
                  <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-2">
                      <UploadIcon className="text-gray-400" size={24} />
                    </div>
                    <span className="text-white font-medium">Click to upload</span>
                    <span className="text-sm text-gray-500">Supports Text, Markdown, JSON, Images</span>
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
              className="bg-black/20 border-gray-700 text-white"
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price" className="text-gray-300">
              Rental Price (SUI)
            </Label>
            <Input
              id="price"
              type="number"
              step="0.1"
              placeholder="0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="bg-black/20 border-gray-700 text-white"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="desc" className="text-gray-300">
              Description (Optional)
            </Label>
            <Textarea
              id="desc"
              placeholder="Describe what's inside..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-black/20 border-gray-700 text-white min-h-[100px]"
            />
          </div>

          {/* Submit Button */}
          <Button
            className="w-full h-12 bg-primary hover:bg-primary/90 text-black font-bold text-lg"
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Publishing...
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
