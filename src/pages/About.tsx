/**
 * About Page - GhostKey Information
 * How it works, tech stack, and team info
 */

import { motion } from 'framer-motion';
import { 
  Shield, 
  Lock, 
  Database, 
  Clock, 
  Upload, 
  Key, 
  Eye, 
  Coins,
  ExternalLink,
  Github,
  Twitter,
  Zap,
  Users,
  Globe
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import logo from '@/assets/phunhuanbuilder-logo.png';

const steps = [
  {
    icon: Upload,
    title: 'Upload & Encrypt',
    description: 'Upload your AI prompts, datasets, or digital content. Files are encrypted client-side using AES-256-GCM before leaving your browser.',
  },
  {
    icon: Database,
    title: 'Decentralized Storage',
    description: 'Encrypted content is stored on Walrus, a decentralized storage network. Only the encrypted blob is public - content remains private.',
  },
  {
    icon: Key,
    title: 'Access Control',
    description: 'Lit Protocol manages encryption keys with on-chain access conditions. Keys are only released to users with valid AccessPass NFTs.',
  },
  {
    icon: Eye,
    title: 'Time-Limited Access',
    description: 'Buyers rent access for specific durations. AccessPass NFTs expire automatically, enforcing time-limited viewing windows.',
  },
];

const techStack = [
  {
    name: 'Sui Blockchain',
    description: 'Fast, secure smart contracts for marketplace logic and AccessPass NFTs',
    icon: '⚡',
    link: 'https://sui.io',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  },
  {
    name: 'Lit Protocol',
    description: 'Decentralized key management and access control',
    icon: '🔐',
    link: 'https://litprotocol.com',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
  },
  {
    name: 'Walrus Storage',
    description: 'Decentralized blob storage for encrypted content',
    icon: '🦭',
    link: 'https://walrus.xyz',
    color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
  },
];

const features = [
  {
    icon: Shield,
    title: 'Trustless Transactions',
    description: 'Smart contracts handle payments and access without intermediaries',
  },
  {
    icon: Lock,
    title: 'Client-Side Encryption',
    description: 'Content never leaves your browser unencrypted',
  },
  {
    icon: Clock,
    title: 'Dynamic Pricing',
    description: 'Bonding curve adjusts prices based on demand',
  },
  {
    icon: Coins,
    title: 'Instant Payments',
    description: 'Sellers withdraw earnings anytime via Sui',
  },
];

const faqs = [
  {
    question: 'How is my content protected?',
    answer: 'Content is encrypted using AES-256-GCM encryption before upload. The encryption key is protected by Lit Protocol and only released when a user proves ownership of a valid AccessPass NFT.',
  },
  {
    question: 'What happens when access expires?',
    answer: 'AccessPass NFTs have an expiry timestamp. Once expired, Lit Protocol will no longer release decryption keys, effectively revoking access. The smart contract also tracks active rentals for accurate pricing.',
  },
  {
    question: 'Can content be pirated?',
    answer: 'While no DRM is perfect, GhostKey implements multiple protections: 60-second viewing windows, watermarking, no download buttons, and audit trails via blockchain events. Content is never stored unencrypted.',
  },
  {
    question: 'What files can I upload?',
    answer: 'Currently supported: text files (TXT, MD), JSON, images (PNG, JPG, WEBP), and PDFs. Maximum file size is 100MB. More formats coming soon.',
  },
  {
    question: 'How does dynamic pricing work?',
    answer: 'Price = Base Price + (Active Rentals × Price Slope). As more users rent access, the price increases. When rentals expire, the price decreases. This creates fair market-driven pricing.',
  },
];

const About = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
          <div className="container px-4 relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-3xl mx-auto"
            >
              <Badge variant="outline" className="mb-4 border-primary/50">
                <Zap className="h-3 w-3 mr-1" />
                Built for Sui Hackathon
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="ghost-gradient-text">GhostKey</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Decentralized marketplace for AI prompts and digital assets.
                Encrypted storage, time-limited access, trustless transactions.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button asChild size="lg" className="ghost-button-primary">
                  <Link to="/">
                    <Globe className="h-4 w-4 mr-2" />
                    Explore Marketplace
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/upload">
                    <Upload className="h-4 w-4 mr-2" />
                    Create Listing
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 bg-ghost-surface/30">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                From upload to access, every step is secured by blockchain and cryptography
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={step.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="ghost-card h-full relative">
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{index + 1}</span>
                      </div>
                      <CardHeader>
                        <div className="p-3 rounded-xl bg-primary/10 w-fit mb-2">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-lg">{step.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Technology Stack */}
        <section className="py-16">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Technology Stack</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Built on cutting-edge decentralized infrastructure
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {techStack.map((tech, index) => (
                <motion.a
                  key={tech.name}
                  href={tech.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="block"
                >
                  <Card className="ghost-card h-full hover:border-primary/50 transition-colors group">
                    <CardHeader className="text-center">
                      <div className="text-4xl mb-2">{tech.icon}</div>
                      <CardTitle className="flex items-center justify-center gap-2">
                        {tech.name}
                        <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground text-center">{tech.description}</p>
                    </CardContent>
                  </Card>
                </motion.a>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 bg-ghost-surface/30">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Key Features</h2>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="text-center"
                  >
                    <div className="p-4 rounded-2xl bg-primary/10 w-fit mx-auto mb-4">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="py-16">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto"
            >
              <div className="flex justify-center mb-6">
                <img src={logo} alt="Phú Nhuận Builder" className="h-20 w-auto" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Built by Phú Nhuận Builder</h2>
              <p className="text-muted-foreground mb-8">
                We're a team of developers passionate about Web3 and decentralized technologies.
                GhostKey was built for the Sui Hackathon to demonstrate the potential of 
                combining Sui's fast blockchain with Lit Protocol's decentralized access control.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="outline" size="lg" asChild>
                  <a href="https://github.com/phunhuanbuilder" target="_blank" rel="noopener noreferrer">
                    <Github className="h-5 w-5 mr-2" />
                    GitHub
                  </a>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href="https://twitter.com/phunhuanbuilder" target="_blank" rel="noopener noreferrer">
                    <Twitter className="h-5 w-5 mr-2" />
                    Twitter
                  </a>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-ghost-surface/30">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            </motion.div>

            <div className="max-w-3xl mx-auto space-y-4">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="ghost-card">
                    <CardHeader>
                      <CardTitle className="text-base">{faq.question}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{faq.answer}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto"
            >
              <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
              <p className="text-muted-foreground mb-8">
                Explore the marketplace or create your first listing today.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button asChild size="lg" className="ghost-button-primary">
                  <Link to="/">
                    Browse Listings
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/dashboard">
                    <Users className="h-4 w-4 mr-2" />
                    Creator Dashboard
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
