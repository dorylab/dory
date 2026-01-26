import localFont from "next/font/local"

import { cn } from "@/lib/utils"

const fontSans = localFont({
  src: [
    {
      path: "../public/fonts/geist-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
})

const fontMono = localFont({
  src: [
    {
      path: "../public/fonts/geist-mono-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-mono",
  display: "swap",
})

const fontInstrument = localFont({
  src: [
    {
      path: "../public/fonts/instrument-sans-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-instrument",
  display: "swap",
})

const fontNotoMono = localFont({
  src: [
    {
      path: "../public/fonts/noto-sans-mono-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-noto-mono",
  display: "swap",
})

const fontMullish = localFont({
  src: [
    {
      path: "../public/fonts/mulish-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-mullish",
  display: "swap",
})

const fontInter = localFont({
  src: [
    {
      path: "../public/fonts/inter-400.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
})

export const fontVariables = cn(
  fontSans.variable,
  fontMono.variable,
  fontInstrument.variable,
  fontNotoMono.variable,
  fontMullish.variable,
  fontInter.variable
)
