/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

exports.extractLocation = onCall({ region: "asia-south1" }, async (request) => {
    const url = request.data.url;

    if (!url) {
        throw new HttpsError("invalid-argument", "Google Maps URL is required.");
    }

    try {
        const res = await fetch(url, { method: "GET", redirect: "follow" });
        const finalUrl = res.url;

        const match = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

        if (match) {
            return {
                lat: parseFloat(match[1]),
                lng: parseFloat(match[2])
            };
        }

        return { lat: null, lng: null };

    } catch (error) {
        console.error(error);
        throw new HttpsError("internal", "Failed to parse the Google Maps URL.");
    }
});

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
