/**
 * TravelLog Core Module
 * Handles media capture logic, geotagging, and IndexedDB persistence.
 * Standalone - no hard dependencies on app.js.
 */
const TravelLog = (function() {
    const DB_NAME = 'TravelLogDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'memories';
    let db = null;

    /**
     * Initialize the TravelLog subsystem and IndexedDB.
     */
    async function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log("TravelLog: IndexedDB initialized successfully.");
                resolve(true);
            };

            request.onerror = (event) => {
                console.error("TravelLog: Database error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get current GPS coordinates.
     */
    async function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation not supported."));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                }),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
    }

    /**
     * Save a memory (photo, video, or voice) to IndexedDB.
     * @param {Object} entry { type, blob, lat, lng, timestamp, note }
     */
    async function saveEntry(entry) {
        if (!db) await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const record = {
                ...entry,
                timestamp: entry.timestamp || Date.now(),
                synced: false
            };

            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Retrieve all local memories.
     */
    async function getAllEntries() {
        if (!db) await init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Capture a photo from the camera.
     */
    async function capturePhoto() {
        console.log("TravelLog: Capturing photo...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        
        // Stop the stream
        stream.getTracks().forEach(track => track.stop());

        const location = await getCurrentLocation().catch(() => ({ lat: 0, lng: 0 }));
        const id = await saveEntry({
            type: 'photo',
            blob: blob,
            lat: location.lat,
            lng: location.lng,
            timestamp: Date.now()
        });

        console.log(`TravelLog: Photo saved with ID ${id}`);
        return id;
    }

    /**
     * Start recording audio or video.
     */
    let mediaRecorder = null;
    let recordedChunks = [];

    async function startRecording(type = 'video') {
        recordedChunks = [];
        const constraints = type === 'video' ? { video: true, audio: true } : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
            stream.getTracks().forEach(track => track.stop());
            
            const location = await getCurrentLocation().catch(() => ({ lat: 0, lng: 0 }));
            const id = await saveEntry({
                type: type,
                blob: blob,
                lat: location.lat,
                lng: location.lng,
                timestamp: Date.now()
            });
            console.log(`TravelLog: ${type} recording saved with ID ${id}`);
        };

        mediaRecorder.start();
        console.log(`TravelLog: Started ${type} recording...`);
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            console.log("TravelLog: Stopped recording.");
        }
    }

    /**
     * Sync unsynced entries to Google Drive.
     */
    async function syncEntries() {
        if (!window.GDriveManager || !GDriveManager.canSync()) return;

        console.log("TravelLog: Checking for unsynced entries...");
        const entries = await getAllEntries();
        const unsynced = entries.filter(e => !e.synced);

        for (const entry of unsynced) {
            try {
                const metadata = {
                    name: `Memory_${entry.type}_${new Date(entry.timestamp).toISOString()}.webm`,
                    mimeType: entry.blob.type
                };
                await GDriveManager.uploadFile(entry.blob, metadata);
                
                // Mark as synced locally
                entry.synced = true;
                await saveEntry(entry, true); // Update existing
                console.log(`TravelLog: Synced entry ${entry.id} to GDrive.`);
                
                if (window.TravelLogUI && window.TravelLogUI.refreshTimeline) {
                    window.TravelLogUI.refreshTimeline();
                }
            } catch (err) {
                console.error(`TravelLog: Sync failed for entry ${entry.id}:`, err);
                break; // Stop if sync fails (e.g. token expired)
            }
        }
    }

    /**
     * Start a periodic sync check.
     */
    function startSyncInterval(intervalMs = 60000) {
        setInterval(() => {
            syncEntries();
        }, intervalMs);
    }

    // Public API
    return {
        init,
        getCurrentLocation,
        saveEntry,
        getAllEntries,
        capturePhoto,
        startRecording,
        stopRecording,
        syncEntries,
        startSyncInterval
    };
})();

// Export for browser
window.TravelLog = TravelLog;
