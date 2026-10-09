import localFont from "next/font/local";

/**
 * DESIGN_v2 3.4: Onest 400/600 (interface) + Cormorant Garamond 600 (display, only ≥ 20 px).
 * Local copies of the designer's woff2 subsets (Kazakh + Russian + Latin; 18/18 Kazakh letters checked).
 * No Google Fonts (Ф1 brief).
 */
export const onest = localFont({
  src: [
    { path: "./fonts/onest-400-kk.woff2", weight: "400", style: "normal" },
    { path: "./fonts/onest-600-kk.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
});

export const cormorant = localFont({
  src: [{ path: "./fonts/cormorant-garamond-600-kk.woff2", weight: "600", style: "normal" }],
  variable: "--font-cormorant",
  display: "swap",
});
