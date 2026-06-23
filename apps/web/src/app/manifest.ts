import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Forkd",
    short_name: "Forkd",
    description: "Family restaurant tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Share Target: lets the installed PWA appear in the OS share sheet so a shared
    // TikTok/IG/YouTube link opens /import and starts a social import. (Android/Chrome;
    // iOS Safari doesn't support Web Share Target.)
    share_target: {
      action: "/import",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
