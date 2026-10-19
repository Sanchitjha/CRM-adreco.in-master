import type { Metadata } from "next";
import Script from "next/script";
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

export const metadata: Metadata = {
  title: "Adreco CRM",
  description: "Internal sales CRM for Adreco Engineering Pvt Ltd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const widgetCode = process.env.NEXT_PUBLIC_ZOHO_SALESIQ_WIDGET_CODE;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        {widgetCode && (
          <Script id="zoho-salesiq-chat" strategy="afterInteractive">
            {`
              var $zoho=$zoho || {};$zoho.salesiq = $zoho.salesiq || {widgetcode:"${widgetCode}", values:{},ready:function(){}};
              var d=document;s=d.createElement("script");s.type="text/javascript";s.id="zsiqscript";s.defer=true;
              s.src="https://salesiq.zohopublic.in/visitor/v2/channels?widgetcode=${widgetCode}";
              t=d.getElementsByTagName("script")[0];t.parentNode.insertBefore(s,t);
            `}
          </Script>
        )}
      </body>
    </html>
  );
}
