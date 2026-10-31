console.log("ALERTO APP.JS IS RUNNING!");
import { db, auth } from "./firebase-config.js";

import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import {
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// ALERTO SETTINGS
// Only configure an SMS number after official PNP authorization.
const PNP_SMS_NUMBER = "";

const REPORTS_COLLECTION = "emergencyReports";
const USERS_COLLECTION = "users";
const MAX_DISMISSALS = 3;

let currentLatitude = null;
let currentLongitude = null;
let authReady = false;
let currentProfile = null;

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

const verificationStatusCard =
    document.getElementById("verificationStatusCard");
const verificationStatusText =
    document.getElementById("verificationStatusText");
const verificationReminder =
    document.getElementById("verificationReminder");
const verificationPanel =
    document.getElementById("verificationPanel");

const openVerification =
    document.getElementById("openVerification");
const verifyNowButton =
    document.getElementById("verifyNowButton");
const dismissVerification =
    document.getElementById("dismissVerification");
const submitVerification =
    document.getElementById("submitVerification");
const cancelVerification =
    document.getElementById("cancelVerification");

const fullNameInput = document.getElementById("fullName");
const barangayInput = document.getElementById("barangay");
const dismissalMessage = document.getElementById("dismissalMessage");
const verificationMessage = document.getElementById("verificationMessage");

// FIREBASE AUTHENTICATION
// FIREBASE AUTHENTICATION
async function initializeAuthentication() {
    try {
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }

        authReady = true;
        console.log("ALERTO authentication successful.");

        await loadUserProfile();

        console.log("Firebase UID:", auth.currentUser?.uid);
        console.log("Current Profile:", currentProfile);

    } catch (error) {
        authReady = false;
        console.error("Firebase authentication failed:", error);

        alert(
            "Unable to connect to ALERTO authentication. " +
            "Your emergency reports can still be saved locally."
        );
    }
}

function getUserReference() {
    if (!auth.currentUser) {
        throw new Error("User is not authenticated.");
    }

    return doc(db, USERS_COLLECTION, auth.currentUser.uid);
}

// LOAD CITIZEN PROFILE
async function loadUserProfile() {
    if (!authReady || !auth.currentUser) return;

    try {
        const userRef = getUserReference();
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            currentProfile = null;
            console.log("No verification profile found.");
        } else {
            currentProfile = snapshot.data();
            console.log("Verification profile loaded:", currentProfile);
        }

        updateVerificationDisplay();

    } catch (error) {
        console.error("Could not load citizen profile:", error);

        // Show the verification interface even if profile loading fails.
        currentProfile = null;
        updateVerificationDisplay();
    }
}

// UPDATE VERIFICATION DISPLAY

function updateVerificationDisplay() {
    if (!verificationStatusText) return;

    if (!currentProfile) {
        verificationStatusText.textContent =
            "Verification profile not submitted.";

        if (openVerification) {
            openVerification.textContent = "Verify Account";
        }

        // Show reminder even if the user has no profile yet.
        showVerificationReminder();
        return;
    }

    const status = currentProfile.verificationStatus || "Pending";

    verificationStatusText.textContent =
        "Verification Status: " + status;

    if (openVerification) {
        openVerification.textContent =
            status === "Verified"
                ? "Verification Complete"
                : "View Verification";
    }

    if (status === "Verified") {
        hideVerificationReminder();
    } else {
        showVerificationReminder();
    }
}

// VERIFICATION REMINDER

function showVerificationReminder() {
    if (!verificationReminder) return;

    const status = currentProfile?.verificationStatus || "Pending";

    if (status === "Verified") {
        hideVerificationReminder();
        return;
    }

    verificationReminder.classList.remove("hidden");

    // Use Firestore count if profile exists.
    // Otherwise, use a local count for new users.
    const count = currentProfile
        ? Number(currentProfile.dismissCount || 0)
        : Number(localStorage.getItem("alertoDismissCount") || 0);

    if (dismissalMessage) {
        dismissalMessage.textContent =
            count >= MAX_DISMISSALS
                ? "This reminder will remain until your account is verified. You can still access emergency reporting."
                : `You have dismissed this reminder ${count} of ${MAX_DISMISSALS} times.`;
    }

    if (dismissVerification) {
        dismissVerification.classList.toggle(
            "hidden",
            count >= MAX_DISMISSALS
        );
    }

    addContinueButton();
}
// ID PHOTO ELEMENTS
const idPhotoInput = document.getElementById("idPhoto");
const idPreview = document.getElementById("idPreview");
const idPreviewContainer = document.getElementById("idPreviewContainer");
const removeIdPhoto = document.getElementById("removeIdPhoto");

