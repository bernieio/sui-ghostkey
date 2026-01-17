/**
 * Listing Card Component
 * Displays a marketplace listing in grid view
 */

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Users, FileCode, FileText, Image, Database, Sparkles } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ListingWithMeta } from '@/types/marketplace';
import { formatSui, truncateAddress } from '@/config/sui';

interface ListingCardProps {
  listing: ListingWithMeta;
  index?: number;
}

const getMimeIcon = (mimeType: string) => {
  if (mimeType.includes('image')) return Image;
  if (mimeType.includes('json') || mimeType.includes('code')) return FileCode;
  if (mimeType.includes('text')) return FileText;
  return Database;
};

const getCategory = (mimeType: string): string => {
  if (mimeType.includes('image')) return 'Image';
  if (mimeType.includes('json')) return 'Dataset';
  if (mimeType.includes('markdown') || mimeType.includes('text/plain')) return 'AI Prompt';
  if (mimeType.includes('pdf')) return 'Document';
  return 'Digital Asset';
};

export function ListingCard({ listing, index = 0 }: ListingCardProps) {
  const Icon = getMimeIcon(listing.mimeType);
  const category = getCategory(listing.mimeType);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link to={`/listing/${listing.objectId}`}>
        <Card className="ghost-card group cursor-pointer overflow-hidden h-full">
          {/* Preview Area */}
          <div className="relative aspect-[4/3] bg-gradient-to-br from-ghost-surface to-ghost-dark flex items-center justify-center overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-primary/30 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            </div>
            
            {/* Icon */}
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="relative z-10"
            >
              <div className="p-6 rounded-2xl bg-ghost-surface-elevated border border-border group-hover:border-primary/50 transition-colors">
                <Icon className="h-12 w-12 text-primary" />
              </div>
            </motion.div>
            
            {/* Category Badge */}
            <Badge 
              variant="secondary" 
              className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm border-border"
            >
              {category}
            </Badge>
            
            {/* Status Badge */}
            {listing.isActive ? (
              <Badge className="absolute top-3 right-3 bg-primary/20 text-primary border-primary/30 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="absolute top-3 right-3 bg-muted/80 backdrop-blur-sm">
                Paused
              </Badge>
            )}
          </div>
          
          <CardContent className="p-4">
            {/* Title - using listing ID as placeholder */}
            <h3 className="font-semibold text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
              {category} #{listing.objectId.slice(0, 8)}
            </h3>
            
            {/* Creator */}
            <p className="text-sm text-muted-foreground font-mono">
              by {truncateAddress(listing.seller)}
            </p>
          </CardContent>
          
          <CardFooter className="p-4 pt-0 flex items-center justify-between">
            {/* Price */}
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Price/hour</span>
              <span className="font-bold text-primary">
                {formatSui(listing.currentPrice)} SUI
              </span>
            </div>
            
            {/* Stats */}
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="flex items-center gap-1 text-sm">
                <Users className="h-4 w-4" />
                <span>{listing.activeRentals.toString()}</span>
              </div>
            </div>
          </CardFooter>
        </Card>
      </Link>
    </motion.div>
  );
}

export default ListingCard;
