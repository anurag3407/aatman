// Renders the app icons from an inline SVG. Run: node scripts/make-icons.mjs
// A soft leaf on sage: calm, and deliberately not a "mental health" symbol.
import sharp from "sharp";

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#5b7b63"/>
  <g transform="translate(256 256) scale(${pad ? 0.72 : 1}) translate(-256 -256)">
    <path d="M256 104c-88 64-128 136-112 208 12 54 56 92 112 96 56-4 100-42 112-96 16-72-24-144-112-208z" fill="#e4ece4"/>
    <path d="M256 168v232" stroke="#5b7b63" stroke-width="14" stroke-linecap="round"/>
  </g>
</svg>`;

const out = [
  ["public/icon-192.png", 192, false],
  ["public/icon-512.png", 512, false],
  ["public/icon-512-maskable.png", 512, true],
  ["src/app/icon.png", 64, false],
  ["src/app/apple-icon.png", 180, true],
];

for (const [file, size, maskable] of out) {
  await sharp(Buffer.from(svg(maskable))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
