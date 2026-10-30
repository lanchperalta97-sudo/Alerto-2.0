
// ALERTO APP SETTINGS

// Add only an officially authorized PNP SMS receiving number.
// Example format: +639XXXXXXXXX
const PNP_SMS_NUMBER = "";

let currentLatitude = null;
let currentLongitude = null;

// HTML elements
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

// SMS STATUS
// A browser cannot reliably detect SIM service or SMS signal.
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

// SAVE REPORT LOCALLY

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
    reports.unshift(report);

    localStorage.setItem(
        "alertoReports",
        JSON.stringify(reports)
    );
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
    return "ALT-" +
        Date.now().toString().slice(-10);
}

// PREPARE EMERGENCY SMS

document.getElementById("sendReport")
    .addEventListener("click", function() {

        if (currentLatitude === null ||
            currentLongitude === null) {

            alert("GPS location is unavailable. Please obtain your location first.");
            return;
        }

        const incidentType =
            document.getElementById("incidentType").value;

        const description =
            document.getElementById("description").value;

        const incidentID = generateIncidentID();

        const report = {
            id: incidentID,
            incidentType: incidentType,
            description: description,
            latitude: currentLatitude,
            longitude: currentLongitude,
            createdAt: new Date().toISOString(),
            communicationMethod: "SMS",
            status: "Saved locally"
        };

        // Save the report before attempting transmission.
        saveReport(report);

        const message =
            "ALERTO EMERGENCY REPORT\n" +
            "ID: " + incidentID + "\n" +
            "TYPE: " + incidentType + "\n" +
            "LAT: " + currentLatitude.toFixed(6) + "\n" +
            "LON: " + currentLongitude.toFixed(6) + "\n" +
            "TIME: " + report.createdAt + "\n" +
            "DETAILS: " + description;

        if (!PNP_SMS_NUMBER) {
            alert(
                "Report saved on this device.\n\n" +
                "No authorized PNP SMS number is configured. " +
                "The report has NOT been transmitted."
            );

            showHistory();
            return;
        }

        const confirmed = confirm(
            "Prepare this emergency report for SMS?\n\n" +
            "Incident ID: " + incidentID
        );

        if (!confirmed) return;

        const smsLink =
            "sms:" + PNP_SMS_NUMBER +
            "?body=" + encodeURIComponent(message);

        window.location.href = smsLink;

        alert(
            "The SMS application should open. " +
            "Review the message and press Send. " +
            "ALERTO cannot confirm delivery from this browser."
        );

        report.status = "SMS prepared; delivery unconfirmed";

        const reports = getReports();
        const index = reports.findIndex(
            item => item.id === incidentID
        );

        if (index !== -1) {
            reports[index] = report;
            localStorage.setItem(
                "alertoReports",
                JSON.stringify(reports)
            );
        }

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
