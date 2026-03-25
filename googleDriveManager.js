/**
 * GoogleDriveManager Module
 * Handles OAuth 2.0 authentication and file uploads to Google Drive.
 * Includes "Smart Sync" logic for connectivity awareness.
 */
const GDriveManager = (function() {
    let accessToken = null;
    let clientConfig = {
        clientId: '1092947383776-7j7s8rls7n3hp7u26anc02dq1kgt09fk.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file'
    };
    let appFolderId = null;

    /**
     * Set the Google Client ID.
     */
    function setConfig(id) {
        clientConfig.clientId = id;
    }

    /**
     * Request an access token from the user.
     */
    async function authenticate() {
        return new Promise((resolve, reject) => {
            if (!clientConfig.clientId) {
                reject(new Error("Google Client ID is missing."));
                return;
            }

            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientConfig.clientId,
                scope: clientConfig.scope,
                callback: (response) => {
                    if (response.error) {
                        reject(response);
                    } else {
                        accessToken = response.access_token;
                        console.log("GDriveManager: Authenticated successfully.");
                        resolve(accessToken);
                    }
                },
            });
            client.requestAccessToken();
        });
    }

    /**
     * Check if current connection allows syncing (Wi-Fi vs Cellular).
     * @param {boolean} allowCellular User preference.
     */
    function canSync(allowCellular = false) {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) return true; // Fallback if API not supported
        
        console.log(`GDriveManager: Connection type: ${conn.type}`);
        if (conn.type === 'wifi' || conn.type === 'ethernet') return true;
        return allowCellular; // Only sync on cellular if explicitly allowed
    }

    /**
     * Upload a blob to Google Drive using a resumable upload.
     * @param {Blob} blob The media file.
     * @param {Object} metadata { name, mimeType, parents: [folderId] }
     */
    async function uploadFile(blob, metadata) {
        if (!accessToken) throw new Error("Not authenticated.");

        // Ensure we have a folder
        if (!metadata.parents && !appFolderId) {
            appFolderId = await getOrCreateFolder("Avventura Italiana - Travel Log");
        }
        if (!metadata.parents) metadata.parents = [appFolderId];

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });

        if (!response.ok) throw new Error("Upload failed: " + response.statusText);
        return await response.json();
    }

    /**
     * Find or create a dedicated folder for the travel log.
     */
    async function getOrCreateFolder(folderName) {
        if (!accessToken) throw new Error("Not authenticated.");

        const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        const results = await search.json();

        if (results.files && results.files.length > 0) {
            return results.files[0].id;
        }

        // Create it
        const create = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        const newFolder = await create.json();
        return newFolder.id;
    }

    // Public API
    return {
        setConfig,
        authenticate,
        canSync,
        uploadFile,
        getOrCreateFolder
    };
})();

// Export for browser
window.GDriveManager = GDriveManager;
