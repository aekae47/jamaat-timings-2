/**
 * Import function triggers
 */

const {setGlobalOptions} = require("firebase-functions");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

// Optional: limit instances
setGlobalOptions({maxInstances: 10});

exports.extractLocation = onCall({region: "asia-south1"}, async (request) => {
  const url = request.data.url;

  if (!url) {
    throw new HttpsError("invalid-argument", "Google Maps URL is required.");
  }

  try {
    const res = await fetch(url, {method: "GET", redirect: "follow"});
    const finalUrl = res.url;

    // Try multiple patterns to extract coordinates
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/, // Standard @lat,lng
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // Data parameters !3dLat!4dLng
      /query=(-?\d+\.\d+),(-?\d+\.\d+)/, // Query parameters
      /\?q=(-?\d+\.\d+),(-?\d+\.\d+)/, // Search parameters
    ];

    for (const pattern of patterns) {
      const match = finalUrl.match(pattern);
      if (match) {
        return {
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2]),
        };
      }
    }

    return {lat: null, lng: null};
  } catch (error) {
    console.error(error);
    throw new HttpsError("internal", "Failed to parse the Google Maps URL.");
  }
});
