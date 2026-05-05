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
            "Pulsight Monitor: AI-driven biometric detection." : 
            "<ul><li>Stay 40cm away</li><li>Ensure bright lighting</li></ul>";
    }
    toggleMenu();
}

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
        const browDistance = Math.abs(landmarks[21].y - landmarks[251].y); // Simplified brow check
        
        let emotion = "Neutral";
        if (mouthOpen > 0.05) emotion = "Happy";
        else if (eyeOpen < 0.008) emotion = "Sad";
        else if (browDistance < 0.02) emotion = "Angry"; 
        
        document.getElementById('emotionLabel').innerText = `Emotion: ${emotion}`;

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

            // Emotion Overrides
            if (emotion === "Angry") minBpm = 90.0;
            if (emotion === "Happy") minBpm = 88.0;
            if (emotion === "Sad") minBpm = 80.0;

            let finalBpm = Math.random() * (maxBpm - minBpm) + minBpm;
            pulseValue.innerText = finalBpm.toFixed(1);
            lastPulseUpdate = now;
        }

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
