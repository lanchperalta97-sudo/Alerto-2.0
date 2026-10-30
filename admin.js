
import { db } from "./firebase-config.js";

import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Only this administrator UID can use this dashboard.
const ADMIN_UID = "R669uWbRnUbzhM2WSRKDXmdjG2E2";

const auth = getAuth();

const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

const reportsList = document.getElementById("reportsList");

let map = null;
let markers = {};
let unsubscribeReports = null;


// MAP INITIALIZATION
function initializeMap() {
    if (map) return;

    // Initial map center: San Miguel, Bulacan.
    map = L.map("map").setView([14.79, 120.99], 12);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }
    ).addTo(map);
}


// HTML ESCAPING
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}


// DATE FORMATTING
function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = value.toDate
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleString();
}


// SUMMARY COUNTS
function updateSummary(reports) {
    document.getElementById("totalReports").textContent =
        reports.length;

    document.getElementById("receivedReports").textContent =
        reports.filter(report =>
            report.status === "Received by ALERTO server"
        ).length;

    document.getElementById("reviewReports").textContent =
        reports.filter(report =>
            report.status === "Under Review"
        ).length;

    document.getElementById("dispatchedReports").textContent =
        reports.filter(report =>
            report.status === "Dispatched"
        ).length;

    document.getElementById("reportCount").textContent =
        reports.length + (reports.length === 1 ? " report" : " reports");
}


// CREATE MAP MARKER
function addReportMarker(report, documentId) {
    const latitude = Number(report.latitude);
    const longitude = Number(report.longitude);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return;
    }

    const popupContent = `
        <strong>${escapeHTML(report.incidentId)}</strong>
        <br>
        ${escapeHTML(report.incidentType)}
        <br>
        Status: ${escapeHTML(report.status)}
    `;

    if (markers[documentId]) {
        markers[documentId].setLatLng([latitude, longitude]);
        markers[documentId].setPopupContent(popupContent);
    } else {
        markers[documentId] = L.marker([
            latitude,
            longitude
        ]).addTo(map);

        markers[documentId].bindPopup(popupContent);
    }
}


// DISPLAY REPORTS
function displayReports(reports) {
    updateSummary(reports);

    const currentIds = new Set(reports.map(report => report.documentId));

    // Remove markers for reports no longer in the query.
    Object.keys(markers).forEach(id => {
        if (!currentIds.has(id)) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    });

    if (reports.length === 0) {
        reportsList.innerHTML = `
            <p class="empty-message">
                No emergency reports have been received yet.
            </p>
        `;
        return;
    }

    reportsList.innerHTML = reports.map(report => `
        <article
    class="report-card"
    data-report-id="${escapeHTML(report.documentId)}"
    title="Click to view this report on the map"
>
            <h3>${escapeHTML(report.incidentType)}</h3>

            <p class="incident-id">
                ${escapeHTML(report.incidentId)}
            </p>

            <p>
                ${escapeHTML(report.description)}
            </p>

            <p>
                <strong>Coordinates:</strong><br>
                ${Number(report.latitude).toFixed(6)},
                ${Number(report.longitude).toFixed(6)}
            </p>

            <p>
                <strong>Submitted:</strong><br>
                ${escapeHTML(formatDate(report.createdAt))}
            </p>

            <p>
                <strong>Connection:</strong>
                ${escapeHTML(report.communicationMethod)}
            </p>

            <span class="report-status">
                ${escapeHTML(report.status)}
            </span>

            <select
                class="status-select"
                data-id="${escapeHTML(report.documentId)}"
                aria-label="Change report status"
            >
                <option value="Received by ALERTO server"
                    ${report.status === "Received by ALERTO server" ? "selected" : ""}>
                    Received
                </option>

                <option value="Under Review"
                    ${report.status === "Under Review" ? "selected" : ""}>
                    Under Review
                </option>

                <option value="Dispatched"
                    ${report.status === "Dispatched" ? "selected" : ""}>
                    Dispatched
                </option>

                <option value="Resolved"
                    ${report.status === "Resolved" ? "selected" : ""}>
                    Resolved
                </option>
            </select>
        </article>
    `).join("");

    reports.forEach(report => {
        addReportMarker(report, report.documentId);
    });
}


