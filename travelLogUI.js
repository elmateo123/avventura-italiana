/**
 * TravelLog UI Module
 * Handles all visual components (FAB, Timeline, Overlays).
 * Communicates with TravelLog core via the public API.
 */
const TravelLogUI = (function() {
    let container = null;
    let map = null;
    let memoryMarkers = [];

    /**
     * Initialize UI components.
     * @param {HTMLElement} parentContainer The element to attach the UI to.
     * @param {google.maps.Map} mapInstance The Google Maps instance.
     */
    function init(parentContainer, mapInstance) {
        container = parentContainer;
        map = mapInstance;
        console.log("TravelLogUI: Initializing...");
        
        renderFAB();
        renderTimeline();
        refreshTimeline();
    }

    /**
     * Create the floating action button for recording.
     */
    function renderFAB() {
        const fab = document.createElement("div");
        fab.id = "travel-log-fab";
        fab.className = "fab-container"; // Removed hidden for development/verification
        fab.innerHTML = `
            <button class="fab-main" title="Record Memory">📸</button>
            <div class="fab-options">
                <button class="fab-opt" data-type="photo" title="Take Photo">📷</button>
                <button class="fab-opt" data-type="video" title="Record Video">🎥</button>
                <button class="fab-opt" data-type="audio" title="Voice Note">🎤</button>
            </div>
        `;
        document.body.appendChild(fab);

        // Event Listeners for FAB
        fab.querySelectorAll(".fab-opt").forEach(btn => {
            btn.addEventListener("click", () => {
                const type = btn.dataset.type;
                handleCaptureRequest(type);
            });
        });

        console.log("TravelLogUI: FAB rendered and listeners attached.");
    }

    /**
     * Handle capture request from UI.
     */
    async function handleCaptureRequest(type) {
        console.log(`TravelLogUI: Capture requested for type: ${type}`);
        
        try {
            if (type === 'photo') {
                await TravelLog.capturePhoto();
                showNotification("Photo captured and geotagged!", "success");
            } else {
                // Start Audio/Video Recording
                await TravelLog.startRecording(type);
                toggleRecordingUI(true, type);
            }
            refreshTimeline();
        } catch (err) {
            console.error("TravelLogUI: Capture failed:", err);
            showNotification(`Capture failed: ${err.message}`, "error");
        }
    }

    /**
     * Update the FAB to show recording state.
     */
    function toggleRecordingUI(isRecording, type = 'video') {
        const fab = document.getElementById("travel-log-fab");
        const mainBtn = fab.querySelector(".fab-main");
        
        if (isRecording) {
            mainBtn.innerHTML = "⏹️";
            mainBtn.classList.add("recording");
            mainBtn.title = "Stop Recording";
            mainBtn.onclick = async () => {
                await TravelLog.stopRecording();
                toggleRecordingUI(false);
                refreshTimeline();
            };
        } else {
            mainBtn.innerHTML = "📸";
            mainBtn.classList.remove("recording");
            mainBtn.title = "Record Memory";
            mainBtn.onclick = null; // Revert to hover behavior
        }
    }

    /**
     * Refresh the timeline view.
     */
    async function refreshTimeline() {
        const list = document.getElementById("memory-list");
        const entries = await TravelLog.getAllEntries();
        
        // Clear existing markers
        memoryMarkers.forEach(m => m.setMap(null));
        memoryMarkers = [];

        if (entries.length === 0) return;

        list.innerHTML = entries.reverse().map(entry => {
            const dateStr = new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const mediaUrl = URL.createObjectURL(entry.blob);
            
            // Add marker to map
            if (map) {
                const marker = new google.maps.Marker({
                    position: { lat: entry.lat, lng: entry.lng },
                    map: map,
                    title: `${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} - ${dateStr}`,
                    icon: {
                        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
                                <circle cx="15" cy="15" r="13" fill="white" stroke="%231a73e8" stroke-width="2"/>
                                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="16">${entry.type === 'photo' ? '📷' : entry.type === 'video' ? '🎥' : '🎤'}</text>
                            </svg>
                        `)}`,
                        scaledSize: new google.maps.Size(30, 30),
                        anchor: new google.maps.Point(15, 15)
                    }
                });
                memoryMarkers.push(marker);
            }

            let previewHtml = '';
            if (entry.type === 'photo') {
                previewHtml = `<img src="${mediaUrl}" class="memory-preview" alt="Memory Photo">`;
            } else if (entry.type === 'video') {
                previewHtml = `<video src="${mediaUrl}" class="memory-preview"></video>`;
            } else if (entry.type === 'audio') {
                previewHtml = `<div class="memory-preview audio-placeholder" style="display: flex; align-items: center; justify-content: center; background: #f0f0f0; font-size: 1.2rem;">🎵</div>`;
            }

            return `
                <div class="memory-item">
                    <div class="memory-icon-container" style="position: relative;">
                        <div class="memory-icon">${entry.type === 'photo' ? '📷' : entry.type === 'video' ? '🎥' : '🎤'}</div>
                        <div class="sync-badge" style="position: absolute; bottom: -5px; right: -5px; font-size: 0.7rem; background: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                            ${entry.synced ? '☁️' : '⏳'}
                        </div>
                    </div>
                    <div class="memory-details">
                        <div class="memory-time">${dateStr}</div>
                        <div class="memory-note">${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} recorded</div>
                        ${previewHtml}
                        <div class="memory-coords" style="font-size: 0.6rem; color: var(--text-muted); margin-top: 5px;">
                            📍 ${entry.lat.toFixed(4)}, ${entry.lng.toFixed(4)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render the timeline container in the sidebar.
     */
    function renderTimeline() {
        if (!container) return;
        
        const storyline = document.createElement("div");
        storyline.className = "storyline-container";
        storyline.innerHTML = `
            <div class="storyline-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 class="storyline-title" style="margin: 0;">Travel Log</h3>
                <div style="display: flex; gap: 5px;">
                    <button id="sync-now-btn" class="icon-btn" title="Sync Now" style="padding: 4px 8px; font-size: 0.8rem; display: none;">🔄</button>
                    <button id="gdrive-connect-btn" class="icon-btn" title="Connect Google Drive" style="font-size: 0.9rem; padding: 4px 8px;">☁️ Connect</button>
                </div>
            </div>
            <div id="sync-status" style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 10px; display: none;">
                🔄 Syncing to Google Drive...
            </div>
            <div id="memory-list">
                <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 10px;">No memories yet. Start recording!</p>
            </div>
        `;
        container.appendChild(storyline);

        const connectBtn = document.getElementById("gdrive-connect-btn");
        connectBtn.onclick = async () => {
            try {
                connectBtn.innerHTML = "⌛ Wait...";
                await GDriveManager.authenticate();
                connectBtn.innerHTML = "✅ Linked";
                connectBtn.disabled = true;
                document.getElementById("sync-now-btn").style.display = "block";
                document.getElementById("sync-status").style.display = "block";
                showNotification("Google Drive linked successfully!", "success");
            } catch (err) {
                console.error("TravelLogUI: OAuth failed:", err);
                connectBtn.innerHTML = "☁️ Retry";
                showNotification("Failed to link Google Drive.", "error");
            }
        };

        const syncNowBtn = document.getElementById("sync-now-btn");
        syncNowBtn.onclick = async () => {
            syncNowBtn.style.animation = "spin 1s linear infinite";
            await TravelLog.syncEntries();
            syncNowBtn.style.animation = "none";
        };

        console.log("TravelLogUI: Timeline rendered.");
    }

    // Helper (assuming app.js showNotification is available, or fallback)
    function showNotification(msg, type) {
        if (window.showNotification) {
            window.showNotification(msg, type);
        } else {
            alert(msg);
        }
    }

    // Public API
    return {
        init,
        refreshTimeline
    };
})();

// Export for browser
window.TravelLogUI = TravelLogUI;
