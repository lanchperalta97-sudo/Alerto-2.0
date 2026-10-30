
import { db } from "./firebase-config.js";

import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// ALERTO SETTINGS
// Only configure an SMS number after official PNP authorization.
const PNP_SMS_NUMBER = "";

const REPORTS_COLLECTION = "emergencyReports";

let currentLatitude = null;
let currentLongitude = null;
let authReady = false;

// FIREBASE AUTHENTICATION
const auth = getAuth();

const authPromise = signInAnonymously(auth)
    .then(() => {
        authReady = true;
        console.log("ALERTO Firebase authentication successful.");
    })
    .catch(error => {
        console.error("Firebase authentication failed:", error);
        authReady = false;
    });

// HTML ELEMENTS
const internetElement = document.getElementById("internet");
const gpsElement = document.getElementById("gps");
const smsElement = document.getElementById("sms");
const modeElement = document.getElementById("mode");
const locationText = document.getElementById("locationText");
const reportCoordinates = document.getElementById("reportCoordinates");

const reportPanel = document.getElementById("reportPanel");
const historyPanel = document.getElementById("historyPanel");
const helpPanel = document.getElementById("helpPanel");

// INTERNET STATUS
function checkInternet() {
    if (navigator.onLine) {
        internetElement.textContent = "Connected";
        modeElement.textContent = "ONLINE";
        modeElement.className = "status online";
    } else {
        internetElement.textContent = "Disconnected";
        modeElement.textContent = "OFFLINE MODE";
        modeElement.className = "status offline";
    }
}

window.addEventListener("online", checkInternet);
window.addEventListener("offline", checkInternet);

checkInternet();

window.addEventListener("online", syncPendingReports);

// SMS STATUS
smsElement.textContent = "Check phone and SIM";

