import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Icon } from 'ol/style';

class MarkerManager {
    constructor() {
        this.markerSvg = {
            'worked': '<circle cx="1191" cy="713" fill="#000" r="171" stroke="#000" stroke-width="5"/>',
            'eqsl': '<text fill="#000" font-family="Serif" font-size="1600" text-anchor="middle" x="1175" y="1106">e</text>',
            'lotw': '<text fill="#000" font-family="Serif" font-size="950" text-anchor="middle" x="1211" y="1057">L</text>'
        };
        this.iconCache = new Map();
        this.globalScale = 1.0;
        this.showSNR = false;
        this.workedTimeout = 'none';
        this.sparklyMinutes = 10;
    }

    setGlobalScale(scale) {
        this.globalScale = scale;
        this.iconCache.clear();
    }

    setShowSNR(show) {
        if (this.showSNR !== show) {
            this.showSNR = show;
            this.iconCache.clear();
        }
    }

    setWorkedTimeout(timeout) {
        this.workedTimeout = timeout;
    }

    setSparklyMinutes(minutes) {
        this.sparklyMinutes = minutes;
    }

    formatColor(color) {
        if (!color) return 'red';
        if (typeof color !== 'string') return 'red';
        if (color.startsWith('#')) return color;
        if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(color)) return '#' + color;
        return color;
    }

    getSmallMarkerUri(color, marking, snr = null) {
        const fillColor = this.formatColor(color);
        let snrSvg = '';
        if (this.showSNR && snr != null) {
            snrSvg = `<text x="1800" y="1200" font-family="Arial" font-size="500" fill="#000" font-weight="bold">${snr}</text>`;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="600 400 2500 1300" height="24" width="46">
      <path fill="${fillColor}" stroke="#000" stroke-width="90" d="m1174,1873c-38-190-107-348-189-495-61-108-132-209-198-314-21-35-40-72-62-109-42-73-76-157-74-267,2-107,33-193,78-264,73-115,197-210,362-235,135-20,262,14,352,66,73,43,130,100,173,168,45,70,76,154,78,263,1,55-7,107-20,150-13,43-33,79-52,118-36,75-82,144-127,214-136,206-264,417-320,706z"/>
      ${this.markerSvg[marking] || ''}
      ${snrSvg}
    </svg>`;
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }

    getLargeMarkerUri(colors, snr = null) {
        let fill = colors.length === 1 ? this.formatColor(colors[0]) : 'url(#multiband)';
        let pattern = colors.length > 1 ? `<defs>${this.getColorDiagramPattern(colors)}</defs>` : '';
        let snrSvg = '';
        if (this.showSNR && snr != null) {
            snrSvg = `<text x="1800" y="1200" font-family="Arial" font-size="500" fill="#000" font-weight="bold">${snr}</text>`;
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="600 400 2500 1300" height="32" width="60">
      ${pattern}
      <path fill="${fill}" stroke="#000" stroke-width="90" d="m1174,1873c-38-190-107-348-189-495-61-108-132-209-198-314-21-35-40-72-62-109-42-73-76-157-74-267,2-107,33-193,78-264,73-115,197-210,362-235,135-20,262,14,352,66,73,43,130,100,173,168,45,70,76,154,78,263,1,55-7,107-20,150-13,43-33,79-52,118-36,75-82,144-127,214-136,206-264,417-320,706z"/>
      ${snrSvg}
    </svg>`;
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }

    getColorDiagramPattern(colors) {
        const nCols = colors.length;
        const angle = 2 * Math.PI / nCols;
        const center = 0.5;
        const hratio = 19 / 30;
        const sectors = [];

        for (let i = 0; i < nCols; i++) {
            const start = i * angle;
            const end = (i + 1) * angle;
            const d = [
                `M ${center} ${center * hratio}`,
                `L ${center + Math.sin(start)} ${(center + Math.cos(start)) * hratio}`,
                `A 1 ${hratio} 0 0 0 ${center + Math.sin(end)} ${(center + Math.cos(end)) * hratio}`,
                `Z`
            ].join(' ');
            sectors.push(`<path fill="${this.formatColor(colors[i])}" d="${d}" />`);
        }
        return `<pattern id="multiband" width="1" height="1" patternContentUnits="objectBoundingBox">${sectors.join('')}</pattern>`;
    }

    createMarkerFeature(pos, options = {}) {
        const feature = new Feature({
            geometry: new Point(pos),
            ...options.data
        });

        const color = options.color || 'red';
        const marking = options.marking || null;
        const isLarge = options.isLarge || false;
        const colors = Array.isArray(color) ? color : [color];
        const snr = options.data ? (options.data.sNR || options.data.snr) : null;

        // Sparkly logic
        let scale = this.globalScale;
        let opacity = options.opacity || 1;
        const timestamp = options.data ? (options.data.flowStartSeconds || options.data.lastSenderTime) : 0;
        if (timestamp > 0) {
            const ageMinutes = (Date.now() / 1000 - timestamp) / 60;
            if (ageMinutes < this.sparklyMinutes) {
                scale *= 1.2; // Brighter/Larger sparkly effect
                opacity = 1.0;
            } else {
                opacity = 0.8;
            }
        }

        const cacheKey = `${colors.join(',')}-${marking}-${isLarge}-${this.globalScale}-${this.showSNR ? snr : 'no'}`;
        let style = this.iconCache.get(cacheKey);

        if (!style) {
            const uri = isLarge ? this.getLargeMarkerUri(colors, snr) : this.getSmallMarkerUri(colors[0], marking, snr);
            style = new Style({
                image: new Icon({
                    src: uri,
                    anchor: [0.32, 1], // Offset anchor for the wider SVG (marker is at 1174/2500)
                    opacity: opacity,
                    scale: scale
                })
            });
            this.iconCache.set(cacheKey, style);
        }

        feature.setStyle(style);
        return feature;
    }
}

export default new MarkerManager();
