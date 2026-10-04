import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Space_Mono, Urbanist } from "next/font/google";
import "./globals.css";
import { event } from "@/data/event";
import { ClockProvider } from "@/components/providers/ClockProvider";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { TopBar } from "@/components/layout/TopBar";
import { Dock } from "@/components/layout/Dock";
import { Footer } from "@/components/layout/Footer";
import { EasterEgg } from "@/components/layout/EasterEgg";

const urbanist = Urbanist({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-urbanist", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });

const title = "st(AI)rway | Weekend AI Event Series by IEEE SB CEK";

// Render-time clock for the server HTML. The client swaps to the live clock
// right after hydration (see ClockProvider), so statuses never go stale.
const SERVER_NOW = Date.now();

export const metadata: Metadata = {
  metadataBase: new URL(event.siteUrl),
  title: { default: title, template: "%s | st(AI)rway" },
  description: event.description,
  applicationName: "st(AI)rway",
  keywords: ["AI", "machine learning", "workshop", "hackathon", "IEEE", "College of Engineering Kidangoor", "Kottayam", "Kerala", "students"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "st(AI)rway", title, description: event.description, url: "/", locale: "en_IN" },
  twitter: { card: "summary_large_image", title, description: event.description },
  appleWebApp: { capable: true, title: "st(AI)rway", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F4EFE6",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

// Before paint: enables reveal styles only when JS runs.
const bootScript = `document.documentElement.classList.add('js');`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${urbanist.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <ClockProvider initialNow={SERVER_NOW}>
          <TopBar />
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <Footer />
          <Dock />
        </ClockProvider>
        <MotionProvider />
        <EasterEgg />
        {event.gaId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${event.gaId}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${event.gaId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
