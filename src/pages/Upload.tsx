/**
 * Upload Page - Create new listing wizard
 * Multi-step form for uploading encrypted content
 */

import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload as UploadIcon,
  FileUp,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Wallet,
  Lock,
  Database,
  FileCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { CONTENT_CATEGORIES } from '@/types/marketplace';
import { validateFile, readFileAsBytes, uploadToWalrus } from '@/services/walrus';
import { litService } from '@/services/litProtocol';
import { buildCreateListingTx } from '@/services/suiClient';

type Step = 'file' | 'metadata' | 'processing' | 'complete';

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
  title: '',
  description: '',
  category: 'ai-prompt',
  basePrice: '0.01',
  priceSlope: '1000',
};

interface ProcessingStep {
  id: string;
  label: string;
  icon: React.ElementType;
  status: 'pending' | 'processing' | 'complete' | 'error';
}

const Upload = () => {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  
  // Use custom execute to get objectChanges in response
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction({
    execute: async ({ bytes, signature }) =>
      await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
          showRawEffects: true,
          showObjectChanges: true,
        },
      }),
  });
  
  const [step, setStep] = useState<Step>('file');
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: 'encrypt', label: 'Encrypting file with Lit Protocol', icon: Lock, status: 'pending' },
    { id: 'upload', label: 'Uploading to Walrus storage', icon: Database, status: 'pending' },
    { id: 'deploy', label: 'Deploying smart contract listing', icon: FileCheck, status: 'pending' },
  ]);

  const updateProcessingStep = (id: string, status: ProcessingStep['status']) => {
    setProcessingSteps(steps => 
      steps.map(s => s.id === id ? { ...s, status } : s)
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    setError(null);
    setForm(f => ({ ...f, file, title: file.name.replace(/\.[^/.]+$/, '') }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    setError(null);
    setForm(f => ({ ...f, file, title: file.name.replace(/\.[^/.]+$/, '') }));
  };

  const processUpload = async () => {
    if (!form.file || !account) return;

    setStep('processing');
    setError(null);

    try {
      // Step 1: Encrypt file
      updateProcessingStep('encrypt', 'processing');
      const fileBytes = await readFileAsBytes(form.file);
      
      await litService.connect();
      await litService.ensureSession();
      
      const tempListingId = `temp_${Date.now()}`;
      const encryptionResult = await litService.encryptContent(fileBytes, tempListingId);
      updateProcessingStep('encrypt', 'complete');

      // Step 2: Upload to Walrus
      updateProcessingStep('upload', 'processing');
      const walrusResult = await uploadToWalrus(encryptionResult.ciphertext);
      updateProcessingStep('upload', 'complete');

      // Step 3: Deploy smart contract
      updateProcessingStep('deploy', 'processing');
      
      const tx = buildCreateListingTx(
        walrusResult.blobId,
        encryptionResult.dataHash,
        parseFloat(form.basePrice),
        parseInt(form.priceSlope),
        form.file.type || 'application/octet-stream'
      );

      const result = await signAndExecute({
        transaction: tx,
      });

      // Parse objectChanges to get the created Listing object ID
      let newListingId = result.digest; // fallback to digest
      
      if (result.objectChanges) {
        const listingObject = result.objectChanges.find(
          (change) => change.type === 'created' && 
          'objectType' in change && 
          change.objectType?.includes('::marketplace::Listing')
        );
        if (listingObject && 'objectId' in listingObject) {
          newListingId = listingObject.objectId;
          console.log('✅ Extracted Listing object ID:', newListingId);
        } else {
          console.warn('⚠️ Could not find Listing in objectChanges, using digest as fallback');
        }
      } else {
        console.warn('⚠️ No objectChanges in result, using digest as fallback');
      }
      
      setListingId(newListingId);
      updateProcessingStep('deploy', 'complete');
      
      // Store encrypted symmetric key locally (for hackathon demo)
      // Key is stored with the listing object ID for lookup in ContentViewer
      localStorage.setItem(`ghostkey_listing_${newListingId}`, JSON.stringify({
        encryptedSymmetricKey: encryptionResult.encryptedSymmetricKey,
        blobId: walrusResult.blobId,
        createdAt: Date.now(),
      }));
      
      console.log('✅ Listing created successfully:', { 
        listingId: newListingId, 
        blobId: walrusResult.blobId 
      });
      
      setStep('complete');
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
      
      // Mark current step as error
      const currentStep = processingSteps.find(s => s.status === 'processing');
      if (currentStep) {
        updateProcessingStep(currentStep.id, 'error');
      }
    }
  };

  const progress = step === 'file' ? 0 : step === 'metadata' ? 33 : step === 'processing' ? 66 : 100;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8">
        <div className="container px-4 max-w-2xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 rounded-xl bg-primary/10">
              <UploadIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Create Listing</h1>
              <p className="text-sm text-muted-foreground">Upload encrypted content to the marketplace</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span className={step === 'file' ? 'text-primary' : ''}>Select File</span>
              <span className={step === 'metadata' ? 'text-primary' : ''}>Details</span>
              <span className={step === 'processing' ? 'text-primary' : ''}>Processing</span>
              <span className={step === 'complete' ? 'text-primary' : ''}>Complete</span>
            </div>
          </div>

          {/* Not Connected */}
          {!account && (
            <Card className="ghost-card">
              <CardContent className="flex flex-col items-center py-12">
                <Wallet className="h-16 w-16 text-primary mb-4" />
                <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
                <p className="text-muted-foreground text-center max-w-sm">
                  Connect your Sui wallet to create listings on the GhostKey marketplace.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Connected - Form Steps */}
          {account && (
            <AnimatePresence mode="wait">
              {/* Step 1: File Selection */}
              {step === 'file' && (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card className="ghost-card">
                    <CardHeader>
                      <CardTitle>Select File</CardTitle>
                      <CardDescription>
                        Choose a file to encrypt and upload to the marketplace
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className={`
                          border-2 border-dashed rounded-xl p-12 text-center transition-colors
                          ${form.file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                        `}
                      >
                        {form.file ? (
                          <div className="flex flex-col items-center">
                            <FileCheck className="h-12 w-12 text-primary mb-4" />
                            <p className="font-medium text-foreground">{form.file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(form.file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        ) : (
                          <>
                            <FileUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-foreground mb-2">
                              Drag and drop your file here, or
                            </p>
                            <label>
                              <Input
                                type="file"
                                className="hidden"
                                onChange={handleFileSelect}
                                accept=".txt,.md,.json,.png,.jpg,.jpeg,.webp,.pdf"
                              />
                              <span className="text-primary cursor-pointer hover:underline">
                                browse to upload
                              </span>
                            </label>
                            <p className="text-xs text-muted-foreground mt-4">
                              Supported: TXT, MD, JSON, PNG, JPG, WEBP, PDF (max 100MB)
                            </p>
                          </>
                        )}
                      </div>

                      {error && (
                        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          <span className="text-sm text-destructive">{error}</span>
                        </div>
                      )}

                      <div className="flex justify-end mt-6">
                        <Button
                          onClick={() => setStep('metadata')}
                          disabled={!form.file}
                          className="ghost-button-primary"
                        >
                          Continue
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 2: Metadata */}
              {step === 'metadata' && (
                <motion.div
                  key="metadata"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card className="ghost-card">
                    <CardHeader>
                      <CardTitle>Listing Details</CardTitle>
                      <CardDescription>
                        Set pricing and metadata for your listing
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={form.title}
                          onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="Enter a title"
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={form.description}
                          onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Describe your content..."
                          className="mt-2 min-h-[100px]"
                        />
                      </div>

                      <div>
                        <Label htmlFor="category">Category</Label>
                        <Select
                          value={form.category}
                          onValueChange={(v) => setForm(f => ({ ...f, category: v }))}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTENT_CATEGORIES.map(cat => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="basePrice">Base Price (SUI/hour)</Label>
                          <Input
                            id="basePrice"
                            type="number"
                            step="0.001"
                            min="0.000001"
                            value={form.basePrice}
                            onChange={(e) => setForm(f => ({ ...f, basePrice: e.target.value }))}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="priceSlope">Price Slope (MIST)</Label>
                          <Input
                            id="priceSlope"
                            type="number"
                            min="0"
                            value={form.priceSlope}
                            onChange={(e) => setForm(f => ({ ...f, priceSlope: e.target.value }))}
                            className="mt-2"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Price increase per active rental
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <Info className="h-4 w-4 text-primary mt-0.5" />
                        <p className="text-sm text-muted-foreground">
                          Dynamic pricing: Current price = Base price + (Active rentals × Slope)
                        </p>
                      </div>

                      <div className="flex justify-between pt-4">
                        <Button
                          variant="outline"
                          onClick={() => setStep('file')}
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Back
                        </Button>
                        <Button
                          onClick={processUpload}
                          className="ghost-button-primary"
                        >
                          Create Listing
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 3: Processing */}
              {step === 'processing' && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card className="ghost-card">
                    <CardHeader>
                      <CardTitle>Creating Your Listing</CardTitle>
                      <CardDescription>
                        Please wait while we encrypt and upload your content
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {processingSteps.map((pStep) => {
                        const Icon = pStep.icon;
                        return (
                          <div
                            key={pStep.id}
                            className={`
                              flex items-center gap-4 p-4 rounded-lg border
                              ${pStep.status === 'complete' ? 'bg-primary/5 border-primary/30' : 
                                pStep.status === 'processing' ? 'bg-ghost-surface border-primary/50' :
                                pStep.status === 'error' ? 'bg-destructive/5 border-destructive/30' :
                                'bg-ghost-surface border-border'
                              }
                            `}
                          >
                            <div className="p-2 rounded-lg bg-ghost-surface-elevated">
                              {pStep.status === 'processing' ? (
                                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                              ) : pStep.status === 'complete' ? (
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              ) : pStep.status === 'error' ? (
                                <AlertCircle className="h-5 w-5 text-destructive" />
                              ) : (
                                <Icon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className={
                              pStep.status === 'complete' ? 'text-foreground' :
                              pStep.status === 'processing' ? 'text-foreground' :
                              pStep.status === 'error' ? 'text-destructive' :
                              'text-muted-foreground'
                            }>
                              {pStep.label}
                            </span>
                          </div>
                        );
                      })}

                      {error && (
                        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            <span className="font-medium text-destructive">Error</span>
                          </div>
                          <p className="text-sm text-destructive">{error}</p>
                          <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => {
                              setStep('metadata');
                              setProcessingSteps(steps => steps.map(s => ({ ...s, status: 'pending' })));
                              setError(null);
                            }}
                          >
                            Try Again
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 4: Complete */}
              {step === 'complete' && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card className="ghost-card text-center">
                    <CardContent className="py-12">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6"
                      >
                        <CheckCircle2 className="h-10 w-10 text-primary" />
                      </motion.div>
                      
                      <h2 className="text-2xl font-bold text-foreground mb-2">
                        Listing Created!
                      </h2>
                      <p className="text-muted-foreground mb-6">
                        Your encrypted content is now live on the marketplace
                      </p>

                      {listingId && (
                        <p className="font-mono text-sm text-primary bg-primary/10 px-4 py-2 rounded-lg inline-block mb-6">
                          {listingId.slice(0, 20)}...
                        </p>
                      )}

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setStep('file');
                            setForm(INITIAL_FORM);
                            setProcessingSteps(steps => steps.map(s => ({ ...s, status: 'pending' })));
                          }}
                        >
                          Create Another
                        </Button>
                        <Button
                          className="ghost-button-primary"
                          onClick={() => navigate('/dashboard')}
                        >
                          View Dashboard
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Upload;
