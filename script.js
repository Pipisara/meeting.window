// Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbwLrB5VTaqQp2XWELS8XGD13aOwx4753R5d5gMtk2PNIUT8Fivnu4wCTUCb-ltVowOm/exec';
const REFRESH_INTERVAL = 60000; // 1 minute

let currentRoomKey = '';
let cameraStream = null;
let refreshTimer = null;

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
    
    // Initial load
    loadRoomSchedule();
    
    // Set up auto-refresh
    refreshTimer = setInterval(loadRoomSchedule, REFRESH_INTERVAL);
});

// Update clock display
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    const dateString = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
    
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
        document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
    } catch (error) {
        console.error('Error loading schedule:', error);
        displayError();
    }
}

// Update current meeting display
function updateCurrentMeeting(meeting) {
    const displayContainer = document.getElementById('currentMeetingDisplay');
    const statusIndicator = document.getElementById('statusIndicator');
    
    if (meeting) {
        // Meeting is active
        statusIndicator.classList.add('occupied');
        statusIndicator.querySelector('.status-text').textContent = 'In Use';
        
        // Enable camera
        enableCamera();
        
        // Calculate time remaining
        const now = new Date();
        const end = new Date(meeting.end);
        const remainingMs = end - now;
        const remainingMins = Math.floor(remainingMs / 60000);
        const remainingHours = Math.floor(remainingMins / 60);
        const remainingMinsDisplay = remainingMins % 60;
        
        let timeRemainingText = '';
        if (remainingHours > 0) {
            timeRemainingText = `${remainingHours}h ${remainingMinsDisplay}m`;
        } else {
            timeRemainingText = `${remainingMinsDisplay} minutes`;
        }
        
        // Calculate progress
        const start = new Date(meeting.start);
        const totalDuration = end - start;
        const elapsed = now - start;
        const progressPercent = Math.min(100, (elapsed / totalDuration) * 100);
        
        displayContainer.innerHTML = `
            <div class="meeting-active">
                <div class="meeting-title">${escapeHtml(meeting.title)}</div>
                <div class="meeting-details">
                    <div class="meeting-detail-row">
                        <span class="detail-icon">👤</span>
                        <span class="detail-label">Organizer:</span>
                        <span class="detail-value">${escapeHtml(meeting.bookedBy)}</span>
                    </div>
                    <div class="meeting-detail-row">
                        <span class="detail-icon">🕐</span>
                        <span class="detail-label">Started:</span>
                        <span class="detail-value">${formatTime(meeting.start)}</span>
                    </div>
                    <div class="meeting-detail-row">
                        <span class="detail-icon">🕐</span>
                        <span class="detail-label">Ends:</span>
                        <span class="detail-value">${formatTime(meeting.end)}</span>
                    </div>
                    ${meeting.participants ? `
                    <div class="meeting-detail-row">
                        <span class="detail-icon">👥</span>
                        <span class="detail-label">Participants:</span>
                        <span class="detail-value">${escapeHtml(meeting.participants)}</span>
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
        html += `
            <div class="upcoming-item ${isNext ? 'next-meeting' : ''}">
                <div class="upcoming-header">
                    <div class="upcoming-title">${escapeHtml(meeting.title)}</div>
                    <div class="upcoming-time">${formatTimeRange(meeting.start, meeting.end)}</div>
                </div>
                <div class="upcoming-details">
                    <div class="upcoming-detail">
                        <strong>Organizer:</strong>
                        <span>${escapeHtml(meeting.bookedBy)}</span>
                    </div>
                    ${meeting.participants ? `
                    <div class="upcoming-detail">
                        <strong>Participants:</strong>
                        <span>${escapeHtml(meeting.participants)}</span>
                    </div>
                    ` : ''}
                    ${meeting.note ? `
                    <div class="upcoming-detail">
                        <strong>Note:</strong>
                        <span>${escapeHtml(meeting.note)}</span>
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
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function formatTimeRange(startString, endString) {
    return `${formatTime(startString)} - ${formatTime(endString)}`;
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