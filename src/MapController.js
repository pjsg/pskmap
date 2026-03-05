import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls } from 'ol/control/defaults';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import { apply } from 'ol-mapbox-style';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import { Style, Stroke } from 'ol/style';
import { GreatCircle } from 'arc';
import SunSource from './layers/SunSource';
import MaidenheadSource from './layers/MaidenheadSource';
import MarkerManager from './MarkerManager';
import pskStyle from '../psk-basic-3.json';

class MapController {
    constructor(targetId) {
        this.targetId = targetId;
        this.map = null;
        this.markerSource = new VectorSource();
        this.lineSource = new VectorSource();
        this.onPopupRequest = null;
        this.hideLines = false;
        this.linesAlways = false;
        this.popupTimer = null;

        this.layers = {};
        this.initMap();
    }

    setHideLines(hide) {
        this.hideLines = hide;
        this.updateLinesVisibility();
    }

    setLinesAlways(always) {
        this.linesAlways = always;
        this.updateLinesVisibility();
    }

    updateLinesVisibility() {
        if (this.layers.lines) {
            this.layers.lines.setVisible(!this.hideLines);
        }
    }

    addLine(startLon, startLat, endLon, endLat, color) {
        if (this.hideLines) return;

        const start = { x: startLon, y: startLat };
        const end = { x: endLon, y: endLat };

        try {
            const generator = new GreatCircle(start, end);
            const path = generator.Arc(100, { offset: 10 });
            const coords = [];
            if (path.geometries) {
                path.geometries.forEach(geom => {
                    if (geom && geom.coords) {
                        geom.coords.forEach(c => {
                            if (c != null && c[0] != null && c[1] != null && !isNaN(c[0]) && !isNaN(c[1])) {
                                coords.push(fromLonLat([c[0], c[1]]));
                            }
                        });
                    }
                });
            }
            if (coords.length >= 2) {
                const strokeColor = this._normalizeLineColor(color);
                const feature = new Feature({
                    geometry: new LineString(coords)
                });
                feature.setStyle(new Style({
                    stroke: new Stroke({
                        color: strokeColor,
                        width: 2
                    })
                }));
                this.lineSource.addFeature(feature);
            }
        } catch (e) {
            console.warn('Failed to draw great-circle line', e);
        }
    }

    _normalizeLineColor(color) {
        if (!color) return 'rgba(128, 128, 128, 0.8)';
        if (typeof color !== 'string') return 'rgba(128, 128, 128, 0.8)';
        let hex = color;
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (!/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(hex)) return 'rgba(128, 128, 128, 0.8)';
        if (hex.length === 4) {
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 0.9)`;
    }

    async initMap() {
        // Create the map container
        this.map = new Map({
            target: this.targetId,
            controls: defaultControls({
                rotate: false,
                attributionOptions: {
                    collapsible: false
                }
            }),
            view: new View({
                center: fromLonLat([0, 20]),
                zoom: 2
            })
        });

        // Apply the vector tile style from OpenFreeMap
        try {
            await apply(this.map, pskStyle);
        } catch (e) {
            console.error('Failed to apply map style', e);
        }

        // Setup custom sources
        this.sunSource = new SunSource({
            obscureFactor: 0.65,
            getCurrentTime: () => Date.now()
        });

        this.layers.sun = new ImageLayer({
            source: this.sunSource,
            opacity: 0.5,
            visible: true
        });

        this.maidenheadSource = new MaidenheadSource();
        this.layers.grid = new ImageLayer({
            source: this.maidenheadSource,
            visible: true
        });

        this.layers.markers = new VectorLayer({
            source: this.markerSource,
            renderMode: 'image'
        });

        this.layers.lines = new VectorLayer({
            source: this.lineSource
        });

        // Add custom layers on top of the vector tiles
        this.map.addLayer(this.layers.sun);
        this.map.addLayer(this.layers.grid);
        this.map.addLayer(this.layers.lines);
        this.map.addLayer(this.layers.markers);

        this.addHoverHandler();
    }

    setLayerVisibility(name, visible) {
        if (this.layers[name]) {
            this.layers[name].setVisible(visible);
        }
    }

    clearMarkers() {
        this.markerSource.clear();
        this.clearLines();
    }

    clearLines() {
        this.lineSource.clear();
    }

    addHoverHandler() {
        this.map.on('pointermove', (evt) => {
            if (evt.dragging) {
                this.hidePopup();
                return;
            }
            const pixel = this.map.getEventPixel(evt.originalEvent);
            const feature = this.map.forEachFeatureAtPixel(pixel, (f) => {
                // Only trigger for markers that likely have data
                if (f.get('senderLat') || f.get('callsign') || f.get('receiverCallsign')) {
                    return f;
                }
                return null;
            }, {
                layerFilter: (layer) => layer === this.layers.markers
            });

            if (feature) {
                if (this.popupTimer) {
                    clearTimeout(this.popupTimer);
                    this.popupTimer = null;
                }
                this.map.getTargetElement().style.cursor = 'pointer';
                const props = feature.getProperties();
                this.showPopup(props);

                // Show great-circle line on hover only when not over the entered-callsign marker
                const sLat = parseFloat(props.senderLat ?? props.sender_lat);
                const sLon = parseFloat(props.senderLng ?? props.sender_lng);
                const rLat = parseFloat(props.receiverLat ?? props.receiver_lat);
                const rLon = parseFloat(props.receiverLng ?? props.receiver_lng);
                if (!this.hideLines && !this.linesAlways && !props.isEnteredCallsign && !isNaN(sLat) && !isNaN(sLon) && !isNaN(rLat) && !isNaN(rLon)) {
                    this.clearLines();
                    this.addLine(sLon, sLat, rLon, rLat, props.color);
                }
            } else {
                this.map.getTargetElement().style.cursor = '';
                if (!this.popupTimer) {
                    this.popupTimer = setTimeout(() => {
                        this.hidePopup();
                        if (!this.linesAlways) this.clearLines();
                        this.popupTimer = null;
                    }, 30000);
                }
            }
        });

        this.map.on('click', () => {
            if (this.popupTimer) {
                clearTimeout(this.popupTimer);
                this.popupTimer = null;
            }
            this.hidePopup();
        });
    }

    showPopup(properties) {
        const popup = document.getElementById('popup');
        const content = document.getElementById('popup-content');
        if (this.onPopupRequest && popup && content) {
            const html = this.onPopupRequest(properties);
            if (html) {
                content.innerHTML = html;
                popup.style.display = 'block';
            }
        }
    }

    hidePopup() {
        const popup = document.getElementById('popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }

    addMarker(lon, lat, options = {}) {
        const pos = fromLonLat([lon, lat]);
        const feature = MarkerManager.createMarkerFeature(pos, options);
        this.markerSource.addFeature(feature);
        return feature;
    }

    updateSunLayer() {
        this.sunSource.changed();
    }

    updateGrid() {
        this.maidenheadSource.changed();
    }
}

export default MapController;
