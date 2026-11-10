# Playfair Display

Unmodified variable font files from the official Google Fonts repository:
https://github.com/google/fonts/tree/main/ofl/playfairdisplay

- `PlayfairDisplay-Regular.ttf`: upstream `PlayfairDisplay[wght].ttf`, Git blob `7a09eb71f10622fd083134ac9ed46f59b21bee18`.
- `PlayfairDisplay-Italic.ttf`: upstream `PlayfairDisplay-Italic[wght].ttf`, Git blob `94fae1f2853dd325b1a3602370780d154ffc8c89`.
- `OFL.txt`: upstream SIL Open Font License, Git blob `13153890847ba9bde8a852596d1515261156e474`.

Both files contain the complete upstream character set, including Czech and Vietnamese.
The root layout uses `next/font/local`, retains `--font-playfair` and the existing normal
and italic weights 400–600, and avoids the failing Turbopack Google Fonts URL resolver.
No external Playfair download is needed during deployment builds or page visits.
