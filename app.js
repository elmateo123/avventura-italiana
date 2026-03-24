let map;
let directionsService;
let markers = [];
let routePolylines = [];
let routeHalos = []; // White "halo" outline polylines for hover effects
let stops = []; // Array of { name, location, id, color }
let autocomplete;
let dragSrcIndex = null;
let currentRouteId = null; // Track loaded route for Save vs Save As functionality
let currentRouteName = "New Journey";
let legData = []; // Array of { distance, duration } for each segment between stops

const MAX_STOPS = 25;
const DEFAULT_COLORS = ['#d93025', '#1a73e8', '#f9ab00', '#188038', '#12b5cb', '#9334e6', '#fa7b17', '#e8308c'];

function initMap() {
    console.log("Initializing Avventura Italiana...");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 41.8719, lng: 12.5674 },
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "greedy",
    });

    directionsService = new google.maps.DirectionsService();

    const satBtn = document.getElementById("satellite-toggle");
    satBtn.addEventListener("click", () => {
        const currentType = map.getMapTypeId();
        const nextType = currentType === 'satellite' ? 'roadmap' : 'satellite';
        map.setMapTypeId(nextType);
        satBtn.innerText = currentType === 'satellite' ? 'Satellite View' : 'Roadmap View';
    });

    const input = document.getElementById("pac-input");
    autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo("bounds", map);

    // Event Listeners
    document.getElementById("add-stop-btn").addEventListener("click", addCurrentPlace);
    document.getElementById("calculate-btn").addEventListener("click", calculateRoute);

    // Mode Switching Logic
    const modeBtns = document.querySelectorAll(".mode-btn");
    modeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            modeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const globalMode = btn.dataset.mode;
            // Apply global mode to all segments
            stops.forEach((s, idx) => {
                if (idx > 0) s.travelMode = globalMode;
            });

            if (stops.length >= 2) {
                calculateRoute();
            }
        });
    });

    // Save Modal Logic
    const saveTrigger = document.getElementById("save-route-trigger");
    const saveModal = document.getElementById("save-modal");
    saveTrigger.addEventListener("click", () => {
        if (stops.length < 1) return showNotification("Add some stops before saving.", "error");

        const overwriteSection = document.getElementById("overwrite-section");
        const modalTitle = document.getElementById("save-modal-title");
        const confirmBtn = document.getElementById("confirm-save-btn");
        const nameInput = document.getElementById("route-name-input");

        if (currentRouteId) {
            overwriteSection.classList.remove("hidden");
            modalTitle.innerText = "Manage Journey File";
            confirmBtn.innerText = "Save as New Copy";

            // Pre-fill with existing name
            const saved = JSON.parse(localStorage.getItem("saved_routes") || "[]");
            const current = saved.find(r => r.id === currentRouteId);
            if (current) nameInput.value = current.name + " (Copy)";
        } else {
            overwriteSection.classList.add("hidden");
            modalTitle.innerText = "Save Journey";
            confirmBtn.innerText = "Save Journey";
            nameInput.value = "";
        }

        saveModal.classList.remove("hidden");
    });

    document.getElementById("cancel-save-btn").addEventListener("click", () => saveModal.classList.add("hidden"));
    document.getElementById("confirm-save-btn").addEventListener("click", saveRoute);
    document.getElementById("overwrite-save-btn").addEventListener("click", overwriteCurrentRoute);

    // Reset Confirmation logic
    document.getElementById("new-route-btn").addEventListener("click", resetApp);
    document.getElementById("confirm-reset-yes").addEventListener("click", _doReset);
    document.getElementById("confirm-reset-no").addEventListener("click", cancelReset);

    // Drawer Logic
    const drawer = document.getElementById("routes-drawer");
    document.getElementById("toggle-drawer-btn").addEventListener("click", () => drawer.classList.remove("hidden"));
    document.getElementById("close-drawer-btn").addEventListener("click", () => drawer.classList.add("hidden"));

    renderSavedRoutes();
    updateRouteTitleUI();
}

// ── Route Title UI ──────────────────────────────────────────────────────────

function updateRouteTitleUI() {
    const titleEl = document.getElementById("route-title-display");
    if (titleEl) {
        titleEl.innerText = currentRouteName || "New Journey";
    }
}

// ── Add/Remove Stops ────────────────────────────────────────────────────────

