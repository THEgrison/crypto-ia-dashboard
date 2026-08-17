/**
 * Canvas chart rendering — prix (chandelles / barres OHLC / ligne / aire) et volumes.
 */
const Charts = (() => {
  const COLORS = {
    bg: '#111111',
    grid: '#222222',
    gridText: '#555555',
    candleUp: '#e8e8e8',
    candleDown: '#666666',
    wick: '#888888',
    line: '#f0f0f0',
    areaTop: 'rgba(240, 240, 240, 0.18)',
    areaBottom: 'rgba(240, 240, 240, 0.01)',
    maFast: '#aaaaaa',
    maSlow: '#666666',
    volumeBar: '#888888',
    volumeAvg: '#444444',
    border: '#333333',
    marker: '#f0f0f0',
  };

  const TYPES = {
    candles: 'Chandelles',
    ohlc: 'Barres OHLC',
    line: 'Ligne',
    area: 'Aire',
  };

  /**
   * La hauteur logique est mémorisée au premier rendu : redimensionner le canvas
   * écrase son attribut height, et sans hauteur CSS figée chaque rendu l'étirerait.
   */
  const logicalHeights = new WeakMap();

  function setupCanvas(canvas) {
    if (!logicalHeights.has(canvas)) logicalHeights.set(canvas, canvas.height);

    const height = logicalHeights.get(canvas);
    const width = canvas.clientWidth || canvas.parentElement.clientWidth;
    const dpr = window.devicePixelRatio || 1;

    canvas.style.height = `${height}px`;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    return { ctx, width, height };
  }

  /**
   * @param {object} options
   * @param {'candles'|'ohlc'|'line'|'area'} options.type Rendu du prix
   * @param {boolean} options.showMA Affiche MA20 / MA50
   */
  function drawPriceChart(canvas, candles, maFast, maSlow, options = {}) {
    const type = TYPES[options.type] ? options.type : 'candles';
    const showMA = options.showMA !== false;

    const { ctx, width, height } = setupCanvas(canvas);
    const pad = { top: 12, right: 12, bottom: 28, left: 56 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    if (!candles?.length) return;

    /* Ligne et aire n'utilisent que les clôtures : l'échelle s'y adapte. */
    const usesRange = type === 'candles' || type === 'ohlc';
    const values = usesRange
      ? candles.flatMap((c) => [c.high, c.low])
      : candles.map((c) => c.close);

    if (showMA) {
      [maFast, maSlow].forEach((series) => {
        (series || []).forEach((v) => {
          if (v !== null && v !== undefined) values.push(v);
        });
      });
    }

    const minP = Math.min(...values) * 0.998;
    const maxP = Math.max(...values) * 1.002;
    const range = maxP - minP || 1;

    const yScale = (p) => pad.top + chartH - ((p - minP) / range) * chartH;
    const xStep = chartW / candles.length;
    const xAt = (i) => pad.left + i * xStep + xStep / 2;

    drawGrid(ctx, { pad, chartW, width, chartH, maxP, range });

    /* Le remplissage passe sous les moyennes mobiles pour ne pas les masquer. */
    if (type === 'area') fillArea(ctx, candles, { xAt, yScale, pad, chartH });

    if (showMA) {
      drawSeries(ctx, maSlow, xAt, yScale, COLORS.maSlow, 1, [4, 3]);
      drawSeries(ctx, maFast, xAt, yScale, COLORS.maFast, 1.5);
    }

    const renderers = {
      candles: drawCandles,
      ohlc: drawOhlcBars,
      line: drawLinePrice,
      area: drawLinePrice,
    };
    renderers[type](ctx, candles, { xAt, yScale, xStep, pad, chartH });

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, chartW, chartH);
  }

  function drawGrid(ctx, { pad, chartW, width, chartH, maxP, range }) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = '10px IBM Plex Mono, monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();

      ctx.fillStyle = COLORS.gridText;
      ctx.fillText(formatPrice(maxP - (range / 4) * i), pad.left - 6, y + 3);
    }
  }

  function drawCandles(ctx, candles, { xAt, yScale, xStep }) {
    const bodyW = Math.max(2, xStep * 0.6);

    candles.forEach((c, i) => {
      const x = xAt(i);
      const bodyTop = yScale(Math.max(c.open, c.close));
      const bodyBot = yScale(Math.min(c.open, c.close));

      ctx.strokeStyle = COLORS.wick;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yScale(c.high));
      ctx.lineTo(x, yScale(c.low));
      ctx.stroke();

      ctx.fillStyle = c.close >= c.open ? COLORS.candleUp : COLORS.candleDown;
      ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, Math.max(1, bodyBot - bodyTop));
    });
  }

  function drawOhlcBars(ctx, candles, { xAt, yScale, xStep }) {
    const tick = Math.max(2, xStep * 0.3);

    candles.forEach((c, i) => {
      const x = xAt(i);
      ctx.strokeStyle = c.close >= c.open ? COLORS.candleUp : COLORS.candleDown;
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      ctx.moveTo(x, yScale(c.high));
      ctx.lineTo(x, yScale(c.low));

      const openY = yScale(c.open);
      ctx.moveTo(x - tick, openY);
      ctx.lineTo(x, openY);

      const closeY = yScale(c.close);
      ctx.moveTo(x, closeY);
      ctx.lineTo(x + tick, closeY);
      ctx.stroke();
    });
  }

  function closePath(ctx, candles, xAt, yScale) {
    ctx.beginPath();
    candles.forEach((c, i) => {
      const x = xAt(i);
      const y = yScale(c.close);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }

  function drawLinePrice(ctx, candles, { xAt, yScale }) {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    closePath(ctx, candles, xAt, yScale);
    ctx.stroke();
    drawLastMarker(ctx, candles, xAt, yScale);
  }

  function fillArea(ctx, candles, { xAt, yScale, pad, chartH }) {
    const baseline = pad.top + chartH;

    closePath(ctx, candles, xAt, yScale);
    ctx.lineTo(xAt(candles.length - 1), baseline);
    ctx.lineTo(xAt(0), baseline);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, pad.top, 0, baseline);
    gradient.addColorStop(0, COLORS.areaTop);
    gradient.addColorStop(1, COLORS.areaBottom);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function drawLastMarker(ctx, candles, xAt, yScale) {
    const last = candles[candles.length - 1];
    ctx.fillStyle = COLORS.marker;
    ctx.fillRect(xAt(candles.length - 1) - 2, yScale(last.close) - 2, 4, 4);
  }

  function drawSeries(ctx, data, xAt, yScale, color, lineWidth, dash) {
    if (!data?.length) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash || []);

    let started = false;
    data.forEach((val, i) => {
      if (val === null || val === undefined) return;
      const x = xAt(i);
      const y = yScale(val);
      if (!started) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    if (started) ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawVolumeChart(canvas, history, average) {
    const { ctx, width, height } = setupCanvas(canvas);
    const pad = { top: 8, right: 8, bottom: 24, left: 8 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    if (!history?.length) return;

    const maxV = Math.max(...history.map((h) => h.value), average) * 1.1 || 1;
    const barW = chartW / history.length;
    const gap = 2;

    const avgY = pad.top + chartH - (average / maxV) * chartH;
    ctx.strokeStyle = COLORS.volumeAvg;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, avgY);
    ctx.lineTo(width - pad.right, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    history.forEach((item, i) => {
      const barH = (item.value / maxV) * chartH;
      const x = pad.left + i * barW + gap / 2;
      const y = pad.top + chartH - barH;
      const w = Math.max(1, barW - gap);

      ctx.fillStyle = item.value >= average ? COLORS.candleUp : COLORS.volumeBar;
      ctx.fillRect(x, y, w, barH);

      if (i % 2 === 0) {
        ctx.fillStyle = COLORS.gridText;
        ctx.font = '8px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, x + w / 2, height - 4);
      }
    });

    ctx.strokeStyle = COLORS.border;
    ctx.strokeRect(pad.left, pad.top, chartW, chartH);
  }

  function formatPrice(p) {
    if (p >= 1000) return p.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    if (p >= 1) return p.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    return p.toLocaleString('fr-FR', { maximumFractionDigits: 4 });
  }

  return { drawPriceChart, drawVolumeChart, TYPES };
})();
