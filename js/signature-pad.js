// Minimal signature capture on a <canvas>. No external library.
function createSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasStroke = false;
  let last = null;

  // Fallback size used if the canvas is measured while hidden (e.g. behind
  // the passcode gate, where getBoundingClientRect() returns all zeros) —
  // matches the canvas's own width/height attributes in the HTML.
  const fallbackWidth = canvas.width || 600;
  const fallbackHeight = canvas.height || 180;

  function resizeForDPR() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width || fallbackWidth;
    const cssHeight = rect.height || fallbackHeight;

    const dataUrl = hasStroke ? canvas.toDataURL() : null;

    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c2b2b';

    if (dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
      img.src = dataUrl;
    }
  }
  resizeForDPR();
  window.addEventListener('resize', resizeForDPR);

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    drawing = true;
    hasStroke = true;
    last = pointFromEvent(e);
    e.preventDefault();
  }
  function move(e) {
    if (!drawing) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  return {
    isEmpty: () => !hasStroke,
    clear: () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasStroke = false;
    },
    toDataURL: () => canvas.toDataURL('image/png'),
    resize: resizeForDPR,
    loadFromDataURL: (dataUrl) => {
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        const cssWidth = rect.width || fallbackWidth;
        const cssHeight = rect.height || fallbackHeight;
        ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
        hasStroke = true;
      };
      img.src = dataUrl;
    }
  };
}
