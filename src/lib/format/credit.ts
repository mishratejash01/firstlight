/**
 * Picture libraries as their names are written, not as the picture search
 * records them ("via wikimedia_commons").
 */
const LIBRARY_NAMES: Record<string, string> = {
  wikimedia_commons: "Wikimedia Commons",
  wikimedia: "Wikimedia Commons",
  flickr: "Flickr",
  rawpixel: "rawpixel",
  geographorguk: "Geograph",
  pexels: "Pexels",
  openstreetmap: "OpenStreetMap",
};

export function readableCredit(credit: string): string {
  return credit.replace(/ via ([a-z_]+)$/, (whole, key: string) =>
    LIBRARY_NAMES[key] ? ` via ${LIBRARY_NAMES[key]}` : whole,
  );
}