let selectedIdPhotoURL = null;

if (idPhotoInput) {
    idPhotoInput.addEventListener("change", function() {
        const file = this.files[0];

        if (!file) return;

        if (!["image/jpeg", "image/png"].includes(file.type)) {
            alert("Please select a JPG or PNG image.");
            this.value = "";
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            alert("Image must be smaller than 100 MB.");
            this.value = "";
            return;
        }

        if (selectedIdPhotoURL) {
            URL.revokeObjectURL(selectedIdPhotoURL);
        }

        selectedIdPhotoURL = URL.createObjectURL(file);

        idPreview.src = selectedIdPhotoURL;
        idPreviewContainer.classList.remove("hidden");
    });
}

if (removeIdPhoto) {
    removeIdPhoto.addEventListener("click", function() {
        idPhotoInput.value = "";

        if (selectedIdPhotoURL) {
            URL.revokeObjectURL(selectedIdPhotoURL);
            selectedIdPhotoURL = null;
        }

        idPreview.removeAttribute("src");
        idPreviewContainer.classList.add("hidden");
    });
}

function hideVerificationReminder() {
    if (verificationReminder) {
        verificationReminder.classList.add("hidden");
    }
}

// ALLOW EMERGENCY ACCESS EVEN WHEN REMINDER IS PERSISTENT
function addContinueButton() {
    if (!verificationReminder) return;

    const modal = verificationReminder.querySelector(
        ".verification-modal"
    );

    if (!modal || document.getElementById("continueEmergencyButton")) {
        return;
    }

    const button = document.createElement("button");

    button.id = "continueEmergencyButton";
    button.type = "button";
    button.textContent = "Continue to Emergency Reporting";
    button.className = "primary-button";

    button.addEventListener("click", function() {
        hideVerificationReminder();

        if (reportPanel) {
            reportPanel.classList.remove("hidden");
            reportPanel.scrollIntoView({ behavior: "smooth" });
        }
    });

    modal.appendChild(button);
}