// CHANGE REPORT STATUS
reportsList.addEventListener("change", async function(event) {
    const select = event.target.closest(".status-select");

    if (!select) return;

    const documentId = select.dataset.id;
    const newStatus = select.value;

    const allowedStatuses = [
        "Received by ALERTO server",
        "Under Review",
        "Dispatched",
        "Resolved"
    ];

    if (!allowedStatuses.includes(newStatus)) {
        alert("Invalid report status.");
        return;
    }

    select.disabled = true;

    try {
        await updateDoc(
            doc(db, "emergencyReports", documentId),
            { status: newStatus }
        );

        console.log("Report status updated:", documentId);
    } catch (error) {
        console.error("Status update failed:", error);
        alert("Could not update report status. Check your access and internet connection.");
    } finally {
        select.disabled = false;
    }
});


// LIVE FIRESTORE LISTENER
function loadReports() {
    if (unsubscribeReports) {
        unsubscribeReports();
    }

    initializeMap();

    const reportsQuery = query(
        collection(db, "emergencyReports"),
        orderBy("createdAt", "desc")
    );

    unsubscribeReports = onSnapshot(
        reportsQuery,
        snapshot => {
            const reports = snapshot.docs.map(item => ({
                documentId: item.id,
                ...item.data()
            }));

            displayReports(reports);
            
// CLICK REPORT TO FOCUS ITS MAP LOCATION
reportsList.addEventListener("click", function(event) {
    // Ignore clicks on the status dropdown.
    if (event.target.closest(".status-select")) return;

    const reportCard = event.target.closest(".report-card");

    if (!reportCard) return;

    const documentId = reportCard.dataset.reportId;
    const marker = markers[documentId];

    if (!marker || !map) {
        alert("This report does not have valid GPS coordinates.");
        return;
    }

    const position = marker.getLatLng();

    // Zoom into the selected report's location.
    map.flyTo(position, 17, {
        animate: true,
        duration: 1.2
    });

    // Open the corresponding map pin.
    marker.openPopup();

    // Scroll the map into view.
    document.getElementById("map").scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
});

        },
        error => {
            console.error("Could not load reports:", error);

            reportsList.innerHTML = `
                <p class="empty-message">
                    Unable to load reports. Check administrator permissions and internet connection.
                </p>
            `;
        }
    );
}


// ADMIN LOGIN
loginForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";
    loginMessage.textContent = "";

    try {
        const credential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        if (credential.user.uid !== ADMIN_UID) {
            await signOut(auth);
            throw new Error("This account is not authorized for the ALERTO administrator dashboard.");
        }

        // onAuthStateChanged will display the dashboard.
    } catch (error) {
        console.error("Admin login failed:", error);

        loginMessage.textContent =
            error.code === "auth/invalid-credential"
                ? "Incorrect email or password."
                : error.message;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Sign In";
    }
});


// ADMIN LOGOUT
document.getElementById("logoutButton")
    .addEventListener("click", async function() {
        if (unsubscribeReports) {
            unsubscribeReports();
            unsubscribeReports = null;
        }

        await signOut(auth);
    });


// CHECK LOGIN SESSION
onAuthStateChanged(auth, user => {
    if (user && user.uid === ADMIN_UID) {
        loginScreen.classList.add("hidden");
        dashboard.classList.remove("hidden");

        document.getElementById("adminEmailDisplay").textContent =
            user.email || "Administrator";

        loadReports();
    } else {
        loginScreen.classList.remove("hidden");
        dashboard.classList.add("hidden");

        if (unsubscribeReports) {
            unsubscribeReports();
            unsubscribeReports = null;
        }

        if (map) {
            map.remove();
            map = null;
            markers = {};
        }
    }
});
