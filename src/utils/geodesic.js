import * as arc from 'arc';
import * as olProj from 'ol/proj';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import { Stroke, Style } from 'ol/style';

/**
 * Creates a geodesic (Great Circle) line feature between two points.
 * @param {ol.Coordinate} startCoord 
 * @param {ol.Coordinate} endCoord 
 * @param {Object} options 
 * @returns {Feature}
 */
export function createGeodesicFeature(startCoord, endCoord, options = {}) {
    const steps = options.steps || 100;
    const projection = options.projection || 'EPSG:3857';

    const start = olProj.toLonLat(startCoord, projection);
    const end = olProj.toLonLat(endCoord, projection);

    const generator = new arc.GreatCircle(
        { x: start[0], y: start[1] },
        { x: end[0], y: end[1] }
    );

    const path = generator.Arc(steps, { offset: 10 });
    const coords = [];

    path.geometries.forEach(geom => {
        let lonOff = 0;
        let lastLon = 0;
        geom.coords.forEach((c, i) => {
            if (isNaN(c[0])) return;
            if (i > 0 && Math.abs(lastLon - c[0]) > 270) {
                lonOff += (c[0] < lastLon) ? 360 : -360;
            }
            lastLon = c[0];
            coords.push(olProj.fromLonLat([c[0] + lonOff, c[1]], projection));
        });
    });

    const feature = new Feature({
        geometry: new LineString(coords)
    });

    feature.setStyle(new Style({
        stroke: new Stroke({
            color: options.color || 'rgba(255, 0, 0, 0.5)',
            width: options.width || 2
        })
    }));

    return feature;
}
