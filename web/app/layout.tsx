import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Document Agent',
  description: 'Read documents and complete forms with AI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
