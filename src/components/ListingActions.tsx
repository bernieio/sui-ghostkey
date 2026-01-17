/**
 * Listing Actions Component
 * Provides Withdraw, Pause/Resume, Update Pricing, and Transfer actions
 */

import { useState } from 'react';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import {
  MoreHorizontal,
  Wallet,
  Pause,
  Play,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  DollarSign,
  Send,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildWithdrawTx,
  buildPauseListingTx,
  buildResumeListingTx,
  buildUpdatePricingTx,
  buildTransferListingTx,
  buildDecayRentalsTx,
  fetchUserAccessPasses,
} from '@/services/suiClient';
import { SUI_CONFIG } from '@/config/sui';
import { formatSui } from '@/lib/utils';
import type { ListingWithMeta } from '@/types/marketplace';

interface ListingActionsProps {
  listing: ListingWithMeta;
  onSuccess?: () => void;
}

const ListingActions = ({ listing, onSuccess }: ListingActionsProps) => {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDecayModal, setShowDecayModal] = useState(false);
  const [expiredPasses, setExpiredPasses] = useState<{ objectId: string; expiryMs: bigint }[]>([]);
  const [isCheckingExpired, setIsCheckingExpired] = useState(false);
  
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [newBasePrice, setNewBasePrice] = useState('');
  const [newSlope, setNewSlope] = useState('');
  const [transferAddress, setTransferAddress] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const balanceSui = Number(listing.balance) / 1_000_000_000;
  const hasBalance = Number(listing.balance) > 0;
  const currentBasePriceSui = Number(listing.basePrice) / 1_000_000_000;
  const currentSlopeMist = Number(listing.priceSlope);

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!withdrawAmount || isProcessing) return;

    const amountMist = BigInt(Math.floor(parseFloat(withdrawAmount) * 1_000_000_000));
    
    if (amountMist <= 0n || amountMist > listing.balance) {
      toast.error('Invalid withdrawal amount');
      return;
    }

    setIsProcessing(true);
    try {
      const tx = buildWithdrawTx(listing.objectId, amountMist);
      await signAndExecute({ transaction: tx });
      
      toast.success(`Withdrew ${withdrawAmount} SUI successfully!`);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      onSuccess?.();
    } catch (error) {
      console.error('Withdraw error:', error);
      toast.error('Failed to withdraw');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle pause/resume
  const handleToggleActive = async () => {
    setIsProcessing(true);
    try {
      const tx = listing.isActive
        ? buildPauseListingTx(listing.objectId)
        : buildResumeListingTx(listing.objectId);
      
      await signAndExecute({ transaction: tx });
      
      toast.success(listing.isActive ? 'Listing paused' : 'Listing resumed');
      onSuccess?.();
    } catch (error) {
      console.error('Toggle active error:', error);
      toast.error('Failed to update listing status');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle update pricing
  const handleUpdatePricing = async () => {
    if (!newBasePrice || !newSlope || isProcessing) return;

    const basePriceMist = BigInt(Math.floor(parseFloat(newBasePrice) * 1_000_000_000));
    const slopeMist = BigInt(parseInt(newSlope));

    if (basePriceMist <= 0n) {
      toast.error('Base price must be greater than 0');
      return;
    }

    if (slopeMist >= basePriceMist) {
      toast.error('Slope must be less than base price');
      return;
    }

    setIsProcessing(true);
    try {
      const tx = buildUpdatePricingTx(listing.objectId, basePriceMist, slopeMist);
      await signAndExecute({ transaction: tx });
      
      toast.success('Pricing updated successfully!');
      setShowPricingModal(false);
      setNewBasePrice('');
      setNewSlope('');
      onSuccess?.();
    } catch (error) {
      console.error('Update pricing error:', error);
      toast.error('Failed to update pricing');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle transfer ownership
  const handleTransfer = async () => {
    if (!transferAddress || !confirmTransfer || isProcessing) return;

    // Basic address validation
    if (!transferAddress.startsWith('0x') || transferAddress.length !== 66) {
      toast.error('Invalid Sui address');
      return;
    }

    setIsProcessing(true);
    try {
      const tx = buildTransferListingTx(listing.objectId, transferAddress);
      await signAndExecute({ transaction: tx });
      
      toast.success('Listing transferred successfully!');
      setShowTransferModal(false);
      setTransferAddress('');
      setConfirmTransfer(false);
      onSuccess?.();
    } catch (error) {
      console.error('Transfer error:', error);
      toast.error('Failed to transfer listing');
    } finally {
      setIsProcessing(false);
    }
  };

  // Copy listing URL
  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/listing/${listing.objectId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  // Open pricing modal with current values
  const openPricingModal = () => {
    setNewBasePrice(currentBasePriceSui.toString());
    setNewSlope(currentSlopeMist.toString());
    setShowPricingModal(true);
  };

  // Check for expired rentals
  const checkExpiredRentals = async () => {
    setIsCheckingExpired(true);
    try {
      // Query AccessRented events for this listing to find all rented passes
      const response = await fetch(SUI_CONFIG.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_queryEvents',
          params: [
            {
              MoveEventType: `${SUI_CONFIG.packageId}::marketplace::AccessRented`,
            },
            null,
            100,
            true, // descending
          ],
        }),
      });

      const data = await response.json();
      const now = Date.now();
      const expired: { objectId: string; expiryMs: bigint }[] = [];

      if (data.result?.data) {
        for (const event of data.result.data) {
          const fields = event.parsedJson;
          if (fields && fields.listing_id === listing.objectId) {
            const expiryMs = BigInt(fields.expiry_ms);
            if (now > Number(expiryMs)) {
              expired.push({
                objectId: event.id?.txDigest || String(expiryMs),
                expiryMs,
              });
            }
          }
        }
      }

      setExpiredPasses(expired);
      setShowDecayModal(true);
    } catch (error) {
      console.error('Error checking expired rentals:', error);
      toast.error('Failed to check expired rentals');
    } finally {
      setIsCheckingExpired(false);
    }
  };

  // Handle decay (cleanup expired rentals)
  const handleDecay = async () => {
    if (expiredPasses.length === 0) return;

    setIsProcessing(true);
    try {
      const expiryMsList = expiredPasses.map((p) => p.expiryMs);
      const tx = buildDecayRentalsTx(listing.objectId, expiryMsList);
      await signAndExecute({ transaction: tx });

      toast.success(`Cleaned up ${expiredPasses.length} expired rental(s)`);
      setShowDecayModal(false);
      setExpiredPasses([]);
      onSuccess?.();
    } catch (error) {
      console.error('Decay error:', error);
      toast.error('Failed to cleanup expired rentals');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isProcessing}>
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => window.open(`/listing/${listing.objectId}`, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={handleCopyUrl}>
            {copied ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy Link
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setShowWithdrawModal(true)}
            disabled={!hasBalance}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Withdraw ({formatSui(listing.balance)})
          </DropdownMenuItem>

          <DropdownMenuItem onClick={openPricingModal}>
            <DollarSign className="h-4 w-4 mr-2" />
            Update Pricing
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleToggleActive}>
            {listing.isActive ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause Listing
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Resume Listing
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem 
            onClick={() => setShowTransferModal(true)}
            className="text-destructive focus:text-destructive"
          >
            <Send className="h-4 w-4 mr-2" />
            Transfer Ownership
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={checkExpiredRentals}
            disabled={Number(listing.activeRentals) === 0 || isCheckingExpired}
          >
            {isCheckingExpired ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Cleanup Expired ({listing.activeRentals.toString()})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Withdraw Balance
            </DialogTitle>
            <DialogDescription>
              Withdraw your earnings from this listing.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-primary">
                {balanceSui.toFixed(4)} SUI
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Withdrawal Amount (SUI)</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={balanceSui}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Button
                  variant="outline"
                  onClick={() => setWithdrawAmount(balanceSui.toString())}
                >
                  Max
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum: 0.001 SUI
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowWithdrawModal(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 mr-2" />
                  Withdraw
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Update Pricing
            </DialogTitle>
            <DialogDescription>
              Adjust the base price and price slope for your listing.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Current Price</p>
              <p className="text-2xl font-bold text-primary">
                {formatSui(listing.currentPrice)} SUI/hour
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Active Rentals: {listing.activeRentals.toString()}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="basePrice">Base Price (SUI/hour)</Label>
              <Input
                id="basePrice"
                type="number"
                step="0.001"
                min="0.000001"
                value={newBasePrice}
                onChange={(e) => setNewBasePrice(e.target.value)}
                placeholder="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slope">Price Slope (MIST per rental)</Label>
              <Input
                id="slope"
                type="number"
                min="0"
                value={newSlope}
                onChange={(e) => setNewSlope(e.target.value)}
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground">
                Must be less than base price. 1 SUI = 1,000,000,000 MIST
              </p>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">
                <strong>Preview:</strong> New price = {newBasePrice || '0'} SUI + ({listing.activeRentals.toString()} x {newSlope || '0'} MIST)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPricingModal(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePricing}
              disabled={!newBasePrice || !newSlope || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Update Pricing
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Transfer Ownership
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. You will lose control of this listing.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
              <p className="text-sm text-destructive font-medium">
                Warning: Transferring ownership is permanent. The new owner will:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
                <li>Have full control over the listing</li>
                <li>Receive all future earnings</li>
                <li>Be able to pause, update, or transfer the listing</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newOwner">New Owner Address</Label>
              <Input
                id="newOwner"
                value={transferAddress}
                onChange={(e) => setTransferAddress(e.target.value)}
                placeholder="0x..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter the full Sui address of the new owner
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="confirmTransfer"
                checked={confirmTransfer}
                onChange={(e) => setConfirmTransfer(e.target.checked)}
                className="rounded border-destructive"
              />
              <Label htmlFor="confirmTransfer" className="text-sm text-muted-foreground">
                I understand this action is irreversible
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTransferModal(false);
                setTransferAddress('');
                setConfirmTransfer(false);
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTransfer}
              disabled={!transferAddress || !confirmTransfer || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Transfer Ownership
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDecayModal} onOpenChange={setShowDecayModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-primary" />
              Cleanup Expired Rentals
            </DialogTitle>
            <DialogDescription>
              Remove expired rental records to reduce gas costs and optimize your listing.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Expired Rentals Found</p>
              <p className="text-2xl font-bold text-primary">
                {expiredPasses.length}
              </p>
            </div>

            {expiredPasses.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                This will remove expired rental records from the blockchain, reducing storage costs
                and optimizing your listing performance.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No expired rentals found for this listing. All current rentals are still active.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDecayModal(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDecay}
              disabled={expiredPasses.length === 0 || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cleanup ({expiredPasses.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ListingActions;
