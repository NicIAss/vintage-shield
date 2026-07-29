import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    title: {
      default: "Vintage Shield — Community Ban Register",
      template: "%s — Vintage Shield",
    },
    description:
      "A transparent, review-based public ban register for the Vintage Story server admin community.",
    applicationName: "Vintage Shield",
    keywords: [
      "Vintage Story",
      "server administration",
      "community ban list",
      "moderation",
    ],
    openGraph: {
      title: "Vintage Shield — Shared intelligence for safer servers",
      description:
        "Review community reports, copy server-ready ban commands, and export a native Vintage Story ban list.",
      type: "website",
      siteName: "Vintage Shield",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Vintage Shield — Shared intelligence. Calmer servers.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Vintage Shield — Community Ban Register",
      description:
        "A review-based public ban register for Vintage Story server admins.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
