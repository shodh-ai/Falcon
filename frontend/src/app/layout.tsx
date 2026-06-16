import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { TenantProvider } from "@/context/TenantContext";
import { SWRProvider } from "@/components/providers/SWRProvider";

export const metadata: Metadata = {
  title: "Falcon | SGVU Campus OS",
  description:
    "Falcon — the premium Campus Operating System for Suresh Gyan Vihar University. Academics, HR, finance, hostel, and compliance in one workspace.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TenantProvider>
          <AuthProvider>
            <SWRProvider>{children}</SWRProvider>
          </AuthProvider>
        </TenantProvider>
        <Toaster
          position="top-center"
          closeButton={false}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: 'p-0 bg-transparent border-0 shadow-none',
            },
          }}
        />
      </body>
    </html>
  );
}
