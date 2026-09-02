import type { WebsiteMediaSlot } from "@/lib/website/types";

export interface MediaSlotSpec {
  slot: WebsiteMediaSlot;
  title: string;
  description: string;
  recommendedWidth: number;
  recommendedHeight: number;
  aspectRatio: string;
  formats: string[];
  maxSizeMb: number;
  kind: "image" | "video";
}

export const WEBSITE_MEDIA_SLOTS: MediaSlotSpec[] = [
  {
    slot: "logo",
    title: "Restaurant logo",
    description: "Used in navigation, hero, and footer.",
    recommendedWidth: 800,
    recommendedHeight: 800,
    aspectRatio: "1:1",
    formats: ["PNG", "SVG", "WEBP"],
    maxSizeMb: 5,
    kind: "image",
  },
  {
    slot: "hero_image",
    title: "Hero image",
    description: "Full-screen hero background when no hero video is set.",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    aspectRatio: "16:9",
    formats: ["JPG", "WEBP"],
    maxSizeMb: 15,
    kind: "image",
  },
  {
    slot: "hero_video",
    title: "Hero video",
    description: "Cinematic background video for the homepage hero.",
    recommendedWidth: 1920,
    recommendedHeight: 1080,
    aspectRatio: "16:9",
    formats: ["MP4", "WEBM"],
    maxSizeMb: 100,
    kind: "video",
  },
  {
    slot: "about_image",
    title: "About image",
    description: "Editorial image for the restaurant introduction section.",
    recommendedWidth: 1200,
    recommendedHeight: 1600,
    aspectRatio: "3:4",
    formats: ["JPG", "WEBP"],
    maxSizeMb: 12,
    kind: "image",
  },
  {
    slot: "signature_1",
    title: "Signature dish 1",
    description: "Featured signature food photography.",
    recommendedWidth: 1200,
    recommendedHeight: 1200,
    aspectRatio: "1:1",
    formats: ["JPG", "WEBP"],
    maxSizeMb: 10,
    kind: "image",
  },
  {
    slot: "signature_2",
    title: "Signature dish 2",
    description: "Second signature dish highlight.",
    recommendedWidth: 1200,
    recommendedHeight: 1200,
    aspectRatio: "1:1",
    formats: ["JPG", "WEBP"],
    maxSizeMb: 10,
    kind: "image",
  },
  {
    slot: "signature_3",
    title: "Signature dish 3",
    description: "Third signature dish highlight.",
    recommendedWidth: 1200,
    recommendedHeight: 1200,
    aspectRatio: "1:1",
    formats: ["JPG", "WEBP"],
    maxSizeMb: 10,
    kind: "image",
  },
];

export const GALLERY_IMAGE_SPEC = {
  recommendedWidth: 1600,
  recommendedHeight: 1200,
  aspectRatio: "4:3",
  formats: ["JPG", "WEBP"],
  maxSizeMb: 12,
};