function addCurrentPlace() {
    const input = document.getElementById("pac-input");
    const val = input.value.trim();
    if (!val) return;

    const place = autocomplete.getPlace();

    if (place && place.geometry) {
        _processNewStop(place);
    } else {
        // Fallback: Use Geocoder for the text in the input
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: val }, (results, status) => {
            if (status === "OK" && results[0].geometry) {
                _processNewStop(results[0]);
            } else {
                showNotification("Location not found. Please select from the dropdown.", "error");
            }
        });
    }
}

function _processNewStop(place) {
    if (stops.length >= MAX_STOPS) {
        showNotification(`Maximum capacity of ${MAX_STOPS} locations reached.`, "error");
        return;
    }
    const activeModeBtn = document.querySelector('.mode-btn.active');
    const defaultMode = activeModeBtn ? activeModeBtn.dataset.mode : "DRIVING";

    const stop = {
        id: Date.now(),
        name: place.name || (place.formatted_address ? place.formatted_address.split(',')[0] : "New Stop"),
        location: place.geometry.location,
        color: DEFAULT_COLORS[stops.length % DEFAULT_COLORS.length],
        stayDays: 1, // Default to 1 day stay
        note: "", // New note property
        travelMode: defaultMode // Segment mode to reach this stop
    };
    stops.push(stop);
    renderStopsList();
    addMarker(stop);
    document.getElementById("pac-input").value = "";
    document.getElementById("pac-input").focus();
}

function addMarker(stop) {
    const marker = new google.maps.Marker({
        position: stop.location,
        map: map,
        title: stop.name,
        label: { text: (stops.indexOf(stop) + 1).toString(), color: 'white', fontWeight: '700', fontSize: '11px' },
        animation: google.maps.Animation.DROP
    });
    markers.push({ id: stop.id, marker });
}

function removeStop(id) {
    stops = stops.filter(s => s.id !== id);
    const idx = markers.findIndex(m => m.id === id);
    if (idx > -1) {
        markers[idx].marker.setMap(null);
        markers.splice(idx, 1);
    }
    refreshMarkerLabels();
    if (stops.length >= 2) {
        calculateRoute();
    } else {
        clearRoute();
        legData = [];
        renderStopsList();
    }
}

function refreshMarkerLabels() {
    // Rebuild markers in correct order
    markers.forEach(m => m.marker.setMap(null));
    markers = [];
    stops.forEach(stop => {
        const marker = new google.maps.Marker({
            position: stop.location,
            map: map,
            title: stop.name,
            label: { text: (stops.indexOf(stop) + 1).toString(), color: 'white', fontWeight: '700', fontSize: '11px' },
        });
        markers.push({ id: stop.id, marker });
    });
}

// ── Notifications & Confirmations ───────────────────────────────────────────

function showNotification(message, type = 'info') {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "ℹ️";
    if (type === 'success') icon = "✅";
    if (type === 'error') icon = "⚠️";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);

    // Remove from DOM after animation finishes
    setTimeout(() => {
        toast.remove();
    }, 3200);
}

function showConfirm(title, message, onYes) {
    const modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-modal-title").innerText = title;
    document.getElementById("confirm-modal-msg").innerText = message;
    
    modal.classList.remove("hidden");

    const yesBtn = document.getElementById("confirm-action-yes");
    const noBtn = document.getElementById("confirm-action-no");

    // Clean listeners
    const cleanYes = yesBtn.cloneNode(true);
    const cleanNo = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(cleanYes, yesBtn);
    noBtn.parentNode.replaceChild(cleanNo, noBtn);

    cleanYes.addEventListener("click", () => {
        modal.classList.add("hidden");
        onYes();
    });
    cleanNo.addEventListener("click", () => {
        modal.classList.add("hidden");
    });
}

// ── Render Stops (with Drag-to-Reorder) ─────────────────────────────────────

