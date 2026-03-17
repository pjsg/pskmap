import 'bootstrap/dist/css/bootstrap.min.css';
import 'ol/ol.css';
import { Modal } from 'bootstrap';
import MapController from './MapController';
import MarkerManager from './MarkerManager';
import { parseLocator } from './utils/locator';
import { initBandmap, getColorForFreq, getColorsForBands, BAND_COLORS } from './utils/bands';

// Use relative paths to leverage the Vite proxy during development
const BASE_URL = '';

document.addEventListener('DOMContentLoaded', async () => {
    const mapController = new MapController('map');
    const reccntSpan = document.getElementById('reccnt');
    const activeMonitorsSpan = document.getElementById('active-monitors');
    const goBtn = document.getElementById('go-btn');
    const infoBar = document.getElementById('info-bar');
    const monitoringStatus = document.getElementById('monitoring-status');
    const bandDistribution = document.getElementById('band-distribution');

    let currentCallsign = '';
    let refreshTimer = null;

    let currentReccnt = 0;
    let reccntRate = 0;
    let lastAnimationTime = Date.now();

    function updateReccnt(newTotal) {
        if (!newTotal) return;
        const now = Date.now();

        if (!currentReccnt) {
            currentReccnt = newTotal;
            reccntSpan.textContent = Math.floor(currentReccnt).toLocaleString();
            lastAnimationTime = now;
            return;
        }

        // Only update rate if the new total is actually higher
        if (newTotal > currentReccnt) {
            // How many records arrived since we last animated them?
            // Actually, a better proxy for rate if we are trailing:
            // Just look at how much we jumped since the *real* currentReccnt vs where we are.
            // A simple approach: we want to reach (newTotal + (estimated new records for next 6 minutes))
            // But an even simpler approach is just to measure the true rate between fetch intervals.

            // Since we know this is called roughly every 5 minutes (300,000ms):
            // We can just estimate rate as (newTotal - currentReccnt) / 300000ms.
            // Or better yet, we simply let the animation continue at whatever rate it takes to 
            // naturally cross `newTotal` in the next 5 mins.
            // If we assume a 5 minute interval, then (newTotal - actual value 5 mins ago) is the rate.

            // To smooth it:
            reccntRate = (newTotal - currentReccnt) / 300000; // records per millisecond to catch up to newTotal in 5 mins
        }

        // Instead of setting a hard target, we just let it roll.
        // We will never STOP, we just keep adding reccntRate * dt.
    }

    function animateReccnt() {
        requestAnimationFrame(animateReccnt);
        const now = Date.now();
        const dt = now - lastAnimationTime;
        lastAnimationTime = now;

        if (dt > 1000) return; // Prevent huge jumps if tab was backgrounded
        if (reccntRate <= 0) return;

        currentReccnt += reccntRate * dt;
        reccntSpan.textContent = Math.floor(currentReccnt).toLocaleString();
    }

    requestAnimationFrame(animateReccnt);

    // --- Helper Functions ---

    function formatTimeAgo(seconds) {
        if (seconds < 60) return `${Math.floor(seconds)} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
        return `${Math.floor(seconds / 3600)} hours`;
    }

    function updateBandDistribution(stats, total) {
        if (!stats) return;
        let html = '';
        const sortedBands = Object.entries(stats)
            .sort(([, a], [, b]) => b - a);

        sortedBands.forEach(([band, count]) => {
            const color = BAND_COLORS[band] || '808080';
            html += `<span title="${band}" style="color: #${color}; border-left: 4px solid #${color}; padding-left: 4px; border-radius: 2px; font-weight: 500;">${count} on ${band}</span>`;
        });
        bandDistribution.innerHTML = html;
        activeMonitorsSpan.textContent = `There are ${total.toLocaleString()} active monitors:`;
    }

    async function updateGlobalStats() {
        try {
            const response = await fetch(`${BASE_URL}/api/monitor-stats`);
            const data = await response.json();
            if (data && data.stats) {
                updateBandDistribution(data.stats, data.total);
                // Remove the d-none class from the info bar.
                infoBar.classList.remove('d-none');
            }
            if (data && data.lastSequenceNumber) {
                updateReccnt(data.lastSequenceNumber);
            }
        } catch (e) { console.error('Stats fetch failed', e); }
    }

    // --- Main Logic ---

    const loadBands = async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/bands`);
            const bandsData = await response.json();
            if (bandsData) initBandmap(bandsData);
            const selectBand = document.getElementById('selectband');
            if (Array.isArray(bandsData)) {
                bandsData.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item[0];
                    opt.textContent = item[0];
                    selectBand.appendChild(opt);
                });
            }
        } catch (e) { console.error('Error loading bands', e); }
    };

    const loadModes = async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/modes`);
            const modesData = await response.json();
            const selectMode = document.getElementById('selectmode');
            if (Array.isArray(modesData.modes)) {
                // Wipe out the existing entries
                selectMode.innerHTML = '<option value="all">All modes</option>';
                modesData.modes.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.mode;
                    opt.textContent = item.mode;
                    selectMode.appendChild(opt);
                });
            }
        } catch (e) { console.error('Error loading modes', e); }
    };

    Promise.all([loadBands(), loadModes()]);
    updateGlobalStats();
    let globalStatsTimer = setInterval(() => {
        if (!document.hidden) updateGlobalStats();
    }, 60000);

    const showMonitors = async () => {
        const response = await fetch(`${BASE_URL}/api/monitors/full`);
        const data = await response.json();
        mapController.clearMarkers();
        data.monitors.forEach(monitor => {
            let coords = parseLocator(monitor.locator);
            mapController.addMarker(coords[0], coords[1], {
                color: getColorsForBands(monitor.bands.split(',')),
                marking: 'monitor',
                isLarge: true,
                data: monitor
            });
        });
    }

    // Callsign input: uppercase and allow only A-Z, 0-9, /, -
    const callsignInput = document.getElementById('callsign');
    callsignInput.addEventListener('input', () => {
        const filtered = callsignInput.value.toUpperCase().replace(/[^A-Z0-9\/\-]/g, '');
        if (filtered !== callsignInput.value) {
            callsignInput.value = filtered;
        }
    });
    callsignInput.addEventListener('keypress', (e) => {
        const key = e.key;
        if (key.length === 1 && !/^[A-Za-z0-9\/\-]$/.test(key)) {
            e.preventDefault();
        }
    });

    const performSearch = async () => {
        const callsign = document.getElementById('callsign').value.trim() || 'ZZZZZ';
        const band = document.getElementById('selectband').value;
        const mode = document.getElementById('selectmode').value;
        const timerange = document.getElementById('selecttimerange').value;
        const txrx = document.getElementById('selecttxrx').value;
        const what = document.getElementById('selectwhat').value;
        const sigs = document.getElementById('selectsigs').value;

        if (!callsign && what !== 'all') {
            alert('Please enter a callsign');
            return;
        }

        currentCallsign = callsign;
        goBtn.disabled = true;
        goBtn.textContent = 'Searching...';

        try {
            let query = `flowStartSeconds=-${timerange}&statistics=1&json=1&rronly=1&statistics=1`;

            if (txrx === 'rx') {
                query += `&receiverCallsign=${encodeURIComponent(callsign)}`;
            } else if (txrx === 'tx') {
                query += `&senderCallsign=${encodeURIComponent(callsign)}`;
            } else {
                query += `&callsign=${encodeURIComponent(callsign)}`;
            }

            if (what && what !== 'callsign') query += `&modify=${what}`;
            if (sigs === 'ctry') query += `&uctry=1`;
            if (band && band !== 'all') query += `&band=${band}`;
            if (mode && mode !== 'all') query += `&mode=${mode}`;

            const response = await fetch(`${BASE_URL}/cgi-bin/pskquery5.pl?${query}`);
            const data = await response.json();

            mapController.clearMarkers();
            infoBar.classList.remove('d-none');

            const reports = data ? (data.receptionReport || data.receptionReports || []) : [];
            let latestReportTime = 0;

            // When a callsign is set, we need one "home" marker at the callsign location and size others by mode:
            // rx (received by): large at receiver (callsign), small at senders
            // tx (sent by): small at sender (callsign), large at receivers
            let enteredCallsignLoc = null; // { lng, lat, data } for the single marker at the entered callsign's position

            reports.forEach(rx => {
                // Filtering
                // 'hide-no-reports' is usually for monitors, let's skip for now or assume monitors always have data in this context

                // Determine which location to show. 
                let loc = null;
                let otherLoc = null;
                if (txrx === 'rx') {
                    loc = rx.senderLocator;
                    otherLoc = rx.receiverLocator;
                } else if (txrx === 'tx') {
                    loc = rx.receiverLocator;
                    otherLoc = rx.senderLocator;
                } else {
                    if (callsign && rx.receiverCallsign && rx.receiverCallsign.toUpperCase() === callsign.toUpperCase()) {
                        loc = rx.senderLocator;
                        otherLoc = rx.receiverLocator;
                    } else {
                        loc = rx.receiverLocator || rx.senderLocator || rx.locator;
                        otherLoc = rx.senderLocator || rx.receiverLocator;
                    }
                }

                let coords = parseLocator(loc);
                let lat = coords ? coords[1] : NaN;
                let lng = coords ? coords[0] : NaN;

                if (isNaN(lat) || isNaN(lng)) {
                    lat = parseFloat(rx.senderLat || rx.receiverLat || rx.lat);
                    lng = parseFloat(rx.senderLng || rx.receiverLng || rx.lng);
                }

                if (!isNaN(lat) && !isNaN(lng)) {
                    // Determine if this marker is at the "other" end (entered callsign location) and size by mode
                    let isEnteredCallsignMarker = false;
                    let isLarge = false;
                    if (callsign && txrx === 'rx') {
                        // Received by callsign: markers at senders = small; one large at receiver (callsign) added later
                        isLarge = false;
                        if (!enteredCallsignLoc) {
                            const oCoords = parseLocator(otherLoc);
                            let oLat = oCoords ? oCoords[1] : parseFloat(rx.receiverLat || rx.lat);
                            let oLng = oCoords ? oCoords[0] : parseFloat(rx.receiverLng || rx.lng);
                            if (isNaN(oLat)) oLat = parseFloat(rx.receiverLat);
                            if (isNaN(oLng)) oLng = parseFloat(rx.receiverLng);
                            if (!isNaN(oLat) && !isNaN(oLng)) {
                                enteredCallsignLoc = { lng: oLng, lat: oLat, data: { ...rx, receiverCallsign: callsign, receiverLocator: otherLoc } };
                            }
                        }
                    } else if (callsign && txrx === 'tx') {
                        // Sent by callsign: markers at receivers = large; one small at sender (callsign) added later
                        isLarge = true;
                        if (!enteredCallsignLoc) {
                            const oCoords = parseLocator(otherLoc);
                            let oLat = oCoords ? oCoords[1] : parseFloat(rx.senderLat || rx.lat);
                            let oLng = oCoords ? oCoords[0] : parseFloat(rx.senderLng || rx.lng);
                            if (isNaN(oLat)) oLat = parseFloat(rx.senderLat);
                            if (isNaN(oLng)) oLng = parseFloat(rx.senderLng);
                            if (!isNaN(oLat) && !isNaN(oLng)) {
                                enteredCallsignLoc = { lng: oLng, lat: oLat, data: { ...rx, senderCallsign: callsign, senderLocator: otherLoc } };
                            }
                        }
                    } else if (callsign && (txrx === 'all' || !txrx)) {
                        // Callsign associated: markers at "others" = small; one large at callsign location added later
                        isLarge = false;
                        if (!enteredCallsignLoc) {
                            const oCoords = parseLocator(otherLoc);
                            let oLat = oCoords ? oCoords[1] : NaN;
                            let oLng = oCoords ? oCoords[0] : NaN;
                            if (isNaN(oLat)) oLat = parseFloat(rx.receiverCallsign?.toUpperCase() === callsign.toUpperCase() ? rx.receiverLat : rx.senderLat) || rx.lat;
                            if (isNaN(oLng)) oLng = parseFloat(rx.receiverCallsign?.toUpperCase() === callsign.toUpperCase() ? rx.receiverLng : rx.senderLng) || rx.lng;
                            if (!isNaN(oLat) && !isNaN(oLng)) {
                                enteredCallsignLoc = { lng: oLng, lat: oLat, data: { ...rx } };
                            }
                        }
                    }

                    const markerColor = rx.color || getColorForFreq(rx.frequency);
                    // API sends locators only; resolve to lat/lng for great-circle line on hover
                    const senderCoords = parseLocator(rx.senderLocator);
                    const receiverCoords = parseLocator(rx.receiverLocator);
                    const markerData = {
                        ...rx,
                        color: markerColor,
                        ...(senderCoords && { senderLng: senderCoords[0], senderLat: senderCoords[1] }),
                        ...(receiverCoords && { receiverLng: receiverCoords[0], receiverLat: receiverCoords[1] })
                    };
                    mapController.addMarker(lng, lat, {
                        color: markerColor,
                        marking: rx.lotw == '1' ? 'lotw' : (rx.eqsl == '1' ? 'eqsl' : null),
                        isLarge,
                        data: markerData
                    });

                    // Great-circle lines (Show Always)
                    if (currentOptions['lines-always']) {
                        const otherCoords = parseLocator(otherLoc);
                        if (otherCoords) {
                            mapController.addLine(lng, lat, otherCoords[0], otherCoords[1], markerColor);
                        }
                    }

                    const time = parseInt(rx.flowStartSeconds || rx.lastSenderTime);
                    if (time > latestReportTime) latestReportTime = time;
                }
            });

            if (!reports.length) {
                await showMonitors();
            }

            updateReccnt(data.lastSequenceNumber);
            // Add the single marker at the entered callsign's location (receiver in rx, sender in tx)
            if (enteredCallsignLoc && callsign) {
                const isLargeEntered = txrx === 'rx' || txrx === 'all' || !txrx; // large when callsign is receiver or "all"
                const d = enteredCallsignLoc.data;
                const color = d.color || getColorForFreq(d.frequency);
                mapController.addMarker(enteredCallsignLoc.lng, enteredCallsignLoc.lat, {
                    color,
                    marking: d.lotw == '1' ? 'lotw' : (d.eqsl == '1' ? 'eqsl' : null),
                    isLarge: isLargeEntered,
                    data: { ...d, isEnteredCallsign: true }
                });
            }

            // Update Monitoring Status
            let statusHtml = `Monitoring <strong>${callsign || 'anyone'}</strong>`;
            if (latestReportTime > 0) {
                const ago = (Date.now() / 1000) - latestReportTime;
                statusHtml += ` (last report ${formatTimeAgo(ago)} ago).`;
            }
            statusHtml += ` Automatic refresh in 5 minutes.`;

            // Add detailed stats if available
            if (data.statistics) {
                const s = data.statistics;
                const markerType = txrx === 'rx' ? 'transmitters' : (txrx === 'tx' ? 'receivers' : 'stations');
                statusHtml += `<br>Markers are the ${reports.length} ${markerType} `;
                if (callsign) {
                    statusHtml += txrx === 'rx' ? ` heard at ${callsign}` : (txrx === 'tx' ? ` seen by ${callsign}` : ` associated with ${callsign}`);
                }
                if (s.day) {
                    statusHtml += ` (${s.day.reports || 0} reports, ${s.day.countries || 0} countries last 24 hours`;
                    if (s.week) {
                        statusHtml += `; ${s.week.reports || 0} reports, ${s.week.countries || 0} countries last week`;
                    }
                    statusHtml += `).`;
                }
            }
            monitoringStatus.innerHTML = statusHtml;

        } catch (error) {
            console.error('Search failed', error);
        } finally {
            goBtn.disabled = false;
            goBtn.textContent = 'Go!';
        }
    };

    performSearch();

    let lastSearchTime = Date.now();
    goBtn.addEventListener('click', () => {
        performSearch();
        lastSearchTime = Date.now();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
            if (!document.hidden) {
                performSearch();
                lastSearchTime = Date.now();
            }
        }, 300000);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            const now = Date.now();
            // If we missed a 5-minute search window, do it now
            if (refreshTimer && now - lastSearchTime > 300000) {
                performSearch();
                lastSearchTime = now;
            }
            // If we missed a 1-minute stats window, update them
            // Simple approach: just hit it unconditionally when becoming visible to ensure freshness
            updateGlobalStats();
        }
    });

    // --- Display Options Logic ---
    const optionsLink = document.getElementById('show-options');
    const optionsEl = document.getElementById('optionsModal');
    const optionsModal = new Modal(optionsEl);
    const saveOptionsBtn = document.getElementById('save-options');
    const optionsForm = document.getElementById('optionsForm');

    const DEFAULT_OPTIONS = {
        'show-grid': false,
        'show-night': true,
        'hide-faint': false,
        'hide-no-reports': false,
        'show-snr': false,
        'hide-lines': false,
        'lines-always': false,
        'no-auto-pan': false,
        'tx-filter': 'all',
        'worked-timeout': 'none',
        'sparkly-minutes': 10,
        'dist-unit': 'auto',
        'night-darkness': 0.65
    };

    function loadOptions() {
        const saved = localStorage.getItem('psk-options');
        const options = saved ? { ...DEFAULT_OPTIONS, ...JSON.parse(saved) } : { ...DEFAULT_OPTIONS };

        // Fill form
        Object.keys(options).forEach(key => {
            const el = document.getElementById(key);
            if (!el) return;
            if (el.type === 'checkbox') {
                el.checked = options[key];
            } else {
                el.value = options[key];
            }
        });
        return options;
    }

    function saveOptions() {
        const options = {};
        Object.keys(DEFAULT_OPTIONS).forEach(key => {
            const el = document.getElementById(key);
            if (!el) return;
            options[key] = el.type === 'checkbox' ? el.checked : el.value;
        });
        localStorage.setItem('psk-options', JSON.stringify(options));
        return options;
    }

    function applyOptions(options) {
        mapController.setLayerVisibility('grid', options['show-grid']);
        mapController.setLayerVisibility('sun', options['show-night']);

        if (mapController.sunSource) {
            mapController.sunSource.setObscureFactor(parseFloat(options['night-darkness']));
        }

        // MarkerManager settings (will be used in next addMarker calls)
        MarkerManager.setShowSNR(options['show-snr']);
        MarkerManager.setWorkedTimeout(options['worked-timeout']);
        MarkerManager.setSparklyMinutes(parseInt(options['sparkly-minutes']));

        // Map behavior
        mapController.setHideLines(options['hide-lines']);
        mapController.setLinesAlways(options['lines-always']);
    }

    let currentOptions = loadOptions();
    applyOptions(currentOptions);

    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        optionsModal.show();
    });

    saveOptionsBtn.addEventListener('click', () => {
        currentOptions = saveOptions();
        applyOptions(currentOptions);
        performSearch(); // Refresh markers with new scale/filters
        optionsModal.hide();
    });

    function calculateDistance(lat1, lon1, lat2, lon2, unit) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        if (unit === 'miles') return (d * 0.621371).toFixed(0) + ' miles';
        return d.toFixed(0) + ' km';
    }

    // --- Infobox Formatting ---
    mapController.onPopupRequest = (props) => {
        const isMonitor = !props.senderCallsign;
        const callsign = props.callsign || props.receiverCallsign || 'Unknown';
        const locator = props.locator || props.receiverLocator || '';
        const frequency = props.frequency ? (parseFloat(props.frequency) / 1000000).toFixed(3) : null;
        const mode = props.mode || '';
        const snr = props.sNR || props.snr;

        let html = `<div><strong>${isMonitor ? 'Monitor: ' : ''}${callsign}</strong>`;
        if (locator) html += ` <span class="text-muted">(${locator})</span>`;

        let country = props.region || props.DXCC || props.receiverDXCC || props.dx_country || '';
        if (country) {
            // Include regionName if it exists and doesn't exactly match the country string
            if (props.regionName && props.regionName.toLowerCase() !== country.toLowerCase()) {
                country = `${props.regionName}, ${country}`;
            }
            html += `<br><small>${country}</small>`;
        } else if (props.regionName) {
            html += `<br><small>${props.regionName}</small>`;
        }

        if (isMonitor && props.decoderSoftware) {
            html += `<br><small class="text-muted">${props.decoderSoftware}</small>`;
        }
        if (!isMonitor) {
            html += `<br>Rcvd from <strong>${props.senderCallsign}</strong>`;
            if (props.senderLocator) html += ` (${props.senderLocator})`;

            // Distance calculation
            const sLat = parseFloat(props.senderLat);
            const sLon = parseFloat(props.senderLng);
            const rLat = parseFloat(props.receiverLat);
            const rLon = parseFloat(props.receiverLng);
            if (!isNaN(sLat) && !isNaN(sLon) && !isNaN(rLat) && !isNaN(rLon)) {
                const dist = calculateDistance(sLat, sLon, rLat, rLon, currentOptions['dist-unit']);
                html += `<br>Distance: ${dist}`;
            }
        }
        if (frequency) {
            html += `<br>Freq: ${frequency} MHz`;
            if (mode) html += ` (${mode})`;
        } else if (mode) {
            html += `<br>Mode: ${mode}`;
        }
        if (snr != null) html += `<br>SNR: ${snr} dB`;
        const timestamp = props.flowStartSeconds || props.lastSenderTime;
        if (timestamp) {
            const date = new Date(timestamp * 1000);
            html += `<br><small class="text-muted">${date.toUTCString()}</small>`;
        }
        html += `</div>`;
        return html;
    };

    window.addEventListener('resize', () => {
        mapController.map.updateSize();
    });
});
