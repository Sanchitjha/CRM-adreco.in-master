import type { MetadataRoute } from "next";

/**
 * What a phone needs to put the CRM on its home screen: on Android, "Install app" or "Add to Home screen" in Chrome;
 * on an iPhone, Share, then "Add to Home Screen" in Safari. It then opens full screen, with its own icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adreco CRM",
    short_name: "Adreco CRM",
    description: "Leads, quotations, installations, warranty and service for Adreco heat pumps.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7fa",
    theme_color: "#0d9488",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