function renderStopsList() {
    const container = document.getElementById("stops-list");
    container.innerHTML = "";

    stops.forEach((stop, index) => {
        // Drop leg info between stops (if calculated)
        if (legData[index - 1] && index > 0) {
            const leg = legData[index - 1];
            const connector = document.createElement("div");
            connector.className = "leg-connector";

            // Map internal Mode to an icon
            let modeIcon = "🚗";
            const m = leg.mode || "DRIVING";
            if (m === "BUS" || m === "INTERCITY_BUS") modeIcon = "🚌";
            else if (['TRAIN', 'HEAVY_RAIL', 'HIGH_SPEED_TRAIN', 'COMMUTER_TRAIN', 'RAIL'].includes(m)) modeIcon = "🚆";
            else if (m === "SUBWAY" || m === "METRO_RAIL") modeIcon = "🚇";
            else if (m === "TRAM") modeIcon = "🚋";

            connector.innerHTML = `
                <div class="leg-line"></div>
                <div class="leg-info interactive" title="Click to toggle Drive/Transit" data-leg-index="${index - 1}">
                    <span class="mode-icon">${modeIcon}</span>
                    <span class="leg-dist">${leg.distance}</span>
                    <span class="dot">•</span>
                    <span class="leg-time">${leg.duration}</span>
                </div>
                <div class="leg-line"></div>
            `;
            
            // Toggle & Hover Logic for this Leg
            const infoPill = connector.querySelector(".leg-info");
            const altMode = (stops[index].travelMode === "TRANSIT") ? "🚗 Driving" : "🚆 Transit";
            const currentLabel = infoPill.innerHTML;

            infoPill.addEventListener("click", () => {
                const current = stops[index].travelMode || "DRIVING";
                stops[index].travelMode = (current === "DRIVING") ? "TRANSIT" : "DRIVING";
                calculateRoute();
            });

            infoPill.addEventListener("mouseenter", () => {
                infoPill.innerHTML = `<span class="mode-icon">🔄</span> <span style="font-weight:600">to ${altMode}</span>`;
                const mapPolys = routePolylines[index - 1];
                const halos = routeHalos[index - 1];
                if (mapPolys) mapPolys.forEach(p => p.setOptions({ zIndex: 1001 }));
                if (halos) halos.forEach(h => h.setMap(map));
            });

            infoPill.addEventListener("mouseleave", () => {
                infoPill.innerHTML = currentLabel;
                const mapPolys = routePolylines[index - 1];
                const halos = routeHalos[index - 1];
                if (mapPolys) mapPolys.forEach(p => p.setOptions({ zIndex: 1 }));
                if (halos) halos.forEach(h => h.setMap(null));
            });

            container.appendChild(connector);
        }

        const item = document.createElement("div");
        item.className = "stop-item";
        item.setAttribute("draggable", "true");
        item.dataset.index = index;

        item.innerHTML = `
            <div class="drag-handle" title="Drag to reorder" style="margin-top: 5px;">⠿</div>
            <div class="stop-number" style="margin-top: 5px;">${index + 1}</div>
            <div class="stop-content-wrapper">
                <div class="stop-main-row">
                    <div class="stop-details">
                        <div class="stop-name" title="${stop.name}">${stop.name}</div>
                        ${stop.note ? `<div class="note-preview">${stop.note}</div>` : ''}
                    </div>
                    <div class="stop-controls">
                        <button class="note-btn ${stop.note ? 'has-content' : ''}" title="Stop Notes">📝</button>
                        <div class="stay-input-container">
                            <span class="stay-label">Days</span>
                            <input type="number" class="stay-input" value="${stop.stayDays || 0}" min="0">
                        </div>
                        <input type="color" class="color-dot" value="${stop.color}" data-id="${stop.id}">
                        <button class="remove-btn" title="Remove" data-id="${stop.id}">×</button>
                    </div>
                </div>
                
                <div class="note-editor-container hidden">
                    <textarea class="note-textarea" placeholder="Add links, checklists, or reminders for this stop...">${stop.note || ""}</textarea>
                    <div class="note-actions">
                        <button class="icon-btn note-cancel-btn" style="width: auto; padding: 0 10px; height: 30px; border-radius: 6px; font-size: 0.8rem;">Cancel</button>
                        <button class="calculate-action-btn note-save-btn" style="width: auto; padding: 0 15px; height: 30px; border-radius: 6px; font-size: 0.8rem;">Save Note</button>
                    </div>
                </div>
            </div>
        `;

        // Note Toggle Logic
        const noteBtn = item.querySelector(".note-btn");
        const noteEditor = item.querySelector(".note-editor-container");
        const noteTextarea = item.querySelector(".note-textarea");

        noteBtn.addEventListener("click", () => {
            noteEditor.classList.toggle("hidden");
            if (!noteEditor.classList.contains("hidden")) noteTextarea.focus();
        });

        item.querySelector(".note-cancel-btn").addEventListener("click", () => {
            noteEditor.classList.add("hidden");
            noteTextarea.value = stop.note || ""; // Revert
        });

        item.querySelector(".note-save-btn").addEventListener("click", () => {
            stop.note = noteTextarea.value.trim();
            noteEditor.classList.add("hidden");
            renderStopsList(); // Refresh to show preview
            showNotification("Note saved", "success");
        });

        // Stay days update
        item.querySelector(".stay-input").addEventListener("change", (e) => {
            stop.stayDays = parseInt(e.target.value) || 0;
            updateTripSummary();
        });

        // Color picker – live update on the polyline
        item.querySelector(".color-dot").addEventListener("input", (e) => {
            stop.color = e.target.value;
            if (routePolylines[index]) {
                // routePolylines[index] is now an array of polylines for that segment
                routePolylines[index].forEach(p => p.setOptions({ strokeColor: stop.color }));
            }
        });

        // Remove button
        item.querySelector(".remove-btn").addEventListener("click", () => removeStop(stop.id));

        // Drag events
        item.addEventListener("dragstart", onDragStart);
        item.addEventListener("dragover", onDragOver);
        item.addEventListener("drop", onDrop);
        item.addEventListener("dragend", onDragEnd);

        container.appendChild(item);
    });
}

