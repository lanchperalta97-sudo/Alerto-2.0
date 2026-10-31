
import { db } from "./firebase-config.js";

import {
    collection,
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

// ADMIN CONFIGURATION
const ADMIN_UID = "R669uWbRnUbzhM2WSRKDXmdjG2E2";

const auth = getAuth();

const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const reportsList = document.getElementById("reportsList");

const verificationList = document.getElementById("verificationList");
const verificationCount = document.getElementById("verificationCount");

let map = null;
let markers = {};
let unsubscribeReports = null;
let unsubscribeUsers = null;

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

// MAP INITIALIZATION
function initializeMap() {
    if (map) return;

    map = L.map("map").setView([14.79, 120.99], 12);

    L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Tiles &copy; Esri",
            maxZoom: 19
        }
    ).addTo(map);
}

// SUMMARY COUNTS
function updateSummary(reports) {
    const updateElement = (id, value) => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    };

    updateElement("totalReports", reports.length);

    updateElement(
        "receivedReports",
        reports.filter(report =>
            report.status === "Received by ALERTO server"
        ).length
    );

    updateElement(
        "reviewReports",
        reports.filter(report =>
            report.status === "Under Review"
        ).length
    );

    updateElement(
        "dispatchedReports",
        reports.filter(report =>
            report.status === "Dispatched"
        ).length
    );

    updateElement(
        "resolvedReports",
        reports.filter(report =>
            report.status === "Resolved"
        ).length
    );

    updateElement(
        "reportCount",
        reports.length + (reports.length === 1 ? " report" : " reports")
    );
}

// CREATE OR UPDATE MAP MARKER
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
        console.warn("Invalid GPS coordinates:", documentId);
        return;
    }

    const directionsURL =
        `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;

    const popupContent = `
        <div>
            <strong>${escapeHTML(report.incidentId)}</strong><br>
            ${escapeHTML(report.incidentType)}<br>
            Status: ${escapeHTML(report.status)}
            <br><br>
            <a href="${directionsURL}"
               target="_blank"
               rel="noopener noreferrer">
                Get Directions
            </a>
        </div>
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

    const currentIds = new Set(
        reports.map(report => report.documentId)
    );

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

    reportsList.innerHTML = reports.map(report => {
        const latitude = Number(report.latitude);
        const longitude = Number(report.longitude);

        const coordinatesValid =
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180;

        return `
            <article
                class="report-card"
                data-report-id="${escapeHTML(report.documentId)}"
                title="Click to view this report on the map"
            >
                <h3>${escapeHTML(report.incidentType)}</h3>

                <p class="incident-id">
                    ${escapeHTML(report.incidentId)}
                </p>

                <p>${escapeHTML(report.description)}</p>

                <p>
                    <strong>Coordinates:</strong><br>
                    ${
                        coordinatesValid
                            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                            : "Invalid GPS coordinates"
                    }
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
        `;
    }).join("");

    reports.forEach(report => {
        addReportMarker(report, report.documentId);
    });

    console.log("Reports displayed:", reports.length);
}

// CLICK REPORT CARD TO FOCUS MAP
reportsList.addEventListener("click", function(event) {
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

    map.flyTo(position, 17, {
        animate: true,
        duration: 1.2
    });

    marker.openPopup();

    document.getElementById("map").scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
});

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
        alert("Could not update report status: " + error.message);

    } finally {
        select.disabled = false;
    }
});

// LOAD REPORTS FROM FIRESTORE
function loadReports() {
    if (unsubscribeReports) {
        unsubscribeReports();
        unsubscribeReports = null;
    }

    initializeMap();

    reportsList.innerHTML = `
        <p class="empty-message">Loading emergency reports...</p>
    `;

    console.log("Connecting to emergencyReports...");

    unsubscribeReports = onSnapshot(
        collection(db, "emergencyReports"),

        snapshot => {
            const reports = snapshot.docs.map(item => ({
                documentId: item.id,
                ...item.data()
            }));

            reports.sort((a, b) => {
                const dateA = a.createdAt?.toMillis
                    ? a.createdAt.toMillis()
                    : 0;

                const dateB = b.createdAt?.toMillis
                    ? b.createdAt.toMillis()
                    : 0;

                return dateB - dateA;
            });

            console.log("Emergency reports found:", reports.length);
            displayReports(reports);
        },

        error => {
            console.error("FIRESTORE REPORT ERROR:", error);

            reportsList.innerHTML = `
                <p class="empty-message">
                    Failed to retrieve reports.<br>
                    ${escapeHTML(error.message)}
                </p>
            `;
        }
    );
}

