import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revision Studio",
  description: "A private, local study space for your IB revision.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