// ── Drag-and-Drop Reorder Logic ──────────────────────────────────────────────

function onDragStart(e) {
    dragSrcIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".stop-item").forEach(el => el.classList.remove("drag-over"));
    e.currentTarget.classList.add("drag-over");
}

function onDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

    // Swap the stops
    const moved = stops.splice(dragSrcIndex, 1)[0];
    stops.splice(targetIndex, 0, moved);

    refreshMarkerLabels();
    if (stops.length >= 2) calculateRoute();
}

function onDragEnd(e) {
    document.querySelectorAll(".stop-item").forEach(el => {
        el.classList.remove("dragging", "drag-over");
    });
    dragSrcIndex = null;
}

// ── Route Calculation ────────────────────────────────────────────────────────

async function calculateRoute() {
    if (stops.length < 2) {
        showNotification("Please add at least two locations to generate a route.", "info");
        return;
    }
    showLoading(true);
    clearRoute();
    legData = [];

    try {
        let cumulResult = { routes: [{ legs: [], overview_path: [] }] };
        
        for (let i = 0; i < stops.length - 1; i++) {
            const legMode = stops[i + 1].travelMode || "DRIVING";

            if (legMode === "DRIVING") {
                const request = {
                    origin: stops[i].location,
                    destination: stops[i + 1].location,
                    travelMode: google.maps.TravelMode.DRIVING,
                    unitSystem: google.maps.UnitSystem.IMPERIAL
                };

                const res = await new Promise((resolve, reject) => {
                    directionsService.route(request, (r, s) => {
                        if (s === "OK") resolve(r);
                        else reject(s);
                    });
                });
                
                const winStep = res.routes[0];
                cumulResult.routes[0].legs.push(winStep.legs[0]);
                cumulResult.routes[0].overview_path.push(...winStep.overview_path);
                
                // Track driving mode in legData
                legData.push({
                    distance: winStep.legs[0].distance.text,
                    duration: winStep.legs[0].duration.text,
                    mode: "DRIVING"
                });

            } else {
                // TRANSIT: 24h Peak Window Probe
                const now = new Date();
                const twelveHoursLater = new Date(now.getTime() + 12 * 60 * 60 * 1000);
                const timeWindows = [now, twelveHoursLater];
                let allAlternativeRoutes = [];

                for (const departureTime of timeWindows) {
                    const request = {
                        origin: stops[i].location,
                        destination: stops[i + 1].location,
                        travelMode: google.maps.TravelMode.TRANSIT,
                        unitSystem: google.maps.UnitSystem.IMPERIAL,
                        provideRouteAlternatives: true,
                        transitOptions: { departureTime }
                    };

                    const res = await new Promise((resolve) => {
                        directionsService.route(request, (r, s) => {
                            if (s === "OK") resolve(r);
                            else resolve(null);
                        });
                    });

                    if (res && res.routes) {
                        allAlternativeRoutes.push(...res.routes);
                    }
                }

                if (allAlternativeRoutes.length === 0) {
                    throw new Error(`No transit available between ${stops[i].name} and ${stops[i+1].name}`);
                }

                allAlternativeRoutes.sort((a, b) => a.legs[0].duration.value - b.legs[0].duration.value);
                const winner = allAlternativeRoutes[0];

                cumulResult.routes[0].legs.push(winner.legs[0]);
                cumulResult.routes[0].overview_path.push(...winner.overview_path);
                
                // Determine main transit type emoji
                let mainT = "TRANSIT";
                winner.legs[0].steps.forEach(st => {
                    if (st.travel_mode === "TRANSIT") mainT = st.transit.line.vehicle.type;
                });

                legData.push({
                    distance: winner.legs[0].distance.text,
                    duration: winner.legs[0].duration.text,
                    mode: mainT
                });
            }
        }

        showLoading(false);
        drawCalculatedRoute(cumulResult);
    } catch (err) {
        showLoading(false);
        showNotification(err.message || "Routing error.", "error");
    }
}

