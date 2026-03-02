import "./globals.css";
import { Sora, Space_Mono } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
});

export const metadata = {
  metadataBase: new URL("https://nerts-phi.vercel.app"),
  title: "NERTS - Card Battle",
  description: "Fast multiplayer solitaire race with classic and Rook decks.",
  applicationName: "Nerts",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Nerts",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1f35",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${spaceMono.variable}`}>{children}</body>
    </html>
  );
}
