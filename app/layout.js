import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "TitikBola - Streaming Bola Live HD Gratis",
  description: "Platform streaming pertandingan sepak bola live dengan kualitas HD. Gratis tanpa registrasi, zero buffering, multi device support.",
  keywords: "streaming bola, pertandingan bola, live bola, hd quality, titiksports",
  authors: [{ name: "TitikBola Team", url: "https://titiksports.com" }],
  openGraph: {
    title: "TitikBola - Streaming Bola Live HD Gratis",
    description: "Nonton pertandingan sepak bola live dengan kualitas HD tanpa buffering",
    url: "https://titiksports.com",
    siteName: "TitikBola",
    images: [
      {
        url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=630",
        width: 1200,
        height: 630,
        alt: "TitikBola - Streaming Bola Live",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TitikBola - Streaming Bola Live HD Gratis",
    description: "Platform streaming pertandingan bola live HD gratis",
    images: ["https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&h=630"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
