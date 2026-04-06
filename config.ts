export const config = {
    // Read from Environment Variables (Secure)
    geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || "",

    // Read from Environment Variables (Secure)
    trackingUrl: import.meta.env.VITE_TRACKING_URL || "https://script.google.com/macros/s/AKfycbxG20vPgBLDaPwf7sFKoul5FRXgt3lJQVYSTGyumDEgiWtgqU2E2smDMlKrf4gO9Y4fpw/exec"
};
