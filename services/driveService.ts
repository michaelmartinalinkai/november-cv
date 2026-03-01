// This service handles interactions with the Google Drive Picker API and Google Identity Services
declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

export const loadGoogleScripts = () => {
  return new Promise<void>((resolve, reject) => {
    // 1. Check if already loaded
    if (window.google && window.google.picker && window.gapi && window.google.accounts) {
      resolve();
      return;
    }

    // 2. Set a timeout to reject if scripts take too long (e.g. adblocker)
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error("Google API scripts failed to load. Please check your ad blocker or network connection."));
    }, 10000); // 10 seconds

    // 3. Poll for gapi and google.accounts
    const checkInterval = setInterval(() => {
      if (window.gapi && window.google && window.google.accounts) {
        // Load the specific 'picker' module from gapi
        window.gapi.load('picker', { 
          callback: () => {
             clearInterval(checkInterval);
             clearTimeout(timeout);
             resolve();
          },
          onerror: () => {
             clearInterval(checkInterval);
             clearTimeout(timeout);
             reject(new Error("Failed to load Google Picker module."));
          }
        });
      }
    }, 200);
  });
};

/**
 * Authenticates the user with Google and returns an Access Token.
 * Wraps the callback-based initTokenClient in a Promise.
 */
export const authenticateWithGoogle = (clientId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts) {
      reject(new Error("Google Identity Services not loaded. Please refresh the page."));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            console.error("Token Response Error:", response);
            reject(new Error(`Access Denied: ${response.error_description || response.error}`));
          } else if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error("No access token received from Google."));
          }
        },
        error_callback: (err: any) => {
           console.error("Auth Error:", err);
           if (err.type === 'popup_closed') {
             // Treat popup close as a specific error message or just ignore if handled upstream
             reject(new Error("Authentication cancelled (popup closed)."));
           } else {
             reject(new Error(`Authentication Failed: ${err.message || err.type}`));
           }
        }
      });
      
      // Request token
      client.requestAccessToken();
    } catch (e: any) {
      reject(new Error(`Failed to initialize Google Auth: ${e.message}`));
    }
  });
};

export const openDrivePicker = async (clientId: string, apiKey: string, accessToken: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.picker) {
      reject(new Error("Google Picker API is not loaded. Refresh the page and try again."));
      return;
    }

    try {
      const pickerCallback = (data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const documents = data.docs;
          resolve(documents);
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve([]);
        } else if (data.action === window.google.picker.Action.ERROR) {
           console.error("Picker Error Data:", data);
           reject(new Error("Google Drive Picker encountered an error. Please check your API Key restrictions and Authorized Origins in Google Cloud Console."));
        }
      };

      const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
      view.setMimeTypes("application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg");

      const pickerBuilder = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(clientId)
        .setOAuthToken(accessToken)
        .addView(view)
        .setDeveloperKey(apiKey)
        .setCallback(pickerCallback);

      const picker = pickerBuilder.build();
      picker.setVisible(true);
    } catch (e: any) {
      console.error("Picker Build Error:", e);
      reject(new Error(`Failed to initialize Google Picker. Verify your Client ID and API Key. Details: ${e.message || e}`));
    }
  });
};

// Helper to download file content from Drive
export const downloadDriveFile = async (fileId: string, accessToken: string): Promise<Blob> => {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 403) throw new Error("Permission denied. The file might be restricted.");
      if (response.status === 404) throw new Error("File not found on Google Drive.");
      throw new Error(`Drive Download Error: ${response.status} ${response.statusText}`);
    }
    
    return await response.blob();
  } catch (error: any) {
    throw new Error(error.message || "Network error while downloading file from Drive.");
  }
};