// OPEN VERIFICATION FORM
function openVerificationForm() {
    // Close the reminder popup
    hideVerificationReminder();

    // Hide other panels
    if (reportPanel) reportPanel.classList.add("hidden");
    if (historyPanel) historyPanel.classList.add("hidden");
    if (helpPanel) helpPanel.classList.add("hidden");

    // Open the verification page
    if (verificationPanel) {
        verificationPanel.classList.remove("hidden");

        // Scroll to the verification page
        verificationPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

if (openVerification) {
    openVerification.addEventListener(
        "click",
        openVerificationForm
    );
}

if (verifyNowButton) {
    verifyNowButton.addEventListener(
        "click",
        openVerificationForm
    );
}

// SUBMIT VERIFICATION PROFILE
if (submitVerification) {
    submitVerification.addEventListener("click", async function() {
        if (!authReady || !auth.currentUser) {
            alert("Authentication is not ready. Please try again.");
            return;
        }

        if (currentProfile) {
            alert(
                "Your verification profile has already been submitted. " +
                "Please wait for administrator review."
            );
            return;
        }

        const fullName = fullNameInput?.value.trim() || "";
        const barangay = barangayInput?.value || "";

        if (!fullName || !barangay) {
            alert("Please enter your full name and select your barangay.");
            return;
        }

        submitVerification.disabled = true;

        try {
            await setDoc(getUserReference(), {
                fullName: fullName,
                barangay: barangay,
                verificationStatus: "Pending",
                dismissCount: 0,
                createdAt: serverTimestamp()
            });

            currentProfile = {
                fullName: fullName,
                barangay: barangay,
                verificationStatus: "Pending",
                dismissCount: 0
            };

            updateVerificationDisplay();

            if (verificationMessage) {
                verificationMessage.textContent =
                    "Your verification request has been submitted. " +
                    "Please wait for administrator review.";
            }

            alert(
                "Verification request submitted successfully.\n\n" +
                "Status: Pending"
            );

            verificationPanel.classList.add("hidden");
            showVerificationReminder();

        } catch (error) {
            console.error("Verification submission failed:", error);

            alert(
                "Could not submit your verification request. " +
                "Please check your internet connection and try again."
            );

        } finally {
            submitVerification.disabled = false;
        }
    });
}

// CANCEL VERIFICATION FORM
if (cancelVerification) {
    cancelVerification.addEventListener("click", function() {
        verificationPanel.classList.add("hidden");
    });
}

// DISMISS VERIFICATION REMINDER

if (dismissVerification) {
    dismissVerification.addEventListener("click", async function() {
        const count = currentProfile
            ? Number(currentProfile.dismissCount || 0)
            : Number(localStorage.getItem("alertoDismissCount") || 0);

        if (count >= MAX_DISMISSALS) {
            showVerificationReminder();
            return;
        }

        dismissVerification.disabled = true;

        try {
            const newCount = count + 1;

            if (currentProfile && auth.currentUser) {
                await updateDoc(getUserReference(), {
                    dismissCount: newCount
                });

                currentProfile.dismissCount = newCount;
            } else {
                localStorage.setItem(
                    "alertoDismissCount",
                    String(newCount)
                );
            }

            if (newCount >= MAX_DISMISSALS) {
                showVerificationReminder();
            } else {
                hideVerificationReminder();
            }

        } catch (error) {
            console.error("Could not update dismissal count:", error);
            alert("Could not update the reminder. Please try again.");
        } finally {
            dismissVerification.disabled = false;
        }
    });
}


// INTERNET STATUS
function checkInternet() {
    if (!internetElement || !modeElement) return;

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
window.addEventListener("online", syncPendingReports);

checkInternet();

// SMS STATUS
if (smsElement) {
    smsElement.textContent = "Check phone and SIM";
}

// GPS FUNCTION
function getGPS() {
    if (!navigator.geolocation) {
        if (gpsElement) gpsElement.textContent = "Not supported";
        if (locationText) {
            locationText.textContent = "GPS is not supported.";
        }
        return;
    }

    if (gpsElement) gpsElement.textContent = "Getting location...";
    if (locationText) {
        locationText.textContent = "Waiting for GPS coordinates...";
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            currentLatitude = position.coords.latitude;
            currentLongitude = position.coords.longitude;

            if (gpsElement) gpsElement.textContent = "Available";

            if (locationText) {
                locationText.textContent =
                    "Latitude: " + currentLatitude.toFixed(6) +
                    "\nLongitude: " + currentLongitude.toFixed(6);
            }

            if (reportCoordinates) {
                reportCoordinates.textContent =
                    currentLatitude.toFixed(6) + ", " +
                    currentLongitude.toFixed(6);
            }
        },

        function() {
            if (gpsElement) gpsElement.textContent = "Unavailable";

            if (locationText) {
                locationText.textContent =
                    "Unable to get GPS location. " +
                    "Check permissions and location settings.";
            }
        },

        {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        }
    );
}

document.getElementById("refreshGPS")?.addEventListener("click", getGPS);

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

// FIREBASE REPORT SUBMISSION
async function submitToFirebase(report) {
    console.log("Starting Firebase report upload...");
    console.log("Firebase Project:", db.app.options.projectId);
    console.log("Collection:", REPORTS_COLLECTION);
    console.log("Report:", report);

    if (!navigator.onLine) {
        console.warn("Device is offline. Report was not uploaded.");
        return false;
    }

    if (!authReady || !auth.currentUser) {
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

    console.log("REPORT SUCCESSFULLY UPLOADED!");
    console.log("Firestore Document ID:", docRef.id);

    report.firebaseDocId = docRef.id;
    report.status = "Received by ALERTO server";
    report.syncStatus = "Synced";

    saveReport(report);

    return true;
}

// SYNC REPORTS SAVED WHILE OFFLINE
async function syncPendingReports() {
    if (!navigator.onLine || !authReady) return;

    const reports = getReports();

    for (const report of reports) {
        if (report.syncStatus !== "Pending") continue;

        try {
            await submitToFirebase(report);
            console.log("Synced report:", report.id);

        } catch (error) {
            console.error(
                "Could not sync report:",
                report.id,
                error
            );
            break;
        }
    }

    showHistory();
}

// OPEN EMERGENCY FORM
document.getElementById("sosButton")
    ?.addEventListener("click", function() {
        hideVerificationReminder();

        reportPanel?.classList.remove("hidden");
        historyPanel?.classList.add("hidden");
        helpPanel?.classList.add("hidden");

        if (currentLatitude === null) {
            getGPS();
        }

        reportPanel?.scrollIntoView({ behavior: "smooth" });
    });

// GENERATE INCIDENT ID
function generateIncidentID() {
    return "ALT-" + Date.now().toString().slice(-10);
}

// SUBMIT EMERGENCY REPORT
document.getElementById("sendReport")
    ?.addEventListener("click", async function() { console.log("SEND REPORT BUTTON CLICKED!");

        if (
            currentLatitude === null ||
            currentLongitude === null
        ) {
            alert(
                "GPS location is unavailable. " +
                "Please obtain your location first."
            );
            return;
        }

        const incidentType =
            document.getElementById("incidentType")?.value || "";

        const description =
            document.getElementById("description")?.value.trim() || "";

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
            status: navigator.onLine
                ? "Waiting for upload"
                : "Saved offline",
            syncStatus: "Pending"
        };

        // Save locally before attempting upload.
        saveReport(report);

        try {
            if (!navigator.onLine) {
                alert(
                    "You are offline.\n\n" +
                    "Your report is saved on this device and queued " +
                    "for upload when internet returns.\n\n" +
                    "Incident ID: " + incidentID +
                    "\n\nIt has NOT reached the ALERTO server or PNP dashboard."
                );

            } else {
                if (!authReady) {
                    await initializeAuthentication();
                }

                await submitToFirebase(report);

                alert(
                    "Your report was uploaded to the ALERTO server.\n\n" +
                    "Incident ID: " + incidentID +
                    "\n\nThis confirms server upload only. " +
                    "It does not confirm that PNP personnel have received or dispatched it."
                );
            }

        } catch (error) {
            console.error("Report submission error:", error);

            report.status = "Saved locally - upload failed";
            report.syncStatus = "Pending";
            saveReport(report);

            alert(
                "Your report is saved on this device, " +
                "but could not be uploaded.\n\n" +
                "It will be retried when the connection is available.\n\n" +
                "Incident ID: " + incidentID +
                "\n\nIt has NOT reached the ALERTO server or PNP dashboard."
            );

        } finally {
            sendButton.disabled = false;
            showHistory();
        }
    });

// ESCAPE HTML
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

// DISPLAY REPORT HISTORY
function showHistory() {
    const reports = getReports();
    const history = document.getElementById("reportHistory");

    if (!history) return;

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

    historyPanel?.classList.remove("hidden");
    reportPanel?.classList.add("hidden");
    helpPanel?.classList.add("hidden");
}

document.getElementById("historyButton")
    ?.addEventListener("click", showHistory);

document.getElementById("closeHistory")
    ?.addEventListener("click", function() {
        historyPanel?.classList.add("hidden");
    });

// HELP
document.getElementById("helpButton")
    ?.addEventListener("click", function() {
        helpPanel?.classList.remove("hidden");
        reportPanel?.classList.add("hidden");
        historyPanel?.classList.add("hidden");
    });

document.getElementById("closeHelp")
    ?.addEventListener("click", function() {
        helpPanel?.classList.add("hidden");
    });

// CANCEL REPORT
document.getElementById("cancelReport")
    ?.addEventListener("click", function() {
        reportPanel?.classList.add("hidden");
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

// START ALERTO
initializeAuthentication();

