// Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbwLrB5VTaqQp2XWELS8XGD13aOwx4753R5d5gMtk2PNIUT8Fivnu4wCTUCb-ltVowOm/exec';
const REFRESH_INTERVAL = 60000; // 1 minute

let currentRoomKey = '';
let cameraStream = null;
let refreshTimer = null;

// Timezone Configuration
const IST_TIMEZONE = 'Asia/Kolkata'; // +5:30 GMT (Used in Sri Lanka)

// Room name mapping
const ROOM_NAMES = {
    'A': 'BLOCK A BOARDROOM',
    'B': 'BLOCK C BOARDROOM',
    'C': 'BLOCK D AUDITORIUM'
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Get room key from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    currentRoomKey = urlParams.get('room') || 'A';
    
    // Set room name
    document.getElementById('roomName').textContent = ROOM_NAMES[currentRoomKey] || `Room ${currentRoomKey}`;
    
    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Show loading state for status indicator until data loads
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        statusIndicator.classList.add('loading');
        const stText = statusIndicator.querySelector('.status-text');
        if (stText) stText.textContent = 'Loading...';
    }

    // Show loading placeholder for current meeting until data loads
    const currentDisplay = document.getElementById('currentMeetingDisplay');
    if (currentDisplay) {
        currentDisplay.innerHTML = '<div class="loading-message">Loading current meeting...</div>';
    }
    
    // Initial load
    loadRoomSchedule();
    
    // Set up auto-refresh
    refreshTimer = setInterval(loadRoomSchedule, REFRESH_INTERVAL);
});

// Update clock display
function updateClock() {
    const now = new Date();
    const timeString = formatDateIST(now, 'time');
    const dateString = formatDateIST(now, 'date');
    
    document.getElementById('currentTime').textContent = `${dateString} • ${timeString}`;
}

