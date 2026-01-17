/**
 * Creator Dashboard Page
 * Manage listings and view revenue
 */

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Plus, 
  Wallet, 
  TrendingUp, 
  Users, 
  Package,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchSellerListings } from '@/services/suiClient';
import { formatSui, truncateAddress } from '@/lib/utils';
import AccessPassList from '@/components/AccessPassList';
import ListingActions from '@/components/ListingActions';
import RevenueChart from '@/components/RevenueChart';
import { useMarketplaceEvents } from '@/hooks/useSuiEvents';

const StatCard = ({ 
  title, 
  value, 
  icon: Icon, 
  description 
}: { 
  title: string; 
  value: string; 
  icon: React.ElementType; 
  description?: string;
}) => (
  <Card className="ghost-card">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-primary" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  
  // Subscribe to real-time marketplace events
  useMarketplaceEvents({
    enabled: !!account?.address,
  });
  
  const { data: listings, isLoading, error } = useQuery({
    queryKey: ['seller-listings', account?.address],
    queryFn: () => fetchSellerListings(account?.address || ''),
    enabled: !!account?.address,
    staleTime: 30 * 1000,
  });

  // Calculate stats
  const totalRevenue = listings?.reduce((sum, l) => sum + l.balance, 0n) || 0n;
  const totalActiveRentals = listings?.reduce((sum, l) => sum + l.activeRentals, 0n) || 0n;
  const activeListings = listings?.filter(l => l.isActive).length || 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-8">
        <div className="container px-4">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <LayoutDashboard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Creator Dashboard</h1>
                {account && (
                  <p className="text-sm text-muted-foreground font-mono">
                    {truncateAddress(account.address)}
                  </p>
                )}
              </div>
            </div>
            
            <Button asChild className="ghost-button-primary">
              <Link to="/upload">
                <Plus className="h-4 w-4 mr-2" />
                Create Listing
              </Link>
            </Button>
          </div>

          {/* Not Connected State */}
          {!account && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="p-6 rounded-2xl bg-ghost-surface border border-border mb-6">
                <Wallet className="h-16 w-16 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Connect Your Wallet
              </h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Connect your Sui wallet to view your listings and manage your creator dashboard.
              </p>
            </motion.div>
          )}

          {/* Connected State */}
          {account && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard
                  title="Total Revenue"
                  value={formatSui(totalRevenue)}
                  icon={TrendingUp}
                  description="Accumulated earnings"
                />
                <StatCard
                  title="Active Rentals"
                  value={totalActiveRentals.toString()}
                  icon={Users}
                  description="Current active access passes"
                />
                <StatCard
                  title="Total Listings"
                  value={(listings?.length || 0).toString()}
                  icon={Package}
                  description={`${activeListings} active`}
                />
                <StatCard
                  title="Wallet Balance"
                  value={formatSui(totalRevenue)}
                  icon={Wallet}
                  description="Available to withdraw"
                />
              </div>

              {/* Revenue Analytics */}
              <RevenueChart className="mb-8" />

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              )}

              {/* Error State */}
              {error && (
                <Card className="ghost-card border-destructive/50">
                  <CardContent className="flex items-center gap-4 py-6">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                    <div>
                      <h3 className="font-semibold text-foreground">Failed to load listings</h3>
                      <p className="text-sm text-muted-foreground">Please try again later</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Listings Table */}
              {!isLoading && !error && listings && (
                <Card className="ghost-card overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-lg">Your Listings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {listings.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-semibold text-foreground mb-2">No listings yet</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Create your first listing to start earning
                        </p>
                        <Button asChild className="ghost-button-primary">
                          <Link to="/upload">Create Listing</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">ID</th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Price</th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Rentals</th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Balance</th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                              <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {listings.map((listing) => (
                              <tr 
                                key={listing.objectId} 
                                className="border-b border-border/50 hover:bg-ghost-surface-elevated transition-colors"
                              >
                                <td className="py-3 px-4">
                                  <Link 
                                    to={`/listing/${listing.objectId}`}
                                    className="font-mono text-sm text-primary hover:underline"
                                  >
                                    {truncateAddress(listing.objectId, 4)}
                                  </Link>
                                </td>
                                <td className="py-3 px-4 text-sm text-muted-foreground">
                                  {listing.mimeType}
                                </td>
                                <td className="py-3 px-4 text-sm font-medium text-foreground">
                                  {formatSui(listing.currentPrice)} SUI/hr
                                </td>
                                <td className="py-3 px-4 text-sm text-muted-foreground">
                                  {listing.activeRentals.toString()}
                                </td>
                                <td className="py-3 px-4 text-sm font-medium text-primary">
                                  {formatSui(listing.balance)} SUI
                                </td>
                                <td className="py-3 px-4">
                                  <Badge 
                                    variant={listing.isActive ? 'default' : 'secondary'}
                                    className={listing.isActive ? 'bg-primary/20 text-primary border-primary/30' : ''}
                                  >
                                    {listing.isActive ? 'Active' : 'Paused'}
                                  </Badge>
                                </td>
                                <td className="py-3 px-4">
                                  <ListingActions 
                                    listing={listing} 
                                    onSuccess={() => {
                                      queryClient.invalidateQueries({ queryKey: ['seller-listings', account?.address] });
                                    }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* My Access Passes */}
              <div className="mt-8">
                <AccessPassList />
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;
