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

const TRANSLATIONS = {
  en: {
    title: 'Fukuoka City Garbage Sorter',
    subtitle: 'Point your camera at trash and confirm the suggested sorting category.',
    noGarbage: 'No Garbage Detected',
    garbageTypes: 'Garbage Types',
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
    title: '福冈市垃圾分类助手',
    subtitle: '将镜头对准垃圾，确认系统建议的分类类别。',
    noGarbage: '未检测到垃圾',
    garbageTypes: '垃圾类别',
    bins: {
      burnable: '可燃垃圾',
      'non-burnable': '不可燃垃圾',
      'glass-pet': '玻璃瓶与PET瓶',
      oversized: '大型垃圾',
      paper: '纸类',
    },
    careTips: {
      burnable_garbage:
        '请放入指定的可燃垃圾袋。厨余垃圾请先沥干。食用油请先用纸或布吸附后再丢弃。',
      'non-burnable':
        '请放入指定的不可燃垃圾袋。丢弃前请先取出电池。尖锐物品请先用纸包好以确保安全。',
      glass_bottle:
        '请先取下瓶盖与标签。塑料瓶盖属于可燃垃圾，金属瓶盖属于不可燃垃圾。请冲洗干净，并将PET瓶纵向压扁后投入指定回收袋。',
      oversized_garbage:
        '需要事先申请并支付费用。请拨打 092-731-1153 或通过市政府网站申请。大型垃圾不会在日常收运日回收。',
      paper:
        '请将报纸、纸箱和杂纸分开整理，并分别用绳子捆好。纸箱上的胶带、订书钉和贴纸请先移除。',
    },
  },
};

const bins = Array.from(document.querySelectorAll('.bin'));
const overlay = document.getElementById('no-garbage-overlay');
const webcamContainer = document.getElementById('webcam-container');
const translatableNodes = Array.from(document.querySelectorAll('[data-i18n]'));
const labelNodes = Array.from(document.querySelectorAll('[data-label-key]'));
const languageButtons = Array.from(document.querySelectorAll('.lang-button'));
let activeBinId = null;
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

function updateBinTip(binId) {
  clearBinTips();
  if (!binId) return;

  const className = getClassNameByBinId(binId);
  const tip = getTipText(className);
  const activeBin = bins.find((bin) => bin.id === binId);
  const activeTip = activeBin?.querySelector('.bin-tip');
  if (tip && activeTip) {
    activeTip.textContent = tip;
  }
}

function updateTranslations() {
  const copy = getCurrentCopy();

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

  updateBinTip(activeBinId);
}

function setLanguage(language) {
  if (!TRANSLATIONS[language] || currentLanguage === language) return;
  currentLanguage = language;
  updateTranslations();
}

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
  updateBinTip(binId);
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
