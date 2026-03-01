export const BAND_COLORS = {
    "4000m": "45e0ff",
    "2200m": "ff4500",
    "600m": "1e90ff",
    "160m": "7cfc00",
    "80m": "e550e5",
    "60m": "00008b",
    "40m": "5959ff",
    "30m": "62d962",
    "20m": "f2c40c",
    "17m": "f2f261",
    "15m": "cca166",
    "12m": "b22222",
    "11m": "00ff00",
    "10m": "ff69b4",
    "8m": "7f00f1",
    "6m": "FF0000",
    "5m": "e0e0e0",
    "4m": "cc0044",
    "2m": "FF1493",
    "1.25m": "CCFF00",
    "70cm": "999900",
    "23cm": "5AB8C7",
    "2.4Ghz": "FF7F50",
    "10Ghz": "696969",
    "uhf": "FF9393",
    "vlf": "FF8300",
    "vhf/uhf": "FF1493",
    "unknown": "808080"
};

let bandmap = [];

/**
 * Initializes the band map from raw data.
 * @param {Array} rawBandmap Array of [band, max, ...] arrays.
 */
export function initBandmap(rawBandmap) {
    if (!rawBandmap || !Array.isArray(rawBandmap)) return;

    bandmap = rawBandmap.map(rbme => ({
        band: rbme[0],
        max: rbme[1]
    }));
    bandmap.push({ "band": "vhf/uhf", "max": 40000000000 });
}

/**
 * Gets the band name for a given frequency.
 * @param {number} freq Frequency in Hz.
 * @returns {string} Band name.
 */
export function getBand(freq) {
    if (freq == null) return "unknown";

    for (let i = 0; i < bandmap.length; i++) {
        if (freq < bandmap[i].max) {
            return bandmap[i].band;
        }
    }
    return "uhf";
}

/**
 * Gets the color for a given band.
 * @param {string} band Band name.
 * @returns {string} Hex color (without #).
 */
export function getColorForBand(band) {
    return BAND_COLORS[band] || BAND_COLORS["unknown"];
}

/**
 * Gets the color for a given frequency.
 * @param {number} freq Frequency in Hz.
 * @returns {string} Hex color (without #).
 */
export function getColorForFreq(freq) {
    const band = getBand(freq);
    return getColorForBand(band);
}
