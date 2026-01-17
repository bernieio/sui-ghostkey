/**
 * Content Viewer Page
 * Displays decrypted content with 60-second viewing timer
 * Verifies AccessPass ownership before showing content
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Lock,
  Eye,
  AlertTriangle,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Code,
  File,
  Shield,
  Timer,
  Copy,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fetchListing, fetchUserAccessPasses } from "@/services/suiClient";
import { fetchFromWalrus } from "@/services/walrus";
import { litService } from "@/services/litProtocol";
import { LIT_CONFIG } from "@/config/lit";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const VIEW_TIMEOUT_SECONDS = LIT_CONFIG.contentViewTimeoutSeconds; // 60 seconds

type ViewState = "verifying" | "loading" | "viewing" | "expired" | "no-access" | "error";

interface DecodedContent {
  data: Uint8Array;
  mimeType: string;
  text?: string;
  imageUrl?: string;
}

const ContentViewer = () => {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const account = useCurrentAccount();

  const [viewState, setViewState] = useState<ViewState>("verifying");
  const [timeRemaining, setTimeRemaining] = useState<number>(VIEW_TIMEOUT_SECONDS);
  const [content, setContent] = useState<DecodedContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch listing details
  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => fetchListing(listingId!),
    enabled: !!listingId,
  });

  // Fetch user's access passes
  const { data: accessPasses } = useQuery({
    queryKey: ["user-access-passes", account?.address],
    queryFn: () => fetchUserAccessPasses(account!.address),
    enabled: !!account?.address,
  });

  // Check if user has valid access pass for this listing
  const validAccessPass = accessPasses?.find((pass) => {
    const isForThisListing = pass.listingId === listingId;
    const isNotExpired = Number(pass.expiryMs) > Date.now();
    return isForThisListing && isNotExpired;
  });

  // Calculate time until access pass expires
  const accessPassExpiryMs = validAccessPass ? Number(validAccessPass.expiryMs) : 0;
  const timeUntilExpiry = accessPassExpiryMs - Date.now();

  // Verify access and load content
  const loadContent = useCallback(async () => {
    if (!listing || !account?.address || !listingId) return;

    try {
      setViewState("verifying");

      // Verify access through Lit Protocol
      const hasAccess = await litService.verifyAccess(account.address, listingId);

      if (!hasAccess) {
        setViewState("no-access");
        return;
      }

      setViewState("loading");

      // Validate walrusBlobId before fetching
      const blobId = listing.walrusBlobId;
      console.log("📥 Listing data:", {
        objectId: listing.objectId,
        walrusBlobId: blobId,
        litDataHash: listing.litDataHash,
        mimeType: listing.mimeType,
      });

      if (!blobId || blobId === "undefined" || blobId.trim() === "") {
        throw new Error(
          "Walrus blob ID is missing from this listing. " +
            "The content may not have been uploaded correctly, or there is a data parsing issue.",
        );
      }

      // Fetch ciphertext from Walrus
      console.log("📥 Fetching ciphertext from Walrus:", blobId);
      const encryptedData = await fetchFromWalrus(blobId);

      // FIX: Use TextDecoder instead of btoa(String.fromCharCode(...))
      // Because the data in Walrus is already a ciphertext string stored as bytes
      const ciphertextBase64 = new TextDecoder().decode(encryptedData);

      // Get dataToEncryptHash from the listing (stored on-chain in lit_data_hash)
      const dataToEncryptHash = listing.litDataHash;

      if (!dataToEncryptHash || dataToEncryptHash === "undefined" || dataToEncryptHash.trim() === "") {
        throw new Error(
          "Encryption hash (lit_data_hash) is missing from this listing. " +
            "The content may have been uploaded with an older version.",
        );
      }

      console.log("🔐 Decrypting with Lit Protocol...", {
        ciphertextLength: ciphertextBase64.length,
        hash: dataToEncryptHash,
      });

      // Decrypt content using Lit Protocol
      // ciphertext from Walrus + dataToEncryptHash from Sui = decrypted content
      const decryptedContent = await litService.decryptFile(
        ciphertextBase64, // Ciphertext from Walrus (base64)
        dataToEncryptHash, // Hash from Sui (lit_data_hash)
        listingId,
        (await import("@/config/sui")).SUI_CONFIG.packageId,
        account.address,
      );

      // Convert decrypted string to Uint8Array for processing
      const decrypted = new TextEncoder().encode(decryptedContent);
      processDecryptedContent(decrypted, listing.mimeType);
      setViewState("viewing");
      setTimeRemaining(VIEW_TIMEOUT_SECONDS);
    } catch (err) {
      console.error("Content load error:", err);
      setError(err instanceof Error ? err.message : "Failed to load content");
      setViewState("error");
    }
  }, [listing, account?.address, listingId]);

  // Process decrypted content based on MIME type
  const processDecryptedContent = (data: Uint8Array, mimeType: string) => {
    const decoded: DecodedContent = { data, mimeType };

    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      decoded.text = new TextDecoder().decode(data);
    } else if (mimeType.startsWith("image/")) {
      const blob = new Blob([data.slice()], { type: mimeType });
      decoded.imageUrl = URL.createObjectURL(blob);
    }

    setContent(decoded);
  };

  // Countdown timer
  useEffect(() => {
    if (viewState !== "viewing") return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setViewState("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [viewState]);

  // Auto-load content when we have valid access
  useEffect(() => {
    if (validAccessPass && listing && account?.address && viewState === "verifying") {
      loadContent();
    } else if (!validAccessPass && accessPasses !== undefined && !listingLoading) {
      setViewState("no-access");
    }
  }, [validAccessPass, listing, account?.address, accessPasses, listingLoading, loadContent, viewState]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (content?.imageUrl) {
        URL.revokeObjectURL(content.imageUrl);
      }
    };
  }, [content?.imageUrl]);

  // Copy content to clipboard
  const handleCopy = async () => {
    if (!content?.text) return;
    await navigator.clipboard.writeText(content.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get icon for MIME type
  const getMimeIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return ImageIcon;
    if (mimeType.startsWith("text/")) return FileText;
    if (mimeType === "application/json") return Code;
    return File;
  };

  const MimeIcon = content ? getMimeIcon(content.mimeType) : File;
  const progress = (timeRemaining / VIEW_TIMEOUT_SECONDS) * 100;

  if (!account) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <Card className="max-w-md w-full border-primary/20">
            <CardContent className="pt-6 text-center">
              <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Wallet Required</h2>
              <p className="text-muted-foreground mb-4">Connect your wallet to view content</p>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Back button */}
        <Link to={listingId ? `/listing/${listingId}` : "/"}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Listing
          </Button>
        </Link>

        <AnimatePresence mode="wait">
          {/* Verifying State */}
          {viewState === "verifying" && (
            <motion.div
              key="verifying"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center py-20"
            >
              <Card className="max-w-md w-full border-primary/20">
                <CardContent className="pt-6 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="inline-block mb-4"
                  >
                    <Shield className="h-12 w-12 text-primary" />
                  </motion.div>
                  <h2 className="text-xl font-bold mb-2">Verifying Access</h2>
                  <p className="text-muted-foreground">Checking your AccessPass with Lit Protocol...</p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Loading State */}
          {viewState === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center py-20"
            >
              <Card className="max-w-md w-full border-primary/20">
                <CardContent className="pt-6 text-center">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="inline-block mb-4"
                  >
                    <Eye className="h-12 w-12 text-primary" />
                  </motion.div>
                  <h2 className="text-xl font-bold mb-2">Decrypting Content</h2>
                  <p className="text-muted-foreground">Fetching from Walrus and decrypting...</p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* No Access State */}
          {viewState === "no-access" && (
            <motion.div
              key="no-access"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center py-20"
            >
              <Card className="max-w-md w-full border-destructive/20">
                <CardContent className="pt-6 text-center">
                  <Lock className="h-12 w-12 mx-auto mb-4 text-destructive" />
                  <h2 className="text-xl font-bold mb-2">No Valid Access</h2>
                  <p className="text-muted-foreground mb-4">
                    You don't have a valid AccessPass for this content, or it has expired.
                  </p>
                  <Button onClick={() => navigate(`/listing/${listingId}`)}>Rent Access</Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Error State */}
          {viewState === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center py-20"
            >
              <Card className="max-w-md w-full border-destructive/20">
                <CardContent className="pt-6 text-center">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                  <h2 className="text-xl font-bold mb-2">Error Loading Content</h2>
                  <p className="text-muted-foreground mb-4">{error}</p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => loadContent()}>
                      Try Again
                    </Button>
                    <Button onClick={() => navigate(`/listing/${listingId}`)}>Back to Listing</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Expired State */}
          {viewState === "expired" && (
            <motion.div
              key="expired"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center py-20"
            >
              <Card className="max-w-md w-full border-warning/20">
                <CardContent className="pt-6 text-center">
                  <Timer className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                  <h2 className="text-xl font-bold mb-2">Viewing Time Expired</h2>
                  <p className="text-muted-foreground mb-4">Your 60-second viewing window has ended.</p>
                  {timeUntilExpiry > 0 && (
                    <Button onClick={() => loadContent()}>
                      View Again ({Math.floor(timeUntilExpiry / 60000)} min remaining)
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Viewing State - Content Display */}
          {viewState === "viewing" && content && (
            <motion.div
              key="viewing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Timer Bar */}
              <Card className="mb-6 border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock
                        className={`h-5 w-5 ${timeRemaining <= 10 ? "text-destructive animate-pulse" : "text-primary"}`}
                      />
                      <span className="font-medium">Time Remaining: {timeRemaining}s</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-primary/30">
                        <MimeIcon className="h-3 w-3 mr-1" />
                        {content.mimeType}
                      </Badge>
                      <Badge variant="secondary">
                        <Shield className="h-3 w-3 mr-1" />
                        Protected
                      </Badge>
                    </div>
                  </div>
                  <Progress value={progress} className={`h-2 ${timeRemaining <= 10 ? "[&>div]:bg-destructive" : ""}`} />
                </CardContent>
              </Card>

              {/* Content Card */}
              <Card className="border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    Content Viewer
                  </CardTitle>
                  {content.text && (
                    <Button variant="outline" size="sm" onClick={handleCopy} className="border-primary/30">
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1 text-green-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {/* Text Content */}
                  {content.text && (
                    <div className="relative">
                      <pre className="bg-muted/50 rounded-lg p-4 overflow-auto max-h-[60vh] text-sm font-mono whitespace-pre-wrap">
                        {content.text}
                      </pre>
                      {/* Watermark overlay */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5">
                        <span className="text-6xl font-bold text-primary rotate-[-30deg]">GHOSTKEY</span>
                      </div>
                    </div>
                  )}

                  {/* Image Content */}
                  {content.imageUrl && (
                    <div className="relative">
                      <img
                        src={content.imageUrl}
                        alt="Protected content"
                        className="max-w-full h-auto rounded-lg mx-auto"
                        style={{ maxHeight: "60vh" }}
                      />
                      {/* Watermark overlay */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <span className="text-4xl font-bold text-white/20 rotate-[-30deg] select-none">GHOSTKEY</span>
                      </div>
                    </div>
                  )}

                  {/* Binary/Unknown Content */}
                  {!content.text && !content.imageUrl && (
                    <div className="text-center py-8">
                      <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">Binary content ({content.data.length} bytes)</p>
                      <p className="text-sm text-muted-foreground mt-2">MIME Type: {content.mimeType}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Access Pass Info */}
              {validAccessPass && (
                <Card className="mt-6 border-primary/20">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-sm">AccessPass expires in</span>
                      </div>
                      <Badge variant="outline" className="border-primary/30">
                        {Math.floor(timeUntilExpiry / 3600000)}h {Math.floor((timeUntilExpiry % 3600000) / 60000)}m
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
};

export default ContentViewer;
