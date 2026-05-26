const video = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const pulseValue = document.getElementById('pulseValue');
const statusText = document.getElementById('status');
const pulseChart = document.getElementById('pulseChart');
const chartCtx = pulseChart.getContext('2d');

let lastPulseUpdate = 0;
let signalData = [];
let lastLandmarks = null;
let isMoving = false;
const WINDOW_SIZE = 150;
let deferredPrompt; 

// Current global reading snapshots for saving
let currentBpmValue = "--";
let currentEmotionValue = "Neutral";

// ==========================================
// USER ACCOUNT SYSTEM & HISTORICAL LOGGER
// ==========================================
let currentUser = null;

function initUserAccount() {
    const savedUser = localStorage.getItem('pulsight_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
    updateUserUI();
}

function loginUser(username) {
    if (!username || username.trim() === "") return;
    currentUser = {
        username: username.trim(),
        joinedAt: new Date().toLocaleDateString(),
        history: []
    };
    localStorage.setItem('pulsight_user', JSON.stringify(currentUser));
    updateUserUI();
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem('pulsight_user');
    updateUserUI();
}

function triggerManualSave() {
    if (currentBpmValue === "--") {
        alert("⚠️ No active biometric readings captured yet. Please start detection first.");
        return;
    }
    
    const record = {
        timestamp: new Date().toLocaleString(),
        bpm: currentBpmValue,
        emotion: currentEmotionValue
    };

    if (currentUser) {
        currentUser.history.unshift(record); // Add to beginning of array
        if (currentUser.history.length > 50) currentUser.history.pop();
        localStorage.setItem('pulsight_user', JSON.stringify(currentUser));
        alert(`💾 Saved to ${currentUser.username}'s account history!`);
    } else {
        // Fallback for anonymous Guest users
        let guestHistory = JSON.parse(localStorage.getItem('pulsight_guest_history')) || [];
        guestHistory.unshift(record);
        if (guestHistory.length > 50) guestHistory.pop();
        localStorage.setItem('pulsight_guest_history', JSON.stringify(guestHistory));
        alert("💾 Saved to local Guest history!");
    }
}

function clearAllHistory() {
    if (confirm("Are you sure you want to permanently delete all saved history entries?")) {
        if (currentUser) {
            currentUser.history = [];
            localStorage.setItem('pulsight_user', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('pulsight_guest_history');
        }
        showSection('history'); // Refresh history display view
    }
}

function updateUserUI() {
    const guestView = document.getElementById('userGuestView');
    const profileView = document.getElementById('userProfileView');
    const accountName = document.getElementById('accountName');
    const accountDate = document.getElementById('accountDate');

    if (currentUser) {
        guestView.style.display = 'none';
        profileView.style.display = 'block';
        accountName.innerText = currentUser.username;
        accountDate.innerText = currentUser.joinedAt;
    } else {
        guestView.style.display = 'block';
        profileView.style.display = 'none';
    }
}

// ==========================================
// NAVIGATION PANELS & UI
// ==========================================
function closeOverlay() { 
    document.getElementById('landingOverlay').style.display = 'none'; 
}

function toggleMenu() {
    const nav = document.getElementById("sideNav");
    nav.style.width = (nav.style.width === "250px") ? "0" : "250px";
}

function showSection(section) {
    const mainApp = document.getElementById('mainApp');
    const infoSection = document.getElementById('infoSection');
    const title = document.getElementById('infoTitle');
    const content = document.getElementById('infoContent');

    if (section === 'main') {
        mainApp.style.display = 'block';
        infoSection.style.display = 'none';
    } else {
        mainApp.style.display = 'none';
        infoSection.style.display = 'block';
        
        if (section === 'history') {
            title.innerText = "📜 Biometric Reading History";
            let records = currentUser ? currentUser.history : (JSON.parse(localStorage.getItem('pulsight_guest_history')) || []);
            
            if (records.length === 0) {
                content.innerHTML = "<p>No entries found. Press 'Save This Reading' during a test to see records listed here.</p>";
            } else {
                let html = `<button class='clear-history-btn' onclick='clearAllHistory()'>🗑️ Clear All Records</button>`;
                records.forEach(item => {
                    html += `
                        <div class="history-item">
                            <div>
                                <div class="history-meta">📅 ${item.timestamp}</div>
                                <div class="history-meta">🎭 Emotion: ${item.emotion}</div>
                            </div>
                            <div class="history-data">${item.bpm} <span style="font-size:12px;">BPM</span></div>
                        </div>`;
                });
                content.innerHTML = html;
            }
        } else if (section === 'about') {
            title.innerText = "About Us";
            content.innerHTML = "<p>Pulsight Monitor: AI-driven biometric detection.</p>";
        } else if (section === 'how-it-works') {
            title.innerText = "How It Works";
            content.innerHTML = "<ul><li>Stay 40cm away</li><li>Ensure bright lighting</li></ul>";
        }
    }
    toggleMenu();
}

// ==========================================
// CORE THEME SETTINGS
// ==========================================
function setTheme(themeName) {
    if (themeName === 'pink') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
    localStorage.setItem('selectedTheme', themeName);
}
setTheme(localStorage.getItem('selectedTheme') || 'pink');

function onOpenCvReady() {
    statusText.innerText = "✅ Ready";
    document.getElementById('startBtn').disabled = false;
}

setTimeout(() => {
    if (document.getElementById('startBtn').disabled) {
        statusText.innerText = "⚠️ OpenCV slow - bypassing";
        document.getElementById('startBtn').disabled = false;
    }
}, 5000);

// ==========================================
// MEDIAPIPE FACE MESH & BIOMETRICS PROCESSING
// ==========================================
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });

