/** Pricing plans shown on the website. Change prices and limits here only. Prices in USD. */
import { msg } from "../i18n";

export interface Plan {
  id: string;
  name: string; // translated with t() where shown
  monthly: number; // price per month, billed monthly
  yearly: number; // price per month, billed yearly
  blurb: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: msg("Free"),
    monthly: 0,
    yearly: 0,
    blurb: msg("Try Twapza on your own videos."),
    features: [
      msg("60 minutes of video per month"),
      msg("AI highlights and simple clips"),
      msg("Animated captions in any language"),
      msg("1080p downloads with a small watermark"),
    ],
  },
  {
    id: "creator",
    name: msg("Creator"),
    monthly: 15,
    yearly: 12,
    blurb: msg("For creators who post Shorts every week."),
    features: [
      msg("300 minutes of video per month"),
      msg("No watermark"),
      msg("Clip editor: hook text, your own texts, caption fixes"),
      msg("AI titles, descriptions and hashtags"),
      msg("Cut pauses, filler words and cold open"),
    ],
    popular: true,
  },
  {
    id: "pro",
    name: msg("Pro"),
    monthly: 29,
    yearly: 23,
    blurb: msg("For daily posters, podcasters and clippers."),
    features: [
      msg("1,200 minutes of video per month"),
      msg("Everything in Creator"),
      msg("Videos up to 3 hours"),
      msg("Priority rendering"),
      msg("Download all clips at once"),
    ],
  },
];

export function price(amount: number, lang: string): string {
  return new Intl.NumberFormat(lang, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}