// DISPLAY VERIFICATION REQUESTS
function displayVerificationRequests(users) {
    if (!verificationList || !verificationCount) {
        console.error("Verification HTML elements are missing.");
        return;
    }

    const pendingUsers = users.filter(user =>
        user.verificationStatus === "Pending"
    );

    verificationCount.textContent =
        `${pendingUsers.length} pending request${pendingUsers.length === 1 ? "" : "s"}`;

    if (users.length === 0) {
        verificationList.innerHTML = `
            <p class="empty-message">
                No citizen verification profiles found.
            </p>
        `;
        return;
    }

    if (pendingUsers.length === 0) {
        verificationList.innerHTML = `
            <p class="empty-message">
                There are no pending verification requests.
            </p>
        `;
        return;
    }

    verificationList.innerHTML = pendingUsers.map(user => `
        <article class="verification-card">
            <div class="verification-details">
                <h3>${escapeHTML(user.fullName || "Name not provided")}</h3>

                <p>
                    <strong>Barangay:</strong>
                    ${escapeHTML(user.barangay || "Not provided")}
                </p>

                <p>
                    <strong>Status:</strong>
                    <span class="verification-status pending">
                        Pending
                    </span>
                </p>

                <p>
                    <strong>Submitted:</strong>
                    ${escapeHTML(formatDate(user.createdAt))}
                </p>

                <p class="verification-uid">
                    <strong>Account ID:</strong>
                    ${escapeHTML(user.documentId)}
                </p>
            </div>

            <button
                type="button"
                class="approve-verification-button"
                data-user-id="${escapeHTML(user.documentId)}"
            >
                Approve Verification
            </button>
        </article>
    `).join("");

    console.log("Pending verification requests:", pendingUsers.length);
}

// LOAD CITIZEN PROFILES FROM FIRESTORE
function loadVerificationRequests() {
    if (unsubscribeUsers) {
        unsubscribeUsers();
        unsubscribeUsers = null;
    }

    if (!verificationList) {
        console.error("Missing verificationList in admin.html.");
        return;
    }

    verificationList.innerHTML = `
        <p class="empty-message">
            Loading verification requests...
        </p>
    `;

    console.log("Connecting to users collection...");

    unsubscribeUsers = onSnapshot(
        collection(db, "users"),

        snapshot => {
            const users = snapshot.docs.map(item => ({
                documentId: item.id,
                ...item.data()
            }));

            console.log("Citizen profiles found:", users.length);

            displayVerificationRequests(users);
        },

        error => {
            console.error("VERIFICATION FIRESTORE ERROR:", error);

            verificationList.innerHTML = `
                <p class="empty-message">
                    Could not load verification requests.<br>
                    ${escapeHTML(error.message)}
                </p>
            `;
        }
    );
}

// APPROVE CITIZEN VERIFICATION
if (verificationList) {
    verificationList.addEventListener("click", async function(event) {
        const button = event.target.closest(
            ".approve-verification-button"
        );

        if (!button) return;

        const userId = button.dataset.userId;

        const confirmed = confirm(
            "Are you sure you want to approve this citizen's verification?"
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "Approving...";

        try {
            await updateDoc(
                doc(db, "users", userId),
                {
                    verificationStatus: "Verified"
                }
            );

            console.log("Citizen verification approved:", userId);

            alert(
                "Verification approved successfully!\n\n" +
                "The citizen's status is now Verified."
            );

        } catch (error) {
            console.error("Verification approval failed:", error);

            alert(
                "Could not approve verification.\n\n" +
                error.message
            );

            button.disabled = false;
            button.textContent = "Approve Verification";
        }
    });
}

// ADMIN LOGIN
loginForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const email =
        document.getElementById("adminEmail").value.trim();

    const password =
        document.getElementById("adminPassword").value;

    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";
    loginMessage.textContent = "";

    try {
        const credential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        console.log("Logged-in UID:", credential.user.uid);

        if (credential.user.uid !== ADMIN_UID) {
            await signOut(auth);

            throw new Error(
                "This account is not authorized for the ALERTO administrator dashboard."
            );
        }

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

        if (unsubscribeUsers) {
            unsubscribeUsers();
            unsubscribeUsers = null;
        }

        await signOut(auth);
    });

// CHECK ADMIN LOGIN SESSION
onAuthStateChanged(
    auth,

    user => {
        console.log("AUTHENTICATION CHECK");
        console.log("Logged-in UID:", user?.uid);
        console.log("Is Admin:", user?.uid === ADMIN_UID);

        if (user && user.uid === ADMIN_UID) {
            loginScreen.classList.add("hidden");
            dashboard.classList.remove("hidden");

            document.getElementById("adminEmailDisplay").textContent =
                user.email || "Administrator";

            loadReports();
            loadVerificationRequests();

        } else {
            loginScreen.classList.remove("hidden");
            dashboard.classList.add("hidden");

            if (unsubscribeReports) {
                unsubscribeReports();
                unsubscribeReports = null;
            }

            if (unsubscribeUsers) {
                unsubscribeUsers();
                unsubscribeUsers = null;
            }

            if (map) {
                map.remove();
                map = null;
                markers = {};
            }
        }
    },

    error => {
        console.error("Authentication state error:", error);
    }
);