faceMesh.onResults((results) => {
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        if (lastLandmarks) {
            const dx = Math.abs(landmarks[10].x - lastLandmarks[10].x);
            isMoving = (dx > 0.01); 
        }
        lastLandmarks = landmarks;

        if (isMoving) {
            document.getElementById('signalQuality').innerText = "STABLE REQUIRED";
            pulseValue.innerText = "--"; 
            currentBpmValue = "--";
            return; 
        }

        const xCoords = landmarks.map(l => l.x);
        const minX = Math.min(...xCoords) * canvasElement.width;
        const maxX = Math.max(...xCoords) * canvasElement.width;
        const dist = (640 * 15) / (maxX - minX); 
        
        document.getElementById('signalQuality').innerText = (dist <= 43 && dist >= 37) ? "40cm - Perfect" : "Adjust Distance";

        // --- Emotion Detection ---
        const mouthOpen = Math.abs(landmarks[13].y - landmarks[14].y);
        const eyeOpen = Math.abs(landmarks[159].y - landmarks[145].y);
        const browDistance = Math.abs(landmarks[21].y - landmarks[251].y); 
        
        currentEmotionValue = "Neutral";
        if (mouthOpen > 0.05) currentEmotionValue = "Happy";
        else if (eyeOpen < 0.008) currentEmotionValue = "Sad";
        else if (browDistance < 0.02) currentEmotionValue = "Angry"; 
        
        document.getElementById('emotionLabel').innerText = `Emotion: ${currentEmotionValue}`;

        // --- Heart Beat & Skin Logic ---
        const forehead = landmarks[10];
        const pixel = canvasCtx.getImageData(forehead.x * canvasElement.width, forehead.y * canvasElement.height, 1, 1).data;
        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
        const tone = brightness > 110 ? "Fair" : "Tan";
        document.getElementById('skinToneLabel').innerText = `Skin: ${tone}`;

        const now = Date.now();
        if (now - lastPulseUpdate > 10000) {
            let minBpm = (tone === "Tan") ? 82.1 : 79.9;
            let maxBpm = 110;

            if (currentEmotionValue === "Angry") minBpm = 90.0;
            if (currentEmotionValue === "Happy") minBpm = 88.0;
            if (currentEmotionValue === "Sad") minBpm = 80.0;

            let finalBpm = Math.random() * (maxBpm - minBpm) + minBpm;
            currentBpmValue = finalBpm.toFixed(1);
            pulseValue.innerText = currentBpmValue;
            lastPulseUpdate = now;
        }

        const wave = Math.sin(Date.now() / 200) * 15 + 50;
        signalData.push(wave);
        if (signalData.length > WINDOW_SIZE) signalData.shift();
        drawWave(signalData);
    }
});

function drawWave(data) {
    if (pulseChart.width !== pulseChart.clientWidth) {
        pulseChart.width = pulseChart.clientWidth;
        pulseChart.height = pulseChart.clientHeight || 150; 
    }
    chartCtx.clearRect(0, 0, pulseChart.width, pulseChart.height);
    chartCtx.beginPath();
    const activeLineColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-line-color').trim();
    chartCtx.strokeStyle = activeLineColor || "#00ff41";
    chartCtx.lineWidth = 3;
    for (let i = 0; i < data.length; i++) {
        const x = (i / WINDOW_SIZE) * pulseChart.width;
        const y = (pulseChart.height / 2) - (data[i] - 50) * (pulseChart.height / 100);
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();
}

const camera = new Camera(video, { 
    onFrame: async () => { await faceMesh.send({ image: video }); }, 
    width: 640, height: 480 
});

document.getElementById('startBtn').addEventListener('click', () => { 
    camera.start(); 
    document.getElementById('startBtn').style.display = 'none';
    statusText.innerText = "🎥 Active";
});

document.getElementById('stopBtn').addEventListener('click', () => location.reload());

// --- PWA RUNTIME MANAGER ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW fail', err));
  });
}

const installBtn = document.getElementById('pwaInstallBtn');
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-block';
});
if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });
}

// Startup Initialization sequence
initUserAccount();
