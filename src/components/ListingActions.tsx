/**
 * Listing Actions Component
 * Provides Withdraw, Pause/Resume, and other actions for seller's listings
 */

import { useState } from 'react';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MoreHorizontal,
  Wallet,
  Pause,
  Play,
  ExternalLink,
  Copy,
  Check,
  Loader2,
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
} from '@/services/suiClient';
import { formatSui } from '@/lib/utils';
import type { ListingWithMeta } from '@/types/marketplace';

interface ListingActionsProps {
  listing: ListingWithMeta;
  onSuccess?: () => void;
}

const ListingActions = ({ listing, onSuccess }: ListingActionsProps) => {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const balanceSui = Number(listing.balance) / 1_000_000_000;
  const hasBalance = Number(listing.balance) > 0;

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

  // Copy listing URL
  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/listing/${listing.objectId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
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
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
            <DialogContent>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
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
              </motion.div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};

export default ListingActions;
