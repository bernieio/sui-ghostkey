/**
 * AccessPass List Component
 * Displays user's owned AccessPass NFTs with expiry countdown
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { motion } from 'framer-motion';
import { 
  Ticket, 
  Clock, 
  Eye, 
  AlertTriangle,
  Loader2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SUI_CONFIG } from '@/config/sui';
import { fetchUserAccessPasses, fetchListing } from '@/services/suiClient';
import type { AccessPass } from '@/types/marketplace';

interface AccessPassWithListing extends AccessPass {
  listing?: {
    mimeType: string;
    seller: string;
  };
}

const AccessPassCard = ({ pass }: { pass: AccessPassWithListing }) => {
  const navigate = useNavigate();
  const expiryMs = Number(pass.expiryMs);
  const now = Date.now();
  const isExpired = expiryMs <= now;
  const timeRemaining = expiryMs - now;

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return 'Expired';
    
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  // Determine urgency level
  const getUrgencyLevel = () => {
    if (isExpired) return 'expired';
    if (timeRemaining < 3600000) return 'critical'; // < 1 hour
    if (timeRemaining < 86400000) return 'warning'; // < 24 hours
    return 'normal';
  };

  const urgency = getUrgencyLevel();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <Card className={`border transition-all duration-200 hover:border-primary/40 ${
        isExpired ? 'opacity-60 border-muted' : 'border-primary/20'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isExpired ? 'bg-muted' : 'bg-primary/10'
              }`}>
                <Ticket className={`h-5 w-5 ${
                  isExpired ? 'text-muted-foreground' : 'text-primary'
                }`} />
              </div>
              <div>
                <p className="font-medium text-sm truncate max-w-[200px]">
                  {pass.listingId.slice(0, 8)}...{pass.listingId.slice(-6)}
                </p>
                {pass.listing && (
                  <p className="text-xs text-muted-foreground">
                    {pass.listing.mimeType}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Time Badge */}
              <Badge 
                variant={isExpired ? 'destructive' : 'outline'}
                className={`
                  ${urgency === 'critical' ? 'border-destructive text-destructive animate-pulse' : ''}
                  ${urgency === 'warning' ? 'border-yellow-500 text-yellow-500' : ''}
                  ${urgency === 'normal' ? 'border-primary/30' : ''}
                `}
              >
                {urgency === 'critical' && !isExpired && (
                  <AlertTriangle className="h-3 w-3 mr-1" />
                )}
                <Clock className="h-3 w-3 mr-1" />
                {formatTimeRemaining(timeRemaining)}
              </Badge>

              {/* View Button */}
              <Button
                size="sm"
                variant={isExpired ? 'outline' : 'default'}
                disabled={isExpired}
                onClick={() => navigate(`/view/${pass.listingId}`)}
                className="gap-1"
              >
                <Eye className="h-4 w-4" />
                View
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const AccessPassList = () => {
  const account = useCurrentAccount();

  const { data: accessPasses, isLoading, error } = useQuery({
    queryKey: ['user-access-passes', account?.address],
    queryFn: async () => {
      const passes = await fetchUserAccessPasses(account!.address);
      
      // Enrich with listing details
      const enrichedPasses: AccessPassWithListing[] = await Promise.all(
        passes.map(async (pass) => {
          try {
            const listing = await fetchListing(pass.listingId);
            return {
              ...pass,
              listing: listing ? {
                mimeType: listing.mimeType,
                seller: listing.seller,
              } : undefined,
            };
          } catch {
            return pass;
          }
        })
      );

      return enrichedPasses;
    },
    enabled: !!account?.address,
    staleTime: 30000,
    refetchInterval: SUI_CONFIG.pollingIntervalMs, // Poll for updates
  });

  // Separate active and expired passes
  const now = Date.now();
  const activePasses = accessPasses?.filter(p => Number(p.expiryMs) > now) || [];
  const expiredPasses = accessPasses?.filter(p => Number(p.expiryMs) <= now) || [];

  if (!account) {
    return null;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          My AccessPasses
          {activePasses.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activePasses.length} Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p>Failed to load access passes</p>
          </div>
        ) : accessPasses?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No access passes yet</p>
            <p className="text-sm mt-1">Rent access to content to get started</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Passes */}
            {activePasses.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Active</h4>
                <div className="space-y-2">
                  {activePasses.map((pass) => (
                    <AccessPassCard key={pass.id} pass={pass} />
                  ))}
                </div>
              </div>
            )}

            {/* Expired Passes */}
            {expiredPasses.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Expired</h4>
                <div className="space-y-2">
                  {expiredPasses.slice(0, 5).map((pass) => (
                    <AccessPassCard key={pass.id} pass={pass} />
                  ))}
                  {expiredPasses.length > 5 && (
                    <p className="text-sm text-muted-foreground text-center">
                      +{expiredPasses.length - 5} more expired passes
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AccessPassList;
