/**
 * Browser polyfills for Node.js modules
 * Required by Lit Protocol SDK and ethers
 */

import { Buffer } from 'buffer';
import process from 'process';

// Make Buffer available globally
(window as any).Buffer = Buffer;
(window as any).global = window;
(window as any).process = process;

export {};
