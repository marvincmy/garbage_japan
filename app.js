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
const PAGE_TITLE = 'Smart Trash Scanner / 關於將垃圾擺喺鏡頭前面就會話你知點掉嘅神奇網頁';

const TRANSLATIONS = {
  en: {
    title: 'SMART TRASH SCANNER',
    subtitle: 'Place one item in front of the camera to see the matching disposal category and handling tips.',
    noGarbage: 'No Garbage Detected',
    garbageTypes: 'Garbage Types',
    detectedItemLabel: 'Detected Item',
    waitingDetection: 'Waiting for detection',
    scanHint: 'Show one item to the camera',
    matchedState: 'Matched bin',
    noMatchState: 'No matching bin',
    bins: {
      burnable: 'Burnable',
      'non-burnable': 'Non-burnable',
      'glass-pet': 'Glass & PET',
      oversized: 'Oversized',
      paper: 'Paper',
    },
    careTips: {
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
    },
  },
  zh: {
    title: '關於將垃圾擺喺鏡頭前面\n就會話你知點掉嘅神奇網頁',
    subtitle: '將一件垃圾放到鏡頭前，系統會幫你辨認類別、標示對應垃圾桶，並顯示處理提示。',
    noGarbage: '未檢測到垃圾',
    garbageTypes: '垃圾類別',
    detectedItemLabel: '檢測結果',
    waitingDetection: '等待辨識',
    scanHint: '請將單一物件放到鏡頭前',
    matchedState: '已配對垃圾桶',
    noMatchState: '未配對到垃圾桶',
    bins: {
      burnable: '可燃垃圾',
      'non-burnable': '不可燃垃圾',
      'glass-pet': '玻璃瓶與 PET 瓶',
      oversized: '大型垃圾',
      paper: '紙類',
    },
    careTips: {
      burnable_garbage:
        '請放入指定的可燃垃圾袋。廚餘垃圾請先瀝乾。食用油請先用紙或布吸附後再丟棄。',
      'non-burnable':
        '請放入指定的不可燃垃圾袋。丟棄前請先取出電池。尖銳物品請先用紙包好以確保安全。',
      glass_bottle:
        '請先取下瓶蓋與標籤。塑膠瓶蓋屬於可燃垃圾，金屬瓶蓋屬於不可燃垃圾。請沖洗乾淨，並將 PET 瓶縱向壓扁後投入指定回收袋。',
      oversized_garbage:
        '需要事先申請並支付費用。請撥打 092-731-1153 或透過市政府網站申請。大型垃圾不會在日常收運日回收。',
      paper:
        '請將報紙、紙箱和雜紙分開整理，並分別用繩子綑好。紙箱上的膠帶、訂書釘和貼紙請先移除。',
    },
  },
};

const bins = Array.from(document.querySelectorAll('.bin'));
const overlay = document.getElementById('no-garbage-overlay');
const webcamContainer = document.getElementById('webcam-container');
const detectedItemName = document.getElementById('detected-item-name');
const detectedItemState = document.getElementById('detected-item-state');
const detectedItemTip = document.getElementById('detected-item-tip');
const translatableNodes = Array.from(document.querySelectorAll('[data-i18n]'));
const labelNodes = Array.from(document.querySelectorAll('[data-label-key]'));
const languageButtons = Array.from(document.querySelectorAll('.lang-button'));
let activeBinId = null;
let detectionState = null;
let overlayFlashing = false;
let currentLanguage = 'en';

function getCurrentCopy() {
  return TRANSLATIONS[currentLanguage] ?? TRANSLATIONS.en;
}

function getClassNameByBinId(binId) {
  return Object.keys(BIN_ID_BY_CLASS).find((cls) => BIN_ID_BY_CLASS[cls] === binId) ?? null;
}

function getTipText(className) {
  if (!className) return '';
  return getCurrentCopy().careTips[className] ?? '';
}

function formatClassName(className) {
  if (!className) return '';
  return className
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getBinLabelById(binId) {
  const bin = bins.find((entry) => entry.id === binId);
  if (!bin) return '';
  return getCurrentCopy().bins[bin.dataset.type] ?? '';
}

function setDetectedItemState(nextState) {
  detectionState = nextState;

  const copy = getCurrentCopy();
  if (!nextState) {
    detectedItemName.textContent = copy.waitingDetection;
    detectedItemState.textContent = copy.scanHint;
    detectedItemTip.textContent = copy.scanHint;
    return;
  }

  const detectedLabel = nextState.binId
    ? getBinLabelById(nextState.binId)
    : formatClassName(nextState.className);

  detectedItemName.textContent = detectedLabel || copy.waitingDetection;
  detectedItemState.textContent = nextState.matched ? copy.matchedState : copy.noMatchState;
  detectedItemTip.textContent = getTipText(nextState.className) || copy.scanHint;
}

function updateTranslations() {
  const copy = getCurrentCopy();
  document.title = PAGE_TITLE;
  document.documentElement.lang = currentLanguage;
  document.body.dataset.language = currentLanguage;

  translatableNodes.forEach((node) => {
    const key = node.dataset.i18n;
    const text = copy[key];
    if (text) node.textContent = text;
  });

  labelNodes.forEach((node) => {
    const key = node.dataset.labelKey;
    const text = copy.bins[key];
    if (text) node.textContent = text;
  });

  bins.forEach((bin) => {
    const label = copy.bins[bin.dataset.type] ?? '';
    const jp = bin.querySelector('.jp')?.textContent ?? '';
    bin.setAttribute('aria-label', label ? `${label} - ${jp}` : jp);
  });

  languageButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === currentLanguage);
    button.setAttribute('aria-pressed', String(button.dataset.lang === currentLanguage));
  });

  setDetectedItemState(detectionState);
}

function setLanguage(language) {
  if (!TRANSLATIONS[language] || currentLanguage === language) return;
  currentLanguage = language;
  updateTranslations();
}

function clearActiveHighlight() {
  bins.forEach((bin) => bin.classList.remove('active'));
  activeBinId = null;
}

function clearActiveBins() {
  clearActiveHighlight();
  setDetectedItemState(null);
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
  setDetectedItemState({
    binId,
    className: getClassNameByBinId(binId),
    matched: true,
  });
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

  clearActiveHighlight();
  setDetectedItemState({
    className: bestClassName,
    matched: false,
  });
  showNoGarbageOverlay(true);
}

window.garbageUI = {
  setActiveBin,
  clearActiveBins,
  showNoGarbageOverlay,
  setLanguage,
};

languageButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setLanguage(button.dataset.lang);
  });
});

window.addEventListener('load', () => {
  clearActiveBins();
  showNoGarbageOverlay(false);
  updateTranslations();
  init().catch((error) => {
    console.error('Teachable Machine initialization failed:', error);
    showNoGarbageOverlay(true);
  });
});
