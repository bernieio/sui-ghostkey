/**
 * GhostKey Footer
 * With links and branding
 */

import { Link } from 'react-router-dom';
import { Github, Twitter, ExternalLink } from 'lucide-react';
import logo from '@/assets/phunhuanbuilder-logo.png';

const links = {
  product: [
    { label: 'Marketplace', href: '/' },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Upload', href: '/upload' },
    { label: 'About', href: '/about' },
  ],
  resources: [
    { label: 'Sui Blockchain', href: 'https://sui.io', external: true },
    { label: 'Lit Protocol', href: 'https://litprotocol.com', external: true },
    { label: 'Walrus Storage', href: 'https://walrus.xyz', external: true },
  ],
  social: [
    { icon: Github, href: 'https://github.com/phunhuanbuilder', label: 'GitHub' },
    { icon: Twitter, href: 'https://twitter.com/phunhuanbuilder', label: 'Twitter' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-ghost-surface/50">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-4">
              <img src={logo} alt="Phú Nhuận Builder" className="h-10 w-auto" />
              <div className="flex flex-col">
                <span className="text-lg font-bold ghost-gradient-text">GhostKey</span>
                <span className="text-xs text-muted-foreground">by Phú Nhuận Builder</span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Decentralized marketplace for AI prompts and digital assets. 
              Encrypted storage, time-limited access, trustless transactions.
            </p>
            <div className="flex items-center gap-4">
              {links.social.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-ghost-surface-elevated border border-border hover:border-primary/50 hover:text-primary transition-colors"
                    aria-label={social.label}
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Product</h4>
            <ul className="space-y-2">
              {links.product.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Resources</h4>
            <ul className="space-y-2">
              {links.resources.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 Phú Nhuận Builder. Built for Sui Hackathon.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Deployed on</span>
            <a 
              href="https://testnet.suivision.xyz/package/0x2aa4851e0a844e82880968c26c559e637ec475ffa9375318dae1f3a330d3075c"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary hover:underline"
            >
              Sui Testnet
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
