import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Space_Mono, Urbanist } from "next/font/google";
import "./globals.css";
import { getSiteData } from "@/lib/site/load";
import { SiteDataProvider } from "@/components/providers/SiteDataProvider";
import { ClockProvider } from "@/components/providers/ClockProvider";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { TopBar } from "@/components/layout/TopBar";
import { Dock } from "@/components/layout/Dock";
import { Footer } from "@/components/layout/Footer";
import { EasterEgg } from "@/components/layout/EasterEgg";

const urbanist = Urbanist({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-urbanist", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteData();
  const title = `${settings.name} | Weekend AI Event Series by ${settings.organizer.short}`;
  return {
    metadataBase: new URL(settings.siteUrl),
    title: { default: title, template: `%s | ${settings.name}` },
    description: settings.description,
    applicationName: settings.name,
    keywords: ["AI", "machine learning", "workshop", "hackathon", "IEEE", "College of Engineering Kidangoor", "Kottayam", "Kerala", "students"],
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: settings.name, title, description: settings.description, url: "/", locale: "en_IN" },
    twitter: { card: "summary_large_image", title, description: settings.description },
    appleWebApp: { capable: true, title: settings.name, statusBarStyle: "default" },
  };
}

// Every page renders per request (Supabase data + clock), never at build time.
export const dynamic = "force-dynamic";

// Request-time clock for the server HTML. The client swaps to the live clock
// right after hydration (see ClockProvider), so statuses stay current.
const requestTime = () => Date.now();

export const viewport: Viewport = {
  themeColor: "#F4EFE6",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

// Before paint: enables reveal styles only when JS runs.
const bootScript = `document.documentElement.classList.add('js');`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const data = await getSiteData();
  return (
    <html lang="en-IN" className={`${urbanist.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteDataProvider data={data}>
          <ClockProvider initialNow={requestTime()}>
            <TopBar />
            <main id="main" tabIndex={-1} className="outline-none">
              {children}
            </main>
            <Footer />
            <Dock />
          </ClockProvider>
        </SiteDataProvider>
        <MotionProvider />
        <EasterEgg />
        {data.settings.gaId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${data.settings.gaId}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${data.settings.gaId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
