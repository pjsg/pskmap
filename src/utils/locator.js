/**
 * Converts a Maidenhead locator to a latitude and longitude.
 * @param {string} loc The Maidenhead locator (e.g., "FN42hn").
 * @returns {Array<number>|null} [longitude, latitude] or null if invalid.
 */
export function parseLocator(loc) {
    if (!loc || typeof loc !== 'string') return null;

    loc = loc.toUpperCase();
    const v = [
        { f: 1, v: 0 }, // Longitude
        { f: 1, v: 0 }  // Latitude
    ];

    for (let i = 0; i < loc.length; i++) {
        const ind = i & 1;
        const isNumeric = i & 2;
        const fac = isNumeric ? 10 : (i >= 4 ? 24 : 18);
        const base = isNumeric ? 48 : 65;
        const c = loc.charCodeAt(i);

        v[ind].f /= fac;
        v[ind].v += ((c - base) & 31) * v[ind].f;
    }

    for (let i = 0; i < 2; i++) {
        v[i].v += v[i].f / 2;
    }

    const lng = v[0].v * 360 - 180;
    const lat = v[1].v * 180 - 90;

    if (!isFinite(lat) || !isFinite(lng)) return null;
    return [lng, lat];
}
