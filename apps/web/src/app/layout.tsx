import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppHeader } from '@/components/AppHeader';
import { Providers } from './providers';
import { getEnv } from '@/server/env';
import { en } from '@/i18n/en';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

/**
 * The app-shell fallback for wizard routes. `/` and `/docs` export their own —
 * they are the two routes that get shared as links and need real titles and
 * card images. `metadataBase` is what makes those relative image paths resolve
 * to absolute URLs instead of being rebased onto localhost.
 */
export const metadata: Metadata = {
  metadataBase: new URL(getEnv().MCPGEN_PUBLIC_URL),
  title: en.appName,
  description: en.appTagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        {/* Runs before first paint. Without it a dark-theme user gets a white flash on
            every navigation, because the class can only be applied once React hydrates.
            Inline and synchronous is the only thing that happens early enough; it reads
            the same key ThemeToggle writes and is deliberately tiny. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mcpgen-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
          Skip to content
        </a>
        <AppHeader />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
