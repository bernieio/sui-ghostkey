/**
 * Marketplace Grid Component
 * Displays all available listings with filtering
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search, Filter, Loader2, Ghost } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListingCard } from './ListingCard';
import { fetchListings } from '@/services/suiClient';
import type { ListingWithMeta } from '@/types/marketplace';

const categories = ['All', 'AI Prompt', 'Dataset', 'Code', 'Document', 'Image'];

export function MarketplaceGrid() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const { data: listings, isLoading, error } = useQuery({
    queryKey: ['listings'],
    queryFn: fetchListings,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Filter listings based on search and category
  const filteredListings = listings?.filter((listing) => {
    const matchesSearch = 
      listing.objectId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.seller.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedCategory === 'All') return matchesSearch;
    
    // Simple category matching based on mime type
    const mimeCategory = listing.mimeType.includes('image') ? 'Image' :
      listing.mimeType.includes('json') ? 'Dataset' :
      listing.mimeType.includes('text') ? 'AI Prompt' :
      listing.mimeType.includes('pdf') ? 'Document' : 'Other';
    
    return matchesSearch && mimeCategory === selectedCategory;
  }) || [];

  return (
    <section className="py-12">
      <div className="container px-4">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Marketplace
            </h2>
            <p className="text-muted-foreground">
              Browse and rent encrypted digital assets
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-ghost-surface border-border focus:border-primary"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className={selectedCategory === category 
                ? 'ghost-button-primary' 
                : 'border-border hover:border-primary/50'
              }
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading listings from Sui...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Ghost className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Failed to load listings
            </h3>
            <p className="text-muted-foreground max-w-md">
              Unable to fetch data from Sui testnet. Please check your connection and try again.
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredListings.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="p-6 rounded-2xl bg-ghost-surface border border-border mb-6">
              <Ghost className="h-16 w-16 text-primary animate-float" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchQuery || selectedCategory !== 'All' 
                ? 'No matching listings found' 
                : 'No listings yet'
              }
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              {searchQuery || selectedCategory !== 'All'
                ? 'Try adjusting your search or filters'
                : 'Be the first to upload encrypted content to the marketplace!'
              }
            </p>
            <Button asChild className="ghost-button-primary">
              <a href="/upload">Create First Listing</a>
            </Button>
          </motion.div>
        )}

        {/* Listings Grid */}
        {!isLoading && !error && filteredListings.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <Badge variant="secondary" className="bg-ghost-surface">
                {filteredListings.length} listing{filteredListings.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredListings.map((listing, index) => (
                <ListingCard 
                  key={listing.objectId} 
                  listing={listing} 
                  index={index}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default MarketplaceGrid;
