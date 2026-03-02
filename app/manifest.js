export default function manifest() {
  return {
    name: "Nerts",
    short_name: "Nerts",
    description: "Fast multiplayer solitaire race with classic and Rook decks.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1f35",
    theme_color: "#0d1f35",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: "/apple-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
