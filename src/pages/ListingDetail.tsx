/**
 * Listing Detail Page
 * View listing details and rent access
 */

import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { motion } from 'framer-motion';
import { 
  ArrowLeft,
  Clock,
  Users,
  Wallet,
  TrendingUp,
  Lock,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  Eye
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { fetchListing, buildRentAccessTx } from '@/services/suiClient';
import { formatSui, truncateAddress } from '@/lib/utils';
import { SUI_CONFIG } from '@/config/sui';

const ListingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute, isPending: isTxPending } = useSignAndExecuteTransaction();
  
  const [rentalHours, setRentalHours] = useState(24);
  const [showRentModal, setShowRentModal] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txError, setTxError] = useState<string | null>(null);

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => fetchListing(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
    refetchInterval: SUI_CONFIG.pollingIntervalMs, // Poll for updates
  });

  // Calculate rental cost
  const rentalCost = listing ? listing.currentPrice * BigInt(rentalHours) : 0n;
  const slippageBuffer = listing ? (listing.currentPrice * 105n) / 100n : 0n; // 5% slippage

  const handleRent = async () => {
    if (!listing || !account) return;

    setTxStatus('pending');
    setTxError(null);

    try {
      const tx = buildRentAccessTx(
        listing.objectId,
        rentalHours,
        rentalCost + slippageBuffer // Include slippage in payment amount
      );

      await signAndExecute({ transaction: tx });
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      queryClient.invalidateQueries({ queryKey: ['user-access-passes', account.address] });
      queryClient.invalidateQueries({ queryKey: ['rental-events'] });
      queryClient.invalidateQueries({ queryKey: ['seller-listings'] });
      
      setTxStatus('success');
    } catch (err) {
      console.error('Rent error:', err);
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
      setTxStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8">
        <div className="container px-4">
          {/* Back Button */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </Link>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && (
            <Card className="ghost-card border-destructive/50">
              <CardContent className="flex flex-col items-center py-12">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h2 className="text-xl font-semibold mb-2">Failed to load listing</h2>
                <p className="text-muted-foreground">Please try again later</p>
              </CardContent>
            </Card>
          )}

          {/* Listing Details */}
          {listing && (
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Header Card */}
                <Card className="ghost-card">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
                          {listing.mimeType}
                        </Badge>
                        <h1 className="text-2xl font-bold text-foreground mb-2">
                          Listing #{truncateAddress(listing.objectId, 4)}
                        </h1>
                        <p className="text-muted-foreground">
                          by <span className="font-mono text-primary">{truncateAddress(listing.seller)}</span>
                        </p>
                      </div>
                      {listing.isActive ? (
                        <Badge className="bg-primary/20 text-primary border-primary/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-ghost-surface">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-xs">Current Price</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {formatSui(listing.currentPrice)} SUI/hr
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-ghost-surface">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Users className="h-4 w-4" />
                          <span className="text-xs">Active Rentals</span>
                        </div>
                        <p className="text-lg font-bold text-foreground">
                          {listing.activeRentals.toString()}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-ghost-surface">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Wallet className="h-4 w-4" />
                          <span className="text-xs">Base Price</span>
                        </div>
                        <p className="text-lg font-bold text-foreground">
                          {formatSui(listing.basePrice)} SUI
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-ghost-surface">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs">Price Slope</span>
                        </div>
                        <p className="text-lg font-bold text-foreground">
                          {formatSui(listing.priceSlope)} MIST
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Pricing Info */}
                <Card className="ghost-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Dynamic Pricing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <Info className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm text-foreground mb-2">
                          This listing uses dynamic pricing based on demand.
                        </p>
                        <p className="text-sm text-muted-foreground font-mono">
                          Price = {formatSui(listing.basePrice)} + ({listing.activeRentals.toString()} × {formatSui(listing.priceSlope)}) = <span className="text-primary font-bold">{formatSui(listing.currentPrice)} SUI/hr</span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* On-chain Link */}
                <Card className="ghost-card">
                  <CardContent className="p-4">
                    <a
                      href={`https://testnet.suivision.xyz/object/${listing.objectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded-lg bg-ghost-surface hover:bg-ghost-surface-elevated transition-colors"
                    >
                      <div>
                        <p className="font-medium text-foreground">View on Sui Explorer</p>
                        <p className="text-sm text-muted-foreground font-mono">
                          {truncateAddress(listing.objectId, 8)}
                        </p>
                      </div>
                      <ExternalLink className="h-5 w-5 text-muted-foreground" />
                    </a>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar - Rent Action */}
              <div>
                <Card className="ghost-card sticky top-24">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5 text-primary" />
                      Rent Access
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Duration Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-muted-foreground">Duration</span>
                        <span className="font-bold text-foreground">{rentalHours} hours</span>
                      </div>
                      <Slider
                        value={[rentalHours]}
                        onValueChange={([v]) => setRentalHours(v)}
                        min={1}
                        max={168}
                        step={1}
                        className="mb-4"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1 hour</span>
                        <span>1 week</span>
                      </div>
                    </div>

                    {/* Cost Breakdown */}
                    <div className="p-4 rounded-lg bg-ghost-surface space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price per hour</span>
                        <span className="text-foreground">{formatSui(listing.currentPrice)} SUI</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="text-foreground">{rentalHours} hours</span>
                      </div>
                      <div className="border-t border-border pt-2 flex justify-between">
                        <span className="font-medium text-foreground">Total Cost</span>
                        <span className="font-bold text-primary text-lg">
                          {formatSui(rentalCost)} SUI
                        </span>
                      </div>
                    </div>

                    {/* Rent Button */}
                    {account ? (
                      <Button
                        onClick={() => setShowRentModal(true)}
                        disabled={!listing.isActive}
                        className="w-full ghost-button-primary"
                      >
                        {listing.isActive ? 'Rent Access' : 'Listing Paused'}
                      </Button>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-4">
                          Connect your wallet to rent access
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      You'll receive an AccessPass NFT that grants decryption rights
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Rent Confirmation Modal */}
          <Dialog open={showRentModal} onOpenChange={setShowRentModal}>
            <DialogContent className="bg-background border-border">
              <DialogHeader>
                <DialogTitle>Confirm Rental</DialogTitle>
                <DialogDescription>
                  You're about to rent access to this encrypted content
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {txStatus === 'idle' && (
                  <>
                    <div className="p-4 rounded-lg bg-ghost-surface space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="text-foreground">{rentalHours} hours</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Cost</span>
                        <span className="font-bold text-primary">{formatSui(rentalCost)} SUI</span>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowRentModal(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1 ghost-button-primary"
                        onClick={handleRent}
                        disabled={isTxPending}
                      >
                        {isTxPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Confirming...
                          </>
                        ) : (
                          'Confirm & Pay'
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {txStatus === 'pending' && (
                  <div className="text-center py-8">
                    <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
                    <p className="text-foreground">Waiting for confirmation...</p>
                    <p className="text-sm text-muted-foreground">Please approve the transaction in your wallet</p>
                  </div>
                )}

                {txStatus === 'success' && (
                  <div className="text-center py-8">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4"
                    >
                      <CheckCircle2 className="h-8 w-8 text-primary" />
                    </motion.div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Access Granted!</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your AccessPass NFT has been minted
                    </p>
                    <div className="flex flex-col gap-3">
                      <Button
                        className="ghost-button-primary w-full"
                        onClick={() => navigate(`/view/${id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Content Now
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowRentModal(false)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}

                {txStatus === 'error' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Transaction Failed</h3>
                    <p className="text-sm text-destructive mb-4">{txError}</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTxStatus('idle');
                        setTxError(null);
                      }}
                    >
                      Try Again
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ListingDetail;
