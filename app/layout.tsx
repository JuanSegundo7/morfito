import type React from "react";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { geistMono, pacifico } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morfito",
  description: "Sistema de gestión de operaciones para restaurantes",
  generator: "v0.app",
  icons: {
    icon: "/placeholder-logo.png",
    apple: "/placeholder-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${geistMono.variable} ${pacifico.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Tema aplicado antes del primer paint. El provider anterior seteaba
            la clase en un useEffect, lo que flasheaba claro-sobre-oscuro en
            cada carga. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t!=='light')}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans antialiased min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
