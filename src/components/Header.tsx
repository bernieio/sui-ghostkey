/**
 * GhostKey Navigation Header
 * With wallet connection and navigation links
 */

import { Link, useLocation } from 'react-router-dom';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { motion } from 'framer-motion';
import { Menu, X, LayoutDashboard, Store, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import LitSessionIndicator from '@/components/LitSessionIndicator';
import logo from '@/assets/phunhuanbuilder-logo.png';

const navLinks = [
  { href: '/', label: 'Marketplace', icon: Store },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: Upload },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const account = useCurrentAccount();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="relative"
          >
            <img 
              src={logo} 
              alt="Phú Nhuận Builder" 
              className="h-10 w-auto"
            />
          </motion.div>
          <div className="hidden sm:flex flex-col">
            <span className="text-lg font-bold ghost-gradient-text">GhostKey</span>
            <span className="text-[10px] text-muted-foreground -mt-1">Decentralized AI Marketplace</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                {link.label}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-primary/10 rounded-lg border border-primary/30"
                    transition={{ type: 'spring', duration: 0.5 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Wallet Connection & Session */}
        <div className="flex items-center gap-3">
          {account && (
            <div className="hidden sm:block">
              <LitSessionIndicator />
            </div>
          )}
          <div className="hidden sm:block">
            <ConnectButton 
              connectText="Connect Wallet"
            />
          </div>
          
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="md:hidden border-t border-border bg-background p-4"
        >
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg
                    ${isActive 
                      ? 'bg-primary/10 text-primary border border-primary/30' 
                      : 'text-muted-foreground hover:bg-muted'
                    }
                  `}
                >
                  <Icon className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 pt-4 border-t border-border">
            <ConnectButton connectText="Connect Wallet" />
          </div>
        </motion.div>
      )}
    </header>
  );
}

export default Header;
