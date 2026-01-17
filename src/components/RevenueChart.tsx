/**
 * Revenue Chart Component
 * Displays revenue and rental statistics using Recharts
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp, BarChart3, PieChart as PieChartIcon, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchRentalEvents, fetchSellerListings } from '@/services/suiClient';
import { SUI_CONFIG } from '@/config/sui';
import { formatSui, truncateAddress } from '@/lib/utils';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

interface RevenueChartProps {
  className?: string;
}

const RevenueChart = ({ className }: RevenueChartProps) => {
  const account = useCurrentAccount();

  // Fetch listings for this seller
  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ['seller-listings', account?.address],
    queryFn: () => fetchSellerListings(account?.address || ''),
    enabled: !!account?.address,
    staleTime: 30 * 1000,
    refetchInterval: SUI_CONFIG.pollingIntervalMs, // Poll for updates
  });

  // Fetch rental events
  const { data: rentalEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['rental-events'],
    queryFn: () => fetchRentalEvents(),
    staleTime: 60 * 1000,
    refetchInterval: SUI_CONFIG.pollingIntervalMs, // Poll for updates
  });

  // Filter events for seller's listings
  const sellerEvents = useMemo(() => {
    if (!rentalEvents || !listings) return [];
    const listingIds = new Set(listings.map(l => l.objectId));
    return rentalEvents.filter(e => listingIds.has(e.listingId));
  }, [rentalEvents, listings]);

  // Prepare data for line chart (revenue over time)
  const revenueOverTime = useMemo(() => {
    const dailyRevenue = new Map<string, number>();
    
    sellerEvents.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      const current = dailyRevenue.get(date) || 0;
      dailyRevenue.set(date, current + Number(event.pricePaid) / 1_000_000_000);
    });

    // Convert to array and sort by date
    const entries = Array.from(dailyRevenue.entries()).map(([date, revenue]) => ({
      date,
      revenue: parseFloat(revenue.toFixed(4)),
    }));

    // If no data, show placeholder
    if (entries.length === 0) {
      const today = new Date();
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        return {
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: 0,
        };
      });
    }

    return entries;
  }, [sellerEvents]);

  // Prepare data for bar chart (rentals per listing)
  const rentalsPerListing = useMemo(() => {
    if (!listings) return [];
    
    return listings.slice(0, 5).map(listing => ({
      name: truncateAddress(listing.objectId, 4),
      rentals: Number(listing.activeRentals),
      balance: Number(listing.balance) / 1_000_000_000,
    }));
  }, [listings]);

  // Prepare data for pie chart (revenue distribution)
  const revenueDistribution = useMemo(() => {
    if (!listings) return [];
    
    const totalBalance = listings.reduce((sum, l) => sum + Number(l.balance), 0);
    if (totalBalance === 0) return [];

    return listings
      .filter(l => Number(l.balance) > 0)
      .slice(0, 5)
      .map(listing => ({
        name: truncateAddress(listing.objectId, 4),
        value: Number(listing.balance) / 1_000_000_000,
        percentage: ((Number(listing.balance) / totalBalance) * 100).toFixed(1),
      }));
  }, [listings]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!listings) return { totalRevenue: 0, totalRentals: 0, avgPrice: 0 };
    
    const totalRevenue = listings.reduce((sum, l) => sum + Number(l.balance), 0) / 1_000_000_000;
    const totalRentals = listings.reduce((sum, l) => sum + Number(l.activeRentals), 0);
    const avgPrice = listings.length > 0 
      ? listings.reduce((sum, l) => sum + Number(l.currentPrice), 0) / listings.length / 1_000_000_000
      : 0;

    return { totalRevenue, totalRentals, avgPrice };
  }, [listings]);

  const isLoading = listingsLoading || eventsLoading;

  if (isLoading) {
    return (
      <Card className={`ghost-card ${className}`}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!listings || listings.length === 0) {
    return (
      <Card className={`ghost-card ${className}`}>
        <CardContent className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No listings yet. Create your first listing to see analytics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Card className="ghost-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Revenue Analytics
          </CardTitle>
          <CardDescription>
            Track your earnings and rental performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-primary/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Balance</p>
              <p className="text-xl font-bold text-primary">{stats.totalRevenue.toFixed(4)} SUI</p>
            </div>
            <div className="bg-primary/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Active Rentals</p>
              <p className="text-xl font-bold text-primary">{stats.totalRentals}</p>
            </div>
            <div className="bg-primary/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Avg Price</p>
              <p className="text-xl font-bold text-primary">{stats.avgPrice.toFixed(4)} SUI</p>
            </div>
          </div>

          {/* Charts */}
          <Tabs defaultValue="revenue" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="revenue" className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Revenue
              </TabsTrigger>
              <TabsTrigger value="rentals" className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                Rentals
              </TabsTrigger>
              <TabsTrigger value="distribution" className="flex items-center gap-1">
                <PieChartIcon className="h-4 w-4" />
                Distribution
              </TabsTrigger>
            </TabsList>

            <TabsContent value="revenue" className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(v) => `${v} SUI`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value.toFixed(4)} SUI`, 'Revenue']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="rentals" className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rentalsPerListing}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'rentals' ? value : `${value.toFixed(4)} SUI`,
                      name === 'rentals' ? 'Active Rentals' : 'Balance'
                    ]}
                  />
                  <Bar dataKey="rentals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="balance" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="distribution" className="h-[300px]">
              {revenueDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percentage }) => `${name} (${percentage}%)`}
                    >
                      {revenueDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(4)} SUI`, 'Balance']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-muted-foreground">No revenue data yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default RevenueChart;
