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
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/falcon-logo.svg", type: "image/svg+xml" }],
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
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
