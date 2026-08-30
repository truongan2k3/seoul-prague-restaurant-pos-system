export type PreloaderSlide = {
  /** Upper label — language name in wide tracking caps */
  lang: string;
  /** Main serif title — dish or concept in that language */
  title: string;
};

/** Seoul Prague Korean BBQ — multilingual intro sequence (intown.cz style). */
export const PRELOADER_SLIDES: PreloaderSlide[] = [
  { lang: "ENGLISH", title: "Korean BBQ" },
  { lang: "DEUTSCH", title: "Heißer Topf" },
  { lang: "ČEŠTINA", title: "Korejské BBQ" },
  { lang: "TIẾNG VIỆT", title: "Lẩu Hàn Quốc" },
  { lang: "한국어", title: "비빔밥 · Bibimbap" },
];
