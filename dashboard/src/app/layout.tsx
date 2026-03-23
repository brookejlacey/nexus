import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

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
    <html lang="en" className={`dark ${plexSans.variable} ${plexMono.variable}`}>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