let routeMarkers = []; // Icons representing transit types on the map

function drawCalculatedRoute(result) {
    const route = result.routes[0];
    let totalMeters = 0, totalSecs = 0;

    route.legs.forEach((leg, index) => {
        totalMeters += leg.distance.value;
        totalSecs += leg.duration.value;

        const segmentPolylines = [];
        const segmentHalos = [];
        let mainMode = null; // To determine sidebar badge

        // For DRIVING legs, add a single car icon at the midpoint
        const legMode = legData[index] ? legData[index].mode : "DRIVING";
        if (legMode === "DRIVING") {
            const midpoint = leg.steps[Math.floor(leg.steps.length / 2)].start_location;
            const carMarker = new google.maps.Marker({
                position: midpoint,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: stops[index].color,
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "white",
                    scale: 14,
                },
                label: { text: "🚗", fontSize: '14px' },
                zIndex: 2000,
                title: "Driving Segment"
            });
            routeMarkers.push(carMarker);
        }

        leg.steps.forEach(step => {
            const mode = step.travel_mode;
            let subMode = mode; // DRIVING, WALKING, TRANSIT
            let isDotted = mode === "WALKING";

            if (mode === "TRANSIT") {
                const type = step.transit.line.vehicle.type;
                subMode = type;
                if (type === 'BUS' || type === 'INTERCITY_BUS') isDotted = true;
                if (!mainMode || ['TRAIN', 'HEAVY_RAIL', 'HIGH_SPEED_TRAIN', 'SUBWAY', 'TRAM'].includes(type)) {
                    mainMode = type;
                }

                // Add an Icon to the Map for transit steps
                const midpoint = step.path[Math.floor(step.path.length / 2)];
                let emoji = "🚆";
                if (type === 'BUS' || type === 'INTERCITY_BUS') emoji = "🚌";
                else if (type === 'SUBWAY' || type === 'METRO_RAIL') emoji = "🚇";
                else if (type === 'TRAM') emoji = "🚋";

                const iconMarker = new google.maps.Marker({
                    position: midpoint,
                    map: map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: stops[index].color,
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: "white",
                        scale: 14,
                    },
                    label: {
                        text: emoji,
                        fontSize: '14px'
                    },
                    zindex: 2000,
                    title: `${type}: ${step.transit.line.name || ""}`
                });
                routeMarkers.push(iconMarker);
            }

            const polyOptions = {
                path: step.path,
                geodesic: true,
                strokeColor: stops[index].color,
                strokeOpacity: 0.85,
                strokeWeight: 5,
                map: map
            };

            if (isDotted) {
                polyOptions.strokeOpacity = 0;
                polyOptions.icons = [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                    offset: '0',
                    repeat: '10px'
                }];
            }

            const poly = new google.maps.Polyline(polyOptions);

            // Create the Halo (white thicker outline)
            const haloPoly = new google.maps.Polyline({
                path: step.path,
                geodesic: true,
                strokeColor: "#ffffff",
                strokeOpacity: 1,
                strokeWeight: 9,
                zIndex: 1000,
                map: null // not shown yet
            });

            // If the main segment is dotted, we must match it (or handle it cleanly)
            if (isDotted) {
                haloPoly.setOptions({
                    strokeOpacity: 0,
                    icons: [{
                        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2.5 },
                        offset: '0',
                        repeat: '10px'
                    }]
                });
            }

            // Map-to-Sidebar Hover effect
            poly.addListener("mouseover", () => {
                segmentPolylines.forEach(p => p.setOptions({ zIndex: 1001 }));
                segmentHalos.forEach(h => h.setMap(map));
                const pill = document.querySelector(`.leg-info[data-leg-index="${index}"]`);
                if (pill) pill.classList.add("highlight");
            });
            poly.addListener("mouseout", () => {
                segmentPolylines.forEach(p => p.setOptions({ zIndex: 1 }));
                segmentHalos.forEach(h => h.setMap(null));
                const pill = document.querySelector(`.leg-info[data-leg-index="${index}"]`);
                if (pill) pill.classList.remove("highlight");
            });

            segmentPolylines.push(poly);
            segmentHalos.push(haloPoly);
        });

        routePolylines.push(segmentPolylines);
        routeHalos.push(segmentHalos);

        // Store leg content for UI
        legData.push({
            distance: leg.distance.text,
            duration: leg.duration.text,
            mode: mainMode || (leg.steps.some(s => s.travel_mode === "TRANSIT") ? "TRANSIT" : "DRIVING")
        });
    });

    const distMi = (totalMeters / 1609.34).toFixed(1);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.round((totalSecs % 3600) / 60);
    const totalHours = totalSecs / 3600;
    const avgSpeed = totalHours > 0 ? (distMi / totalHours).toFixed(1) : 0;

    // Update all matching IDs (sidebar uses these IDs too in some cases, though we removed them, it's safe)
    document.querySelectorAll("#total-distance").forEach(el => el.innerText = `${distMi} mi`);
    document.querySelectorAll("#total-time").forEach(el => el.innerText = (hours > 0 ? `${hours}h ` : "") + `${mins}m`);
    document.querySelectorAll("#avg-speed").forEach(el => el.innerText = `${avgSpeed} mph`);

    document.getElementById("floating-stats").classList.remove("hidden");

    // Re-render UI to show leg info
    renderStopsList();
    updateTripSummary();

    const bounds = new google.maps.LatLngBounds();
    route.overview_path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
}

