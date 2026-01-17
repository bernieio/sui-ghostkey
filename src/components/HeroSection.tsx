/**
 * Hero Section for GhostKey Landing
 * Animated showcase of the platform
 */

import { motion } from 'framer-motion';
import { ArrowRight, Shield, Zap, Lock, Coins } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import logo from '@/assets/phunhuanbuilder-logo.png';

const features = [
  {
    icon: Shield,
    title: 'Fully Decentralized',
    description: 'No servers, no middlemen. Your content stays encrypted on Walrus.',
  },
  {
    icon: Lock,
    title: 'Lit Protocol Encryption',
    description: 'Threshold cryptography ensures only paying users can decrypt.',
  },
  {
    icon: Coins,
    title: 'Dynamic Pricing',
    description: 'Bonding curve adjusts prices based on demand automatically.',
  },
  {
    icon: Zap,
    title: 'Instant Access',
    description: 'AccessPass NFTs grant immediate decryption rights.',
  },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <div className="container relative px-4">
        <div className="mx-auto max-w-4xl text-center">
          {/* Logo Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ghost-surface border border-border"
          >
            <img src={logo} alt="Phú Nhuận Builder" className="h-6 w-auto" />
            <span className="text-sm text-muted-foreground">by Phú Nhuận Builder</span>
          </motion.div>

          {/* Main Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            <span className="ghost-gradient-text">GhostKey</span>
            <br />
            <span className="text-foreground">Decentralized AI Marketplace</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Rent AI prompts, datasets, and digital assets with time-limited access. 
            Encrypted on Walrus, secured by Lit Protocol, powered by Sui blockchain.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <Button asChild size="lg" className="ghost-button-primary px-8 group">
              <Link to="/upload">
                Start Selling
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="px-8 border-primary/30 hover:bg-primary/10 hover:border-primary/50">
              <Link to="/">
                Explore Marketplace
              </Link>
            </Button>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="group p-6 rounded-xl bg-ghost-surface border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="mb-4 p-3 w-fit rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
