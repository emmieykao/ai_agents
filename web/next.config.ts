import type { NextConfig } from 'next';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load repo-root .env so web shares the same API key as the CLI.
loadDotenv({ path: path.join(__dirname, '..', '.env') });
loadDotenv({ path: path.join(__dirname, '.env.local'), override: true });

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  serverExternalPackages: ['pdf-lib', 'unpdf'],
  webpack: (config) => {
    // Shared src/ uses Node ESM ".js" imports; map them to .ts for Next bundling.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
