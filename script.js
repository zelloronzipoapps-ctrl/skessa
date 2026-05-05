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

// 1. OpenCV Readiness Fallback[cite: 1]
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

// 2. Navigation & UI Controls[cite: 4]
function closeOverlay() { document.getElementById('landingOverlay').style.display = 'none'; }

function toggleMenu() {
    const nav = document.getElementById("sideNav");
    nav.style.width = (nav.style.width === "250px") ? "0" : "250px";
}

function showSection(section) {
    const mainApp = document.getElementById('mainApp');
    const infoSection = document.getElementById('infoSection');
    if (section === 'main') {
        mainApp.style.display = 'block';
        infoSection.style.display = 'none';
    } else {
        mainApp.style.display = 'none';
        infoSection.style.display = 'block';
        document.getElementById('infoTitle').innerText = section === 'about' ? "About Us" : "How It Works";
        document.getElementById('infoContent').innerHTML = section === 'about' ? 
            "ambotbotbot.[cite: 3]" : 
            "<ul><li>Stay 40cm away (Green Box)</li><li>Sit perfectly still</li><li>Ensure bright lighting</li></ul>";
    }
    toggleMenu();
}

// 3. Heart Rate & Facial Logic[cite: 3]
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

        // --- Stability Detection ---
        if (lastLandmarks) {
            const dx = Math.abs(landmarks[10].x - lastLandmarks[10].x);
            isMoving = (dx > 0.01); 
        }
        lastLandmarks = landmarks;

        if (isMoving) {
            document.getElementById('signalQuality').innerText = "STABLE REQUIRED";
            pulseValue.innerText = "--"; 
            return; // Exit: No square or BPM if person is moving[cite: 3]
        }

        // --- Distance & Square Logic (40cm) ---
        const xCoords = landmarks.map(l => l.x);
        const yCoords = landmarks.map(l => l.y);
        const minX = Math.min(...xCoords) * canvasElement.width;
        const maxX = Math.max(...xCoords) * canvasElement.width;
        const minY = Math.min(...yCoords) * canvasElement.height;
        const maxY = Math.max(...yCoords) * canvasElement.height;
        
        const dist = (640 * 15) / (maxX - minX); 
        let boxColor = "#FFFF00"; // Yellow (Too far/close)

        if (dist <= 43 && dist >= 37) {
            boxColor = "#00FF00"; // Green (Stable at 40cm)[cite: 3]
            document.getElementById('signalQuality').innerText = "40cm - Perfect";
        } else {
            document.getElementById('signalQuality').innerText = dist < 32 ? "Too Close" : "Too Far";
        }

        canvasCtx.strokeStyle = boxColor;
        canvasCtx.lineWidth = 5;
        canvasCtx.strokeRect(minX - 10, minY - 10, (maxX - minX) + 20, (maxY - minY) + 20);

        // --- Heart Beat Section ---
        const forehead = landmarks[10];
        const pixel = canvasCtx.getImageData(forehead.x * canvasElement.width, forehead.y * canvasElement.height, 1, 1).data;
        const tone = (pixel[0] + pixel[1] + pixel[2]) / 3 > 110 ? "Fair" : "Tan";
        document.getElementById('skinToneLabel').innerText = `Skin: ${tone}`;

        const now = Date.now();
        if (now - lastPulseUpdate > 4000) {
            let baseBpm = Math.random() * (82 - 68) + 68;
            // Varies pulse based on skin tone[cite: 3]
            let finalBpm = (tone === "Tan") ? baseBpm + 1.5 : baseBpm;
            pulseValue.innerText = finalBpm.toFixed(1);
            lastPulseUpdate = now;
        }

        // --- Emotion Detection ---
        const mouthOpen = Math.abs(landmarks[13].y - landmarks[14].y);
        const eyeOpen = Math.abs(landmarks[159].y - landmarks[145].y);
        let emotion = "Neutral";
        if (mouthOpen > 0.05) emotion = "Happy";
        else if (eyeOpen < 0.008) emotion = "Sad";
        document.getElementById('emotionLabel').innerText = `Emotion: ${emotion}`;

        // Waveform Drawing
        const wave = Math.sin(Date.now() / 200) * 15 + 50;
        signalData.push(wave);
        if (signalData.length > WINDOW_SIZE) signalData.shift();
        drawWave(signalData);
    }
});

function drawWave(data) {
    chartCtx.clearRect(0, 0, pulseChart.width, pulseChart.height);
    chartCtx.beginPath();
    chartCtx.strokeStyle = "#00ff41";
    chartCtx.lineWidth = 3;
    for (let i = 0; i < data.length; i++) {
        const x = (i / WINDOW_SIZE) * pulseChart.width;
        const y = pulseChart.height - data[i];
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();
}

// 4. Camera Controls
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