// Load room schedule from backend
async function loadRoomSchedule() {
    try {
        const url = `${API_URL}?action=getRoomSchedule&room=${currentRoomKey}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch schedule');
        }
        
        const data = await response.json();
        
        // Update current meeting
        updateCurrentMeeting(data.currentMeeting);
        
        // Update upcoming meetings
        updateUpcomingMeetings(data.upcomingMeetings);
        
        // Update last update time
        const now = new Date();
        document.getElementById('lastUpdate').textContent = formatDateIST(now, 'time-only');
        
    } catch (error) {
        console.error('Error loading schedule:', error);
        displayError();
    }
}

// Update current meeting display
function updateCurrentMeeting(meeting) {
    const displayContainer = document.getElementById('currentMeetingDisplay');
    const statusIndicator = document.getElementById('statusIndicator');

    // Clear loading state as soon as we have meeting info
    if (statusIndicator && statusIndicator.classList.contains('loading')) {
        statusIndicator.classList.remove('loading');
    }

    if (meeting) {
        // Normalize meeting row (supports array rows from the sheet or object payloads)
        const m = normalizeMeeting(meeting);

        statusIndicator.classList.add('occupied');
        statusIndicator.querySelector('.status-text').textContent = 'In Use';

        // Enable camera
        enableCamera();

        // Calculate time remaining
        const now = new Date();
        const end = m.endDate;
        const remainingMs = end - now;
        const remainingMins = Math.max(0, Math.floor(remainingMs / 60000));
        const remainingHours = Math.floor(remainingMins / 60);
        const remainingMinsDisplay = remainingMins % 60;

        let timeRemainingText = '';
        if (remainingHours > 0) {
            timeRemainingText = `${remainingHours}h ${remainingMinsDisplay}m`;
        } else {
            timeRemainingText = `${remainingMinsDisplay} minutes`;
        }

        // Calculate progress
        const start = m.startDate;
        const totalDuration = end - start;
        const elapsed = now - start;
        const progressPercent = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;

        displayContainer.innerHTML = `
            <div class="meeting-active">
                <div class="meeting-title">${escapeHtml(m.title)}</div>
                <div class="meeting-details">
                    <div class="meeting-detail-row">
                        <span class="detail-icon">👤</span>
                        <span class="detail-label">Organizer:</span>
                        <span class="detail-value">${escapeHtml(m.bookedBy)}</span>
                    </div>
                    <div class="meeting-detail-row">
                        <span class="detail-icon">🕐</span>
                        <span class="detail-label">Started:</span>
                        <span class="detail-value">${formatTime(m.startDate)}</span>
                    </div>
                    <div class="meeting-detail-row">
                        <span class="detail-icon">🕐</span>
                        <span class="detail-label">Ends:</span>
                        <span class="detail-value">${formatTime(m.endDate)}</span>
                    </div>
                    ${m.participants ? `
                    <div class="meeting-detail-row">
                        <span class="detail-icon">👥</span>
                        <span class="detail-label">Participants:</span>
                        <span class="detail-value">${escapeHtml(m.participants)}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="meeting-time-progress">
                    <div class="time-remaining">
                        <span class="time-remaining-label">Time Remaining</span>
                        <span class="time-remaining-value">${timeRemainingText}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // No meeting
        statusIndicator.classList.remove('occupied');
        statusIndicator.querySelector('.status-text').textContent = 'Available';

        // Disable camera
        disableCamera();

        displayContainer.innerHTML = `
            <div class="no-meeting">
                <div class="no-meeting-icon">✓</div>
                <div class="no-meeting-text">Room Available</div>
                <div class="no-meeting-subtext">No ongoing meeting</div>
            </div>
        `;
    }
}

// Update upcoming meetings display
function updateUpcomingMeetings(meetings) {
    const upcomingList = document.getElementById('upcomingList');

    if (!meetings || meetings.length === 0) {
        upcomingList.innerHTML = '<div class="no-upcoming">No more meetings scheduled for today</div>';
        return;
    }

    let html = '';
    meetings.forEach((meeting, index) => {
        const isNext = index === 0;
        const m = normalizeMeeting(meeting);
        html += `
            <div class="upcoming-item ${isNext ? 'next-meeting' : ''}">
                <div class="upcoming-header">
                    <div class="upcoming-title">${escapeHtml(m.title)}</div>
                    <div class="upcoming-time">${formatTimeRange(m.startDate, m.endDate)}</div>
                </div>
                <div class="upcoming-details">
                    <div class="upcoming-detail">
                        <strong>Organizer:</strong>
                        <span>${escapeHtml(m.bookedBy)}</span>
                    </div>
                    ${m.participants ? `
                    <div class="upcoming-detail">
                        <strong>Participants:</strong>
                        <span>${escapeHtml(m.participants)}</span>
                    </div>
                    ` : ''}
                    ${m.note ? `
                    <div class="upcoming-detail">
                        <strong>Note:</strong>
                        <span>${escapeHtml(m.note)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    upcomingList.innerHTML = html;
}

// Camera functions
async function enableCamera() {
    const cameraContainer = document.getElementById('cameraContainer');
    const cameraFeed = document.getElementById('cameraFeed');

    // If camera is already active, don't reinitialize
    if (cameraStream && cameraFeed.srcObject) {
        cameraContainer.style.display = 'block';
        return;
    }

    try {
        // Request camera access
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        cameraFeed.srcObject = cameraStream;
        cameraContainer.style.display = 'block';

        console.log('Camera enabled successfully');
    } catch (error) {
        console.error('Error enabling camera:', error);
        // Hide camera container if access fails
        cameraContainer.style.display = 'none';
    }
}

function disableCamera() {
    const cameraContainer = document.getElementById('cameraContainer');
    const cameraFeed = document.getElementById('cameraFeed');
    
    if (cameraStream) {
        // Stop all tracks
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        cameraFeed.srcObject = null;
    }
    
    cameraContainer.style.display = 'none';
    console.log('Camera disabled');
}

// Utility functions
// Format date in IST timezone (Asia/Kolkata, GMT+5:30)
function formatDateIST(date, format) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        weekday: 'long'
    });
    
    const parts = formatter.formatToParts(date);
    const result = {};
    
    parts.forEach(part => {
        result[part.type] = part.value;
    });
    
    if (format === 'date') {
        return `${result.weekday}, ${result.month} ${result.day}, ${result.year}`;
    } else if (format === 'time') {
        return `${result.hour}:${result.minute}:${result.second} ${result.dayPeriod}`;
    } else if (format === 'time-only') {
        return `${result.hour}:${result.minute}:${result.second} ${result.dayPeriod}`;
    }
    
    return formatter.format(date);
}

// Utility functions
// Parse a value that may be a Date, a string, or an Excel/Sheets serial number
function parseDate(value) {
    if (!value && value !== 0) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
        // Convert Excel/Sheets serial to JS timestamp (approx)
        // Excel epoch (days since 1899-12-30). This conversion covers common cases.
        return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    // Fallback: try to construct Date from string
    const d = new Date(value);
    return d;
}

// Normalize a meeting row coming from the backend. Supports array rows in the order
// [id, room, roomKey, title, start, end, bookedBy, note, participants, emailSent, createdBy, updatedBy, createdAt, updatedAt]
// or an object with named properties.
function normalizeMeeting(row) {
    if (!row) return null;

    if (Array.isArray(row)) {
        const [id, room, roomKey, title, start, end, bookedBy, note, participants, emailSent, createdBy, updatedBy, createdAt, updatedAt] = row;
        return {
            id,
            room,
            roomKey,
            title: title || '',
            startRaw: start,
            endRaw: end,
            startDate: parseDate(start),
            endDate: parseDate(end),
            bookedBy: bookedBy || '',
            note: note || '',
            participants: participants || '',
            emailSent,
            createdBy,
            updatedBy,
            createdAt,
            updatedAt
        };
    }

    // If it's an object, try to read common fields
    return {
        ...row,
        title: row.title || row.Subject || '',
        startRaw: row.start || row.startDate || row.start_time,
        endRaw: row.end || row.endDate || row.end_time,
        startDate: parseDate(row.start || row.startDate || row.start_time),
        endDate: parseDate(row.end || row.endDate || row.end_time),
        bookedBy: row.bookedBy || row.booker || row.organizer || '',
        participants: row.participants || '',
        note: row.note || row.description || ''
    };
}

function formatTime(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(date)) return '';
    
    return formatDateIST(date, 'time-only');
}

function formatTimeRange(startInput, endInput) {
    return `${formatTime(startInput)} - ${formatTime(endInput)}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displayError() {
    const displayContainer = document.getElementById('currentMeetingDisplay');
    displayContainer.innerHTML = `
        <div class="no-meeting">
            <div class="no-meeting-icon" style="color: #ff4c4c;">⚠</div>
            <div class="no-meeting-text" style="color: #ff8a8a;">Connection Error</div>
            <div class="no-meeting-subtext">Unable to load schedule</div>
        </div>
    `;
    
    const upcomingList = document.getElementById('upcomingList');
    upcomingList.innerHTML = '<div class="no-upcoming">Unable to load schedule</div>';
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    disableCamera();
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
});