const URL = 'https://teachablemachine.withgoogle.com/models/aER2QyV-b/';

let model;
let webcam;
let maxPredictions;
const MIN_CONFIDENCE = 0.8;

const BIN_ID_BY_CLASS = {
  burnable_garbage: 'bin-burnable',
  'non-burnable': 'bin-non-burnable',
  glass_bottle: 'bin-glass-pet',
  oversized_garbage: 'bin-oversized',
  paper: 'bin-paper',
};

const NO_GARBAGE_CLASSES = new Set(['nothing', 'human_face']);

const CARE_TIPS = {
  burnable_garbage:
    'Place in the designated Burnable Trash bag. Drain kitchen waste first. Soak up cooking oil with paper or cloth before disposal.',
  'non-burnable':
    'Place in the designated Non-Burnable Trash bag. Remove batteries before disposal. Wrap sharp items in paper for safety.',
  glass_bottle:
    'Remove caps and labels. Plastic caps are burnable and metal caps are non-burnable. Rinse clean with water. Crush PET bottles vertically. Use the designated Empty Bottles and PET Bottles bag.',
  oversized_garbage:
    'Pre-application and fee required. Call 092-731-1153 or apply online at the city portal. Not collected on regular garbage days.',
  paper:
    'Separate into newspapers, cardboard, and mixed paper. Tie each type with string. Remove tape, clasps, and stickers from cardboard.',
};

const bins = Array.from(document.querySelectorAll('.bin'));
const overlay = document.getElementById('no-garbage-overlay');
const webcamContainer = document.getElementById('webcam-container');
let activeBinId = null;
let overlayFlashing = false;

function clearBinTips() {
  bins.forEach((bin) => {
    const tip = bin.querySelector('.bin-tip');
    if (tip) tip.textContent = '';
  });
}

function clearActiveBins() {
  bins.forEach((bin) => bin.classList.remove('active'));
  activeBinId = null;
  clearBinTips();
}

function setActiveBin(type) {
  const selected = bins.find((bin) => bin.dataset.type === type);
  setActiveBinById(selected?.id ?? null);
}

function showNoGarbageOverlay(visible = true) {
  if (overlayFlashing === visible) return;
  overlay.classList.toggle('flashing', visible);
  overlayFlashing = visible;
}

function setActiveBinById(binId) {
  if (!binId) {
    clearActiveBins();
    return;
  }

  if (activeBinId === binId) return;

  bins.forEach((bin) => {
    bin.classList.toggle('active', bin.id === binId);
  });
  activeBinId = binId;
  clearBinTips();

  const matchedClass = Object.keys(BIN_ID_BY_CLASS).find(
    (cls) => BIN_ID_BY_CLASS[cls] === binId
  );
  const tip = matchedClass ? CARE_TIPS[matchedClass] : null;
  const activeBin = bins.find((bin) => bin.id === binId);
  const activeTip = activeBin?.querySelector('.bin-tip');
  if (tip && activeTip) {
    activeTip.textContent = tip;
  }
}

async function init() {
  const modelURL = URL + 'model.json';
  const metadataURL = URL + 'metadata.json';

  model = await tmImage.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Desktop: flip=true (mirror), Mobile rear camera: flip=false
  webcam = new tmImage.Webcam(640, 640, !isMobile);
  await webcam.setup();

  // On mobile, replace the default front camera stream with rear camera
  if (isMobile) {
    const videoEl = webcam.webcam;
    const oldStream = videoEl.srcObject;
    if (oldStream) oldStream.getTracks().forEach((t) => t.stop());
    const rearStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: 640, height: 640 },
    });
    videoEl.srcObject = rearStream;
    await new Promise((resolve) => { videoEl.onloadedmetadata = resolve; });
  }

  await webcam.play();

  webcam.canvas.setAttribute('aria-label', 'Live camera preview');
  webcamContainer.appendChild(webcam.canvas);

  window.requestAnimationFrame(loop);
}

async function loop() {
  webcam.update();
  await predict();
  window.requestAnimationFrame(loop);
}

async function predict() {
  if (!model || !webcam) return;
  const predictions = await model.predict(webcam.canvas);

  if (!predictions || predictions.length === 0 || maxPredictions === 0) {
    showNoGarbageOverlay(true);
    clearActiveBins();
    return;
  }

  const bestPrediction = predictions.reduce((best, current) =>
    current.probability > best.probability ? current : best
  );

  const bestClassName = bestPrediction.className;
  const bestProbability = bestPrediction.probability;

  if (NO_GARBAGE_CLASSES.has(bestClassName)) {
    clearActiveBins();
    showNoGarbageOverlay(true);
    return;
  }

  const matchedBinId = BIN_ID_BY_CLASS[bestClassName];
  if (matchedBinId && bestProbability > MIN_CONFIDENCE) {
    showNoGarbageOverlay(false);
    setActiveBinById(matchedBinId);
    return;
  }

  clearActiveBins();
  showNoGarbageOverlay(true);
}

window.garbageUI = {
  setActiveBin,
  clearActiveBins,
  showNoGarbageOverlay,
};

window.addEventListener('load', () => {
  clearActiveBins();
  showNoGarbageOverlay(false);
  init().catch((error) => {
    console.error('Teachable Machine initialization failed:', error);
    showNoGarbageOverlay(true);
  });
});
