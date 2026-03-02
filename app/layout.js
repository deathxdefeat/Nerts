import "./globals.css";

export const metadata = {
  title: "NERTS - Card Battle",
  description: "The competitive card game",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
