/**
 * GhostKey Marketplace - Index Page
 * Main landing with hero and marketplace grid
 */

import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { MarketplaceGrid } from '@/components/MarketplaceGrid';
import { Footer } from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <MarketplaceGrid />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
