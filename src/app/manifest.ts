import type { MetadataRoute } from "next";

// Neutral name and description: the installed app's name appears on home screens and in settings.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aatman",
    short_name: "Aatman",
    description: "A quiet space to check in with yourself.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f0e5",
    theme_color: "#4f6d58",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
