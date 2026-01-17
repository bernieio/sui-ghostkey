/**
 * Lit Protocol Session Indicator
 * Shows session expiry and provides refresh functionality
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, RefreshCw, AlertTriangle, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { litService } from '@/services/litProtocol';

const LitSessionIndicator = () => {
  const [sessionExpiry, setSessionExpiry] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Check session on mount and periodically
  useEffect(() => {
    const checkSession = () => {
      const expiry = litService.getSessionExpiry();
      setSessionExpiry(expiry);
    };

    checkSession();
    const interval = setInterval(checkSession, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Update time remaining display
  useEffect(() => {
    if (!sessionExpiry) {
      setTimeRemaining('');
      return;
    }

    const updateTime = () => {
      const now = Date.now();
      const expiryTime = sessionExpiry.getTime();
      const diff = expiryTime - now;

      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else {
        setTimeRemaining(`${minutes}m`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, [sessionExpiry]);

  // Refresh session
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await litService.generateSession();
      const newExpiry = litService.getSessionExpiry();
      setSessionExpiry(newExpiry);
    } catch (error) {
      console.error('Failed to refresh session:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Determine session status
  const getStatus = () => {
    if (!sessionExpiry) return 'none';
    const now = Date.now();
    const expiryTime = sessionExpiry.getTime();
    const diff = expiryTime - now;

    if (diff <= 0) return 'expired';
    if (diff < 86400000) return 'warning'; // < 1 day
    return 'active';
  };

  const status = getStatus();

  // Don't show if no session exists
  if (status === 'none') {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex items-center"
              >
                <Badge
                  variant={status === 'active' ? 'outline' : 'destructive'}
                  className={`
                    gap-1 cursor-pointer transition-all
                    ${status === 'active' ? 'border-green-500/50 text-green-500' : ''}
                    ${status === 'warning' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500' : ''}
                  `}
                  onClick={handleRefresh}
                >
                  {status === 'active' && <Check className="h-3 w-3" />}
                  {status === 'warning' && <AlertTriangle className="h-3 w-3" />}
                  {status === 'expired' && <AlertTriangle className="h-3 w-3" />}
                  
                  <Shield className="h-3 w-3" />
                  
                  {isRefreshing ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="text-xs">{timeRemaining}</span>
                  )}
                </Badge>
              </motion.div>
            </AnimatePresence>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-medium">Lit Protocol Session</p>
            {status === 'active' && (
              <p className="text-sm text-muted-foreground">
                Session active. Expires in {timeRemaining}.
              </p>
            )}
            {status === 'warning' && (
              <p className="text-sm text-yellow-500">
                Session expiring soon! Click to refresh.
              </p>
            )}
            {status === 'expired' && (
              <p className="text-sm text-destructive">
                Session expired. Click to create new session.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full mt-2"
            >
              {isRefreshing ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh Session
                </>
              )}
            </Button>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default LitSessionIndicator;
