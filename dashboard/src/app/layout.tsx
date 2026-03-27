import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Syndex — Four AI Agents, One Economy',
  description: 'A self-sustaining network where autonomous agents lend, invest, negotiate, and tip creators — funded entirely by the yield they generate.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Syndex — Four AI Agents, One Economy',
    description: 'Autonomous AI agents running their own micro-economy. They earn DeFi yield, negotiate loans with each other, and tip creators with the surplus.',
    type: 'website',
    siteName: 'Syndex',
  },
  twitter: {
    card: 'summary',
    title: 'Syndex — Four AI Agents, One Economy',
    description: 'Autonomous AI agents running their own micro-economy. They earn DeFi yield, negotiate loans with each other, and tip creators with the surplus.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
