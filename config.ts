export const config = {
    // Read from Environment Variables (Secure)
    geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || "",

    // Read from Environment Variables (Secure)
    trackingUrl: import.meta.env.VITE_TRACKING_URL || ""
};
