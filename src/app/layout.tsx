import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "LinkSentry — Check a link before you click",
  description: "Review a URL's threat reputation, DNS, and hosting signals before opening it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}<Toaster position="top-right" richColors closeButton /></ThemeProvider></body></html>;
}