function clearRoute() {
    routePolylines.forEach(segmentGroup => {
        if (Array.isArray(segmentGroup)) {
            segmentGroup.forEach(p => p.setMap(null));
        } else {
            segmentGroup.setMap(null);
        }
    });
    routePolylines = [];
    routeHalos.forEach(haloList => {
        if (Array.isArray(haloList)) haloList.forEach(h => h.setMap(null));
    });
    routeHalos = [];
    routeMarkers.forEach(m => m.marker ? m.marker.setMap(null) : m.setMap(null));
    routeMarkers = [];
    updateTripSummary();
}

/** 
 * Updates the trip summary label (Total Days)
 */
function updateTripSummary() {
    const totalDays = stops.reduce((acc, s) => acc + (parseInt(s.stayDays) || 0), 0);
    const dayLabel = document.getElementById("total-days");
    if (dayLabel) {
        dayLabel.innerText = `${totalDays} Day${totalDays === 1 ? '' : 's'}`;
    }
}

function showLoading(show) {
    document.getElementById("loading-overlay").classList.toggle("hidden", !show);
}

// ── Reset ────────────────────────────────────────────────────────────────────

function resetApp() {
    if (stops.length === 0) {
        _doReset();
        return;
    }
    document.getElementById("sidebar-actions").classList.add("hidden");
    document.getElementById("reset-confirmation").classList.remove("hidden");
}

function cancelReset() {
    document.getElementById("sidebar-actions").classList.remove("hidden");
    document.getElementById("reset-confirmation").classList.add("hidden");
}

function _doReset() {
    // Clear all data
    stops = [];

    // Remove map markers
    markers.forEach(m => m.marker.setMap(null));
    markers = [];

    // Remove route lines
    clearRoute();
    legData = [];

    // Reset UI
    renderStopsList();
    document.getElementById("pac-input").value = "";
    document.getElementById("floating-stats").classList.add("hidden");
    document.getElementById("save-modal").classList.add("hidden");
    currentRouteId = null; // Reset current file reference
    currentRouteName = "New Journey";
    updateRouteTitleUI();
    cancelReset(); // Switch back to main buttons

    // Reset map view to Italy
    map.setCenter({ lat: 41.8719, lng: 12.5674 });
    map.setZoom(6);

    console.log("App reset successfully.");
}

