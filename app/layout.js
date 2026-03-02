import "./globals.css";

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
  themeColor: "#8d3f0f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