// GPS FUNCTION
function getGPS() {
    if (!navigator.geolocation) {
        gpsElement.textContent = "Not supported";
        locationText.textContent = "GPS is not supported.";
        return;
    }

    gpsElement.textContent = "Getting location...";
    locationText.textContent = "Waiting for GPS coordinates...";

    navigator.geolocation.getCurrentPosition(
        function(position) {
            currentLatitude = position.coords.latitude;
            currentLongitude = position.coords.longitude;

            gpsElement.textContent = "Available";

            locationText.textContent =
                "Latitude: " + currentLatitude.toFixed(6) +
                "\nLongitude: " + currentLongitude.toFixed(6);

            reportCoordinates.textContent =
                currentLatitude.toFixed(6) + ", " +
                currentLongitude.toFixed(6);
        },

        function(error) {
            gpsElement.textContent = "Unavailable";
            locationText.textContent =
                "Unable to get GPS location. Check permissions and location settings.";
        },

        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
}

document.getElementById("refreshGPS")
    .addEventListener("click", getGPS);

getGPS();

// LOCAL REPORT STORAGE
function getReports() {
    try {
        return JSON.parse(
            localStorage.getItem("alertoReports") || "[]"
        );
    } catch {
        return [];
    }
}

function saveReport(report) {
    const reports = getReports();

    const index = reports.findIndex(
        item => item.id === report.id
    );

    if (index === -1) {
        reports.unshift(report);
    } else {
        reports[index] = report;
    }

    localStorage.setItem(
        "alertoReports",
        JSON.stringify(reports)
    );
}

// FIREBASE SUBMISSION
async function submitToFirebase(report) {
    if (!navigator.onLine) {
        return false;
    }

    await authPromise;

    if (!authReady) {
        throw new Error("Firebase authentication is not ready.");
    }

    const docRef = await addDoc(
        collection(db, REPORTS_COLLECTION),
        {
            incidentId: report.id,
            incidentType: report.incidentType,
            description: report.description,
            latitude: report.latitude,
            longitude: report.longitude,
            createdAt: serverTimestamp(),
            communicationMethod: "Internet",
            status: "Received by ALERTO server"
        }
    );

    report.firebaseDocId = docRef.id;
    report.status = "Received by ALERTO server";
    report.syncStatus = "Synced";

    saveReport(report);

    return true;
}

// SYNC REPORTS THAT WERE SAVED WHILE OFFLINE
async function syncPendingReports() {
    if (!navigator.onLine) return;

    const reports = getReports();

    for (const report of reports) {
        if (report.syncStatus !== "Pending") continue;

        try {
            await submitToFirebase(report);
            console.log("Synced report:", report.id);
        } catch (error) {
            console.error("Could not sync report:", report.id, error);
            break;
        }
    }

    showHistory();
}

// OPEN EMERGENCY FORM
document.getElementById("sosButton")
    .addEventListener("click", function() {
        reportPanel.classList.remove("hidden");
        historyPanel.classList.add("hidden");
        helpPanel.classList.add("hidden");

        if (currentLatitude === null) {
            getGPS();
        }

        reportPanel.scrollIntoView({
            behavior: "smooth"
        });
    });

// GENERATE INCIDENT ID
function generateIncidentID() {
    return "ALT-" + Date.now().toString().slice(-10);
}

// SUBMIT EMERGENCY REPORT
document.getElementById("sendReport")
    .addEventListener("click", async function() {

        if (currentLatitude === null ||
            currentLongitude === null) {
            alert("GPS location is unavailable. Please obtain your location first.");
            return;
        }

        const incidentType =
            document.getElementById("incidentType").value;

        const description =
            document.getElementById("description").value.trim();

        if (!description) {
            alert("Please enter a description of the incident.");
            return;
        }

        const sendButton = document.getElementById("sendReport");
        sendButton.disabled = true;

        const incidentID = generateIncidentID();

        const report = {
            id: incidentID,
            incidentType: incidentType,
            description: description,
            latitude: currentLatitude,
            longitude: currentLongitude,
            createdAt: new Date().toISOString(),
            communicationMethod: navigator.onLine ? "Internet" : "Offline",
            status: navigator.onLine ? "Submitting..." : "Saved offline",
            syncStatus: navigator.onLine ? "Pending" : "Pending"
        };

        // Save locally first.
        saveReport(report);

        if (navigator.onLine) {
            try {
                await submitToFirebase(report);

                alert(
                    "Your report was uploaded to ALERTO.\n\n" +
                    "Incident ID: " + incidentID +
                    "\nThe PNP dashboard can retrieve this report."
                );
            } catch (error) {
                console.error("Firebase submission error:", error);

                report.status = "Saved locally - upload failed";
                report.syncStatus = "Pending";
                saveReport(report);

                alert(
                    "Your report is saved on this device, " +
                    "but could not be uploaded to Firebase.\n\n" +
                    "It will be retried when the connection is available.\n\n" +
                    "Incident ID: " + incidentID
                );
            }
        } else {
            alert(
                "You are offline.\n\n" +
                "Your report is saved on this device and will be " +
                "queued for upload when internet returns.\n\n" +
                "Incident ID: " + incidentID +
                "\n\nIt has NOT yet reached the PNP dashboard."
            );
        }

        sendButton.disabled = false;
        showHistory();
    });

// DISPLAY HISTORY
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function(char) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char];
    });
}

function showHistory() {
    const reports = getReports();
    const history = document.getElementById("reportHistory");

    if (reports.length === 0) {
        history.textContent = "No reports yet.";
    } else {
        history.innerHTML = reports.map(report => `
            <div class="location-card">
                <strong>${escapeHTML(report.id)}</strong>
                <p>${escapeHTML(report.incidentType)}</p>
                <p>Latitude: ${Number(report.latitude).toFixed(6)}</p>
                <p>Longitude: ${Number(report.longitude).toFixed(6)}</p>
                <p>Status: ${escapeHTML(report.status)}</p>
                <p>${escapeHTML(new Date(report.createdAt).toLocaleString())}</p>
            </div>
        `).join("");
    }

    historyPanel.classList.remove("hidden");
    reportPanel.classList.add("hidden");
    helpPanel.classList.add("hidden");
}

document.getElementById("historyButton")
    .addEventListener("click", showHistory);

document.getElementById("closeHistory")
    .addEventListener("click", function() {
        historyPanel.classList.add("hidden");
    });

// HELP
document.getElementById("helpButton")
    .addEventListener("click", function() {
        helpPanel.classList.remove("hidden");
        reportPanel.classList.add("hidden");
        historyPanel.classList.add("hidden");
    });

document.getElementById("closeHelp")
    .addEventListener("click", function() {
        helpPanel.classList.add("hidden");
    });

// CANCEL REPORT
document.getElementById("cancelReport")
    .addEventListener("click", function() {
        reportPanel.classList.add("hidden");
    });

// OFFLINE APP SUPPORT
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker.register("./sw.js")
            .catch(error => {
                console.error("Offline setup failed:", error);
            });
    });
}