// ── Saved Routes ─────────────────────────────────────────────────────────────

function saveRoute() {
    const nameInput = document.getElementById("route-name-input");
    const name = nameInput.value.trim();
    if (!name) { showNotification("Please provide a name for this route.", "error"); return; }
    if (stops.length < 1) { showNotification("Add some stops before saving.", "error"); return; }

    const savedRoutes = JSON.parse(localStorage.getItem("saved_routes") || "[]");
    const serializableStops = stops.map(s => ({
        ...s,
        location: { lat: s.location.lat(), lng: s.location.lng() }
    }));

    const newId = Date.now();
    savedRoutes.push({ id: newId, name, stops: serializableStops, timestamp: new Date().toISOString() });
    localStorage.setItem("saved_routes", JSON.stringify(savedRoutes));

    currentRouteId = newId; // Now we are working on this new file
    currentRouteName = name;
    updateRouteTitleUI();
    nameInput.value = "";
    document.getElementById("save-modal").classList.add("hidden");
    renderSavedRoutes();
    showNotification(`Route "${name}" saved!`, "success");
}

function overwriteCurrentRoute() {
    if (!currentRouteId) return;

    const savedRoutes = JSON.parse(localStorage.getItem("saved_routes") || "[]");
    const idx = savedRoutes.findIndex(r => r.id === currentRouteId);

    if (idx === -1) {
        showNotification("Original route not found in history.", "error");
        return;
    }

    const serializableStops = stops.map(s => ({
        ...s,
        location: { lat: s.location.lat(), lng: s.location.lng() }
    }));

    // Update existing entry
    savedRoutes[idx].stops = serializableStops;
    savedRoutes[idx].timestamp = new Date().toISOString();

    localStorage.setItem("saved_routes", JSON.stringify(savedRoutes));

    document.getElementById("save-modal").classList.add("hidden");
    renderSavedRoutes();
    showNotification(`Route "${savedRoutes[idx].name}" updated!`, "success");
}

function renderSavedRoutes() {
    const container = document.getElementById("saved-routes-list");
    const savedRoutes = JSON.parse(localStorage.getItem("saved_routes") || "[]");
    container.innerHTML = "";

    if (savedRoutes.length === 0) {
        container.innerHTML = '<div style="padding:8px;color:#70757a;font-size:0.8rem;">No saved routes yet.</div>';
        return;
    }

    savedRoutes.forEach(route => {
        const item = document.createElement("div");
        item.className = "saved-route-item";
        item.innerHTML = `
            <div class="saved-route-name">${route.name}</div>
            <div class="saved-route-actions">
                <button class="delete-route-btn" title="Delete">×</button>
            </div>
        `;
        item.querySelector(".delete-route-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteSavedRoute(route.id);
        });
        item.addEventListener("click", () => loadSavedRoute(route.id));
        container.appendChild(item);
    });
}

function loadSavedRoute(id) {
    const savedRoutes = JSON.parse(localStorage.getItem("saved_routes") || "[]");
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;

    _doReset(); // Clear directly without confirmation
    currentRouteId = id; // Track that we've loaded this file
    currentRouteName = route.name;
    updateRouteTitleUI();

    stops = route.stops.map(s => ({
        ...s,
        location: new google.maps.LatLng(s.location.lat, s.location.lng)
    }));

    renderStopsList();
    refreshMarkerLabels();

    if (stops.length >= 2) calculateRoute();

    // Auto-close History Drawer
    document.getElementById("routes-drawer").classList.add("hidden");
}

function deleteSavedRoute(id) {
    showConfirm("Delete Route", "Are you sure you want to remove this trip from your history? This cannot be undone.", () => {
        let savedRoutes = JSON.parse(localStorage.getItem("saved_routes") || "[]");
        savedRoutes = savedRoutes.filter(r => r.id !== id);
        localStorage.setItem("saved_routes", JSON.stringify(savedRoutes));
        renderSavedRoutes();
        showNotification("Route deleted", "info");
    });
}
