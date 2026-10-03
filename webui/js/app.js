/**
 * KORSH MINING POOL [KSH] — CLIENT TELEMETRY & DASHBOARD CONTROLLER
 * Connects to Miningcore REST APIs for real-time mining pool data.
 * Architecture: Polling (5s interval) with real-time UI reactive updates & animations.
 * Audited & Enhanced: Multi-software stratum commands, 8-tile worker diagnostics,
 * full blocks lifecycle (orphaned/confirmed/pending), recent payouts ledger & unified search.
 */

(function () {
  "use strict";

  /* ==========================================================================
     API ENDPOINT CONFIGURATION
     In local development with INICIAR_LOCAL.bat, requests to /api/ are proxied
     to https://pool.korsh.org/api/ (or local Miningcore).
     In production, the web server routes /api/ directly to the Miningcore backend.
     ========================================================================== */
  var API_BASE = "/api/pools/korsh";
  var API_STATS = API_BASE + "/performance";
  var API_MINERS = API_BASE + "/miners";
  var API_BLOCKS = API_BASE + "/blocks";
  var API_PAYMENTS = API_BASE + "/payments";

  /* ==========================================================================
     DOM ELEMENT REFERENCES
     ========================================================================== */
  // Top HUD Telemetry
  var hudPoolHash = document.getElementById("hudPoolHash");
  var hudPoolHashUnit = document.getElementById("hudPoolHashUnit");
  var hudSharePct = document.getElementById("hudSharePct");
  var hudShareBar = document.getElementById("hudShareBar");
  var hudNetHash = document.getElementById("hudNetHash");
  var hudConnectedMiners = document.getElementById("hudConnectedMiners");
  var hudBlocksCount = document.getElementById("hudBlocksCount");
  var hudNetworkDiff = document.getElementById("hudNetworkDiff");
  var hudPoolEffort = document.getElementById("hudPoolEffort");
  var hudBlockHeight = document.getElementById("hudBlockHeight");
  var hudPeers = document.getElementById("hudPeers");
  var hudPoolFee = document.getElementById("hudPoolFee");
  var hudMinPayout = document.getElementById("hudMinPayout");

  // Badges & Tables
  var activeMinersBadge = document.getElementById("activeMinersBadge");
  var blocksTableBadge = document.getElementById("blocksTableBadge");
  var paymentsTableBadge = document.getElementById("paymentsTableBadge");
  var minersTableBody = document.getElementById("minersTableBody");
  var blocksTableBody = document.getElementById("blocksTableBody");
  var paymentsTableBody = document.getElementById("paymentsTableBody");

  // Connectivity & Feedback
  var livePill = document.getElementById("livePill");
  var liveTxt = document.getElementById("liveTxt");
  var toastElem = document.getElementById("toastElem");
  var toastMsg = document.getElementById("toastMsg");

  // SVG Performance Chart
  var chartWrapper = document.getElementById("chartWrapper");
  var hashChartSvg = document.getElementById("hashChart");
  var chartAreaPath = document.getElementById("chartAreaPath");
  var chartLinePath = document.getElementById("chartLinePath");
  var chartNetLinePath = document.getElementById("chartNetLinePath");
  var chartCrosshair = document.getElementById("chartCrosshair");
  var chartHoverDot = document.getElementById("chartHoverDot");
  var chartTooltip = document.getElementById("chartTooltip");

  // Worker Diagnostics Tiles
  var wHashrate = document.getElementById("wHashrate");
  var wPendingShares = document.getElementById("wPendingShares");
  var wPendingBal = document.getElementById("wPendingBal");
  var wTotalPaid = document.getElementById("wTotalPaid");
  var wMinerEffort = document.getElementById("wMinerEffort");
  var wBlocksFound = document.getElementById("wBlocksFound");
  var wTodayPaid = document.getElementById("wTodayPaid");
  var wLastPayout = document.getElementById("wLastPayout");

  // State
  var rawMinersList = [];
  var activeMinersList = [];
  var rawBlocksList = [];
  var rawPaymentsList = [];
  var cachedPoolConfig = null;
  var cachedPerfStats = null;
  var aggregatedMinersHash = 0;
  var cachedChartPoints = [];
  var currentActiveTab = "miners";
  var cachedTotalBlocks = null; // "miners", "blocks", "payments"
  var currentSelectedMinerSoftware = "cpuminer"; // "cpuminer", "srb", "native"

  /* ==========================================================================
     PARTICLE NETWORK CANVAS ANIMATION (Adapted from korshweb)
     ========================================================================== */
  function initParticleCanvas() {
    var canvas = document.getElementById("particleCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var particles = [];
    var NUM_PARTICLES = window.innerWidth < 768 ? 35 : 65;
    var CONNECT_DISTANCE = 130;
    var animationFrameId;

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    function createParticles() {
      particles = [];
      var w = window.innerWidth;
      var h = window.innerHeight;
      for (var i = 0; i < NUM_PARTICLES; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 1.4 + 0.8,
        });
      }
    }

    function draw() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 204, 82, 0.45)";
        ctx.shadowColor = "#00CC52";
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0;

        for (var j = i + 1; j < particles.length; j++) {
          var p2 = particles[j];
          var dx = p.x - p2.x;
          var dy = p.y - p2.y;
          var dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECT_DISTANCE) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            var alpha = (1 - dist / CONNECT_DISTANCE) * 0.16;
            ctx.strokeStyle = "rgba(0, 204, 82, " + alpha + ")";
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    }

    window.addEventListener("resize", function () {
      resize();
      createParticles();
    });

    resize();
    createParticles();
    draw();
  }

  /* ==========================================================================
     FORMATTING & UTILITY FUNCTIONS
     ========================================================================== */
  function fmtHash(h) {
    if (h == null || isNaN(h) || h <= 0) return ["0.00", "H/s"];
    var units = [
      [1e12, "TH/s"],
      [1e9, "GH/s"],
      [1e6, "MH/s"],
      [1e3, "kH/s"],
    ];
    for (var i = 0; i < units.length; i++) {
      if (h >= units[i][0]) return [(h / units[i][0]).toFixed(2), units[i][1]];
    }
    return [h.toFixed(2), "H/s"];
  }

  function fmtNum(n, decimals) {
    if (n == null || isNaN(n)) return "—";
    return Number(n).toLocaleString(undefined, {
      maximumFractionDigits: decimals == null ? 2 : decimals,
    });
  }

  function fmtDiff(n) {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1) return fmtNum(n, 2);
    return Number(n).toPrecision(4);
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    var t = Date.parse(iso);
    if (isNaN(t)) return "—";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function truncate(s, n) {
    s = String(s || "");
    n = n || 10;
    return s.length > 2 * n ? s.slice(0, n) + "…" + s.slice(-n) : s;
  }

  function cleanExplorerLink(type, hashOrAddr) {
    if (!hashOrAddr) return "https://explorer.korsh.org";
    var clean = encodeURIComponent(String(hashOrAddr).trim());
    if (type === "block") return "https://explorer.korsh.org/block/" + clean;
    if (type === "tx") return "https://explorer.korsh.org/tx/" + clean;
    if (type === "address") return "https://explorer.korsh.org/address/" + clean;
    return "https://explorer.korsh.org";
  }

  function notifyToast(text) {
    if (!toastElem || !toastMsg) return;
    toastMsg.textContent = text;
    toastElem.classList.add("show");
    setTimeout(function () {
      toastElem.classList.remove("show");
    }, 2200);
  }

  function copyText(txt, successMsg) {
    if (!txt) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(txt)
        .then(function () {
          notifyToast(successMsg || "Copied to clipboard!");
        })
        .catch(function () {
          window.prompt("Copy this text:", txt);
        });
    } else {
      window.prompt("Copy this text:", txt);
    }
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  /* ==========================================================================
     1. UPDATE POOL HUD (TELEMETRY)
     ========================================================================== */
  function updateHUD(statsData, poolConfig) {
    if (statsData) cachedPerfStats = statsData;
    if (poolConfig) cachedPoolConfig = poolConfig;
    var stats = cachedPerfStats;
    var cfg = cachedPoolConfig;

    var netHash = 0;
    var netDiff = 0;
    var blockHeight = null;
    var peers = null;
    var poolEffort = 0;
    var totalBlocksCount = null;
    var connectedMinersCount = 0;

    if (cfg && cfg.pool) {
      var p = cfg.pool;
      if (p.networkStats) {
        netHash = p.networkStats.networkHashrate || 0;
        netDiff = p.networkStats.networkDifficulty || 0;
        blockHeight = p.networkStats.blockHeight;
        peers = p.networkStats.connectedPeers;
      }
      if (p.poolFeePercent != null && hudPoolFee) {
        hudPoolFee.textContent = p.poolFeePercent + "%";
      }
      if (p.paymentProcessing && p.paymentProcessing.minimumPayment != null && hudMinPayout) {
        hudMinPayout.textContent = p.paymentProcessing.minimumPayment + " KSH";
      }
      if (p.poolEffort != null) {
        poolEffort = p.poolEffort;
      }
      if (p.totalBlocks != null) {
        totalBlocksCount = p.totalBlocks;
        cachedTotalBlocks = p.totalBlocks;
      }
      if (p.poolStats && p.poolStats.connectedMiners != null && p.poolStats.connectedMiners > 0) {
        connectedMinersCount = p.poolStats.connectedMiners;
      }
    }

    // Fallback connected miners count to known miner list
    if (connectedMinersCount === 0) {
      connectedMinersCount = activeMinersList.length || rawMinersList.length;
    }

    // Latest Performance Bucket
    var perfBuckets = (stats && stats.stats) || [];
    if (perfBuckets.length > 0) {
      var latest = perfBuckets[perfBuckets.length - 1];
      if (!netHash && latest.networkHashrate) netHash = latest.networkHashrate;
      if (!netDiff && latest.networkDifficulty) netDiff = latest.networkDifficulty;
    }

    // Determine current Pool Hashrate:
    // 1) Prefer sum of active miners
    // 2) Fallback to cfg.pool.poolStats.poolHashrate
    // 3) Fallback to latest performance bucket
    var pHash = aggregatedMinersHash > 0 ? aggregatedMinersHash : 0;
    if (pHash === 0 && cfg && cfg.pool && cfg.pool.poolStats && cfg.pool.poolStats.poolHashrate > 0) {
      pHash = cfg.pool.poolStats.poolHashrate;
    }
    if (pHash === 0 && perfBuckets.length > 0) {
      var lastBucket = perfBuckets[perfBuckets.length - 1];
      var bucketAgeMs = lastBucket.created
        ? Date.now() - new Date(lastBucket.created).getTime()
        : Infinity;
      if (bucketAgeMs <= 15 * 60 * 1000) {
        pHash = lastBucket.poolHashrate || 0;
      }
    }

    var f = fmtHash(pHash);
    if (hudPoolHash) hudPoolHash.textContent = f[0];
    if (hudPoolHashUnit) hudPoolHashUnit.textContent = f[1];

    if (hudNetHash) hudNetHash.textContent = netHash > 0 ? fmtHash(netHash).join(" ") : "—";
    if (hudNetworkDiff) hudNetworkDiff.textContent = netDiff > 0 ? fmtDiff(netDiff) : "—";

    if (blockHeight != null && hudBlockHeight) hudBlockHeight.textContent = "#" + fmtNum(blockHeight, 0);
    if (peers != null && hudPeers) hudPeers.textContent = peers;

    if (hudConnectedMiners) hudConnectedMiners.textContent = connectedMinersCount;
    if (hudPoolEffort) hudPoolEffort.textContent = poolEffort > 0 ? poolEffort.toFixed(1) + "%" : "0.0%";

    // Total blocks discovered by the pool (avoid flashing rawBlocksList.length page size)
    if (totalBlocksCount != null) {
      cachedTotalBlocks = totalBlocksCount;
      if (hudBlocksCount) hudBlocksCount.textContent = fmtNum(totalBlocksCount, 0);
      if (blocksTableBadge) blocksTableBadge.textContent = totalBlocksCount;
    }

    // Pool Share Percentage of Total Network Hashrate
    if (netHash > 0 && pHash > 0) {
      var pct = Math.min(100, (pHash / netHash) * 100);
      var pctStr = pct < 0.01 ? "<0.01%" : pct.toFixed(2) + "%";
      if (hudSharePct) hudSharePct.textContent = pctStr;
      if (hudShareBar) hudShareBar.style.width = Math.max(1.5, pct) + "%";
    } else {
      if (hudSharePct) hudSharePct.textContent = "0.00%";
      if (hudShareBar) hudShareBar.style.width = "0%";
    }
  }

  /* ==========================================================================
     2. RENDER 24H PERFORMANCE HASHRATE CHART (SVG & INTERACTIVE TOOLTIP)
     Plots both Pool Hashrate and Network Hashrate with dual-scale visualization.
     ========================================================================== */
  function renderChart(buckets) {
    if (!Array.isArray(buckets) || buckets.length < 2 || !chartLinePath || !chartAreaPath) return;

    var maxPoolH = 1000;
    var maxNetH = 1000;
    for (var i = 0; i < buckets.length; i++) {
      var ph = buckets[i].poolHashrate || 0;
      var nh = buckets[i].networkHashrate || 0;
      if (ph > maxPoolH) maxPoolH = ph;
      if (nh > maxNetH) maxNetH = nh;
    }
    maxPoolH *= 1.15; // 15% top padding
    maxNetH *= 1.15;

    var W = 1000;
    var H = 200;
    var n = buckets.length;
    var poolPts = [];
    var netPts = [];
    cachedChartPoints = [];

    for (var j = 0; j < n; j++) {
      var x = (j / (n - 1)) * W;
      var curPool = buckets[j].poolHashrate || 0;
      var curNet = buckets[j].networkHashrate || 0;

      // Pool Y coordinate
      var yPool = H - (curPool / maxPoolH) * (H - 28) - 10;
      poolPts.push([x, yPool]);

      // Network Y coordinate (scaled gracefully across upper range)
      var yNet = H - (curNet / maxNetH) * (H - 35) - 15;
      netPts.push([x, yNet]);

      cachedChartPoints.push({
        x: x,
        y: yPool,
        yNet: yNet,
        poolHashrate: curPool,
        networkHashrate: curNet,
        time: buckets[j].created
          ? new Date(buckets[j].created).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "—",
      });
    }

    // Build pool line path
    var lineD = "M " + poolPts[0][0].toFixed(1) + " " + poolPts[0][1].toFixed(1);
    for (var k = 1; k < poolPts.length; k++) {
      lineD += " L " + poolPts[k][0].toFixed(1) + " " + poolPts[k][1].toFixed(1);
    }
    chartLinePath.setAttribute("d", lineD);

    // Area fill down to base
    var areaD = lineD + " L " + W + " " + H + " L 0 " + H + " Z";
    chartAreaPath.setAttribute("d", areaD);

    // Build network line path
    if (chartNetLinePath && netPts.length > 1) {
      var netD = "M " + netPts[0][0].toFixed(1) + " " + netPts[0][1].toFixed(1);
      for (var m = 1; m < netPts.length; m++) {
        netD += " L " + netPts[m][0].toFixed(1) + " " + netPts[m][1].toFixed(1);
      }
      chartNetLinePath.setAttribute("d", netD);
    }
  }

  // Interactive mouse & touch on chart wrapper (Touch-enabled for mobile)
  if (chartWrapper && hashChartSvg) {
    var touchHideTimer = null;

    function handleChartPointer(clientX) {
      if (!cachedChartPoints.length) return;
      var rect = chartWrapper.getBoundingClientRect();
      var mouseX = clientX - rect.left;
      var normX = Math.max(0, Math.min(1000, (mouseX / rect.width) * 1000));

      // Find closest data point
      var closest = cachedChartPoints.reduce(function (prev, curr) {
        return Math.abs(curr.x - normX) < Math.abs(prev.x - normX) ? curr : prev;
      });

      if (!closest) return;

      if (chartCrosshair) {
        chartCrosshair.setAttribute("x1", closest.x);
        chartCrosshair.setAttribute("x2", closest.x);
        chartCrosshair.style.opacity = "1";
      }

      if (chartHoverDot) {
        chartHoverDot.setAttribute("cx", closest.x);
        chartHoverDot.setAttribute("cy", closest.y);
        chartHoverDot.style.opacity = "1";
      }

      if (chartTooltip) {
        var hfPool = fmtHash(closest.poolHashrate);
        var hfNet = fmtHash(closest.networkHashrate);
        chartTooltip.innerHTML =
          '<span>Time: <strong>' +
          esc(closest.time) +
          "</strong></span> &bull; " +
          '<span class="val" style="color:var(--primary);">Pool: ' +
          hfPool[0] +
          " " +
          hfPool[1] +
          "</span> &bull; " +
          '<span style="color:#0099FF; font-weight:600;">Net: ' +
          hfNet[0] +
          " " +
          hfNet[1] +
          "</span>";

        var screenX = (closest.x / 1000) * rect.width;
        var screenY = (closest.y / 200) * rect.height;

        // Dynamic horizontal clamp to prevent tooltip from overflowing off mobile screens
        var tooltipW = chartTooltip.offsetWidth || 180;
        var halfW = tooltipW / 2;
        var clampedX = Math.max(halfW + 6, Math.min(rect.width - halfW - 6, screenX));

        chartTooltip.style.left = clampedX + "px";
        chartTooltip.style.top = Math.max(28, screenY) + "px";
        chartTooltip.classList.add("show");
      }
    }

    function hideChartTooltip() {
      if (chartCrosshair) chartCrosshair.style.opacity = "0";
      if (chartHoverDot) chartHoverDot.style.opacity = "0";
      if (chartTooltip) chartTooltip.classList.remove("show");
    }

    chartWrapper.addEventListener("mousemove", function (e) {
      handleChartPointer(e.clientX);
    });

    chartWrapper.addEventListener("mouseleave", hideChartTooltip);

    chartWrapper.addEventListener("touchstart", function (e) {
      if (touchHideTimer) clearTimeout(touchHideTimer);
      if (e.touches && e.touches.length > 0) {
        handleChartPointer(e.touches[0].clientX);
      }
    }, { passive: true });

    chartWrapper.addEventListener("touchmove", function (e) {
      if (touchHideTimer) clearTimeout(touchHideTimer);
      if (e.touches && e.touches.length > 0) {
        handleChartPointer(e.touches[0].clientX);
      }
    }, { passive: true });

    chartWrapper.addEventListener("touchend", function () {
      touchHideTimer = setTimeout(hideChartTooltip, 2400);
    });
  }

  /* ==========================================================================
     3. RENDER ACTIVE MINERS LEADERBOARD WITH RANK MEDALS & STANDBY STATUS
     ========================================================================== */
  function renderMiners(list) {
    rawMinersList = Array.isArray(list) ? list : [];

    // Separate active miners from standby miners
    activeMinersList = rawMinersList.filter(function (m) {
      return (Number(m.hashrate) || 0) > 0 || (Number(m.sharesPerSecond) || 0) > 0;
    });

    if (activeMinersBadge) {
      activeMinersBadge.textContent = rawMinersList.length;
    }

    aggregatedMinersHash = 0;
    activeMinersList.forEach(function (m) {
      aggregatedMinersHash += m.hashrate || 0;
    });

    filterExplorer();
  }

  /* ==========================================================================
     4. RENDER MINED BLOCKS TABLE (CONFIRMED / ORPHANED / PENDING)
     ========================================================================== */
  function renderBlocks(list) {
    rawBlocksList = Array.isArray(list) ? list : [];

    // Prioritize cachedTotalBlocks or cfg.pool.totalBlocks over list length (list is paginated!)
    var poolTotal = cachedTotalBlocks != null
      ? cachedTotalBlocks
      : (cachedPoolConfig && cachedPoolConfig.pool && cachedPoolConfig.pool.totalBlocks != null
          ? cachedPoolConfig.pool.totalBlocks
          : null);

    if (poolTotal != null) {
      if (blocksTableBadge) blocksTableBadge.textContent = poolTotal;
      if (hudBlocksCount) hudBlocksCount.textContent = fmtNum(poolTotal, 0);
    }

    filterExplorer();
  }

  /* ==========================================================================
     5. RENDER RECENT PAYOUTS TABLE (MININGCORE PAYMENTS)
     ========================================================================== */
  function renderPayments(list) {
    rawPaymentsList = Array.isArray(list) ? list : [];
    if (paymentsTableBadge) paymentsTableBadge.textContent = rawPaymentsList.length;
    filterExplorer();
  }

  /* ==========================================================================
     6. UNIFIED SEARCH & FILTER FOR ALL 3 EXPLORER TABS
     ========================================================================== */
  function filterExplorer() {
    var filterInput = document.getElementById("filterMinersInput");
    var query = (filterInput ? filterInput.value : "").trim().toLowerCase();

    // 1. MINERS TAB
    if (currentActiveTab === "miners") {
      if (!minersTableBody) return;
      var minersToDisplay = rawMinersList.slice();

      // Sort: active hashrate descending first, then standby
      minersToDisplay.sort(function (a, b) {
        return (b.hashrate || 0) - (a.hashrate || 0);
      });

      if (query) {
        minersToDisplay = minersToDisplay.filter(function (m) {
          return String(m.miner).toLowerCase().indexOf(query) !== -1;
        });
      }

      if (!minersToDisplay.length) {
        minersTableBody.innerHTML =
          '<tr><td colspan="6" class="empty-row-msg">' +
          (rawMinersList.length
            ? "No miners match your search."
            : "No active miners currently connected — be the first to mine on this pool! ⛏") +
          "</td></tr>";
        return;
      }

      minersTableBody.innerHTML = minersToDisplay
        .map(function (m, idx) {
          var fullAddr = esc(m.miner || "Anonymous");
          var shortA = esc(truncate(m.miner, 14));
          var hf = fmtHash(m.hashrate || 0);
          var mHash = m.hashrate || 0;
          var isMining = mHash > 0 || (m.sharesPerSecond || 0) > 0;
          var share =
            aggregatedMinersHash > 0 && isMining
              ? ((mHash / aggregatedMinersHash) * 100).toFixed(1) + "%"
              : isMining
              ? "100.0%"
              : "—";

          var rankClass =
            idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : idx === 2 ? "rank-3" : "rank-other";

          var hashPill = isMining
            ? '<span class="pill-hash">' + hf[0] + " " + hf[1] + "</span>"
            : '<span class="pill-conf standby" style="font-size:10px;">Standby</span>';

          var shareVal = isMining
            ? '<span style="color:var(--accent-neon); font-weight:700;">' + share + "</span>"
            : '<span style="color:var(--text-dim);">—</span>';

          return (
            "<tr>" +
            '<td class="center"><span class="rank-badge ' +
            rankClass +
            '">' +
            (idx + 1) +
            "</span></td>" +
            "<td>" +
            '<span class="addr-copyable" data-copy="' +
            fullAddr +
            '" title="Click to copy: ' +
            fullAddr +
            '">' +
            "<span>" +
            shortA +
            "</span>" +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
            "</span>" +
            "</td>" +
            '<td class="num">' +
            hashPill +
            "</td>" +
            '<td class="num">' +
            fmtNum(m.sharesPerSecond, 3) +
            "</td>" +
            '<td class="num">' +
            shareVal +
            "</td>" +
            '<td class="center">' +
            '<button class="btn-table-action view-miner-btn" data-addr="' +
            fullAddr +
            '">View Stats</button>' +
            "</td>" +
            "</tr>"
          );
        })
        .join("");

      attachMinerActionListeners();
    }

    // 2. BLOCKS TAB
    else if (currentActiveTab === "blocks") {
      if (!blocksTableBody) return;
      var blocksToDisplay = rawBlocksList.slice();

      if (query) {
        blocksToDisplay = blocksToDisplay.filter(function (b) {
          var h = String(b.blockHeight || "");
          var hash = String(b.hash || b.blockHash || "").toLowerCase();
          var miner = String(b.miner || "").toLowerCase();
          return h.indexOf(query) !== -1 || hash.indexOf(query) !== -1 || miner.indexOf(query) !== -1;
        });
      }

      if (!blocksToDisplay.length) {
        blocksTableBody.innerHTML =
          '<tr><td colspan="6" class="empty-row-msg">' +
          (rawBlocksList.length
            ? "No blocks match your search."
            : "Hunting for block candidate… 100% of block reward goes to pool participants. ⛏") +
          "</td></tr>";
        return;
      }

      blocksTableBody.innerHTML = blocksToDisplay
        .map(function (b) {
          var statusLower = String(b.status || "").toLowerCase();
          var isOrphaned = statusLower === "orphaned";
          var isConfirmed = statusLower === "confirmed" || (b.confirmationProgress != null && b.confirmationProgress >= 1);
          var height = b.blockHeight != null ? b.blockHeight : "—";
          var fullHash = esc(b.hash || b.blockHash || "");
          var shortH = esc(truncate(b.hash || b.blockHash || "", 8));
          var fullMiner = esc(b.miner || "");
          var shortM = esc(truncate(b.miner, 8));
          var when = timeAgo(b.created);

          var pill = "";
          var reward = "";

          if (isOrphaned) {
            pill = '<span class="pill-conf orphaned">Orphaned ✕</span>';
            reward = '<span style="color:var(--text-dim); text-decoration:line-through;">0.0000 KSH</span>';
          } else if (isConfirmed) {
            pill = '<span class="pill-conf confirmed">Confirmed ✓</span>';
            reward = Number(b.reward || 1.4).toFixed(4) + " KSH";
          } else {
            var pct = Math.round((b.confirmationProgress || 0) * 100);
            pill = '<span class="pill-conf pending">Confirming (' + pct + '%)</span>';
            reward =
              b.reward != null && Number(b.reward) > 0
                ? Number(b.reward).toFixed(4) + " KSH"
                : '<span style="color:var(--dim)">pending</span>';
          }

          var blockExplorerLink = cleanExplorerLink("block", b.hash || b.blockHash);

          return (
            "<tr>" +
            "<td><strong style='color:#FFFFFF;'>#" +
            height +
            "</strong></td>" +
            "<td>" +
            '<a href="' +
            esc(blockExplorerLink) +
            '" target="_blank" rel="noopener" class="addr-copyable" title="View in Explorer: ' +
            fullHash +
            '">' +
            "<span>" +
            shortH +
            "</span>" +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
            "</a>" +
            "</td>" +
            '<td><span class="addr-copyable" data-copy="' +
            fullMiner +
            '" title="Click to copy: ' +
            fullMiner +
            '">' +
            shortM +
            "</span></td>" +
            '<td class="num" style="color:#FFFFFF; font-weight:700;">' +
            reward +
            "</td>" +
            '<td class="center">' +
            pill +
            "</td>" +
            '<td class="num" style="color:var(--dim);">' +
            when +
            "</td>" +
            "</tr>"
          );
        })
        .join("");

      attachCopyListeners(blocksTableBody);
    }

    // 3. PAYMENTS TAB
    else if (currentActiveTab === "payments") {
      if (!paymentsTableBody) return;
      var paymentsToDisplay = rawPaymentsList.slice();

      if (query) {
        paymentsToDisplay = paymentsToDisplay.filter(function (p) {
          var addr = String(p.address || "").toLowerCase();
          var tx = String(p.transactionConfirmationData || "").toLowerCase();
          return addr.indexOf(query) !== -1 || tx.indexOf(query) !== -1;
        });
      }

      if (!paymentsToDisplay.length) {
        paymentsTableBody.innerHTML =
          '<tr><td colspan="4" class="empty-row-msg">' +
          (rawPaymentsList.length
            ? "No payouts match your search."
            : "No payouts recorded yet. Automatic payouts trigger at 0.5 KSH threshold.") +
          "</td></tr>";
        return;
      }

      paymentsTableBody.innerHTML = paymentsToDisplay
        .map(function (p) {
          var fullAddr = esc(p.address || "");
          var shortAddr = esc(truncate(p.address, 12));
          var fullTx = esc(p.transactionConfirmationData || "");
          var shortTx = esc(truncate(p.transactionConfirmationData, 10));
          var amt = Number(p.amount || 0).toFixed(4);
          var when = timeAgo(p.created);
          var txLink = cleanExplorerLink("tx", p.transactionConfirmationData);
          var addrLink = cleanExplorerLink("address", p.address);

          return (
            "<tr>" +
            '<td style="white-space:nowrap; color:var(--text-dim);">' +
            '<span title="' +
            esc(p.created || "") +
            '">' +
            when +
            "</span>" +
            "</td>" +
            "<td>" +
            '<a href="' +
            esc(addrLink) +
            '" target="_blank" rel="noopener" class="addr-copyable" title="View in Explorer: ' +
            fullAddr +
            '">' +
            "<span>" +
            shortAddr +
            "</span>" +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
            "</a>" +
            "</td>" +
            '<td class="num" style="color:var(--accent-neon); font-weight:700;">' +
            amt +
            " KSH</td>" +
            "<td>" +
            (fullTx
              ? '<a href="' +
                esc(txLink) +
                '" target="_blank" rel="noopener" class="addr-copyable" title="View Tx: ' +
                fullTx +
                '">' +
                "<span>" +
                shortTx +
                "</span>" +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                "</a>"
              : '<span style="color:var(--text-dim);">—</span>') +
            "</td>" +
            "</tr>"
          );
        })
        .join("");

      attachCopyListeners(paymentsTableBody);
    }
  }

  function attachCopyListeners(container) {
    if (!container) return;
    container.querySelectorAll(".addr-copyable[data-copy]").forEach(function (el) {
      el.addEventListener("click", function () {
        copyText(this.getAttribute("data-copy"), "Address copied!");
      });
    });
  }

  function attachMinerActionListeners() {
    if (!minersTableBody) return;
    minersTableBody.querySelectorAll(".addr-copyable[data-copy]").forEach(function (el) {
      el.addEventListener("click", function () {
        copyText(this.getAttribute("data-copy"), "Miner address copied!");
      });
    });

    minersTableBody.querySelectorAll(".view-miner-btn").forEach(function (el) {
      el.addEventListener("click", function () {
        var a = this.getAttribute("data-addr");
        var input = document.getElementById("minerAddressInput");
        if (input) input.value = a;
        lookupMinerAddress(a);
        var lookupSection = document.getElementById("workerResultBox");
        if (lookupSection) lookupSection.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  var filterMinersInput = document.getElementById("filterMinersInput");
  if (filterMinersInput) {
    filterMinersInput.addEventListener("input", filterExplorer);
  }

  /* ==========================================================================
     7. PERSONAL MINER WORKER LOOKUP & 8 METRIC DIAGNOSTICS
     ========================================================================== */
  function renderWorkerHistory(balanceChanges, payments) {
    var body = document.getElementById("workerHistoryBody");
    var cnt = document.getElementById("wHistCount");
    var rows = [];

    (balanceChanges || []).forEach(function (ch) {
      var m = /block\s+(\d+)/i.exec(ch.usage || "");
      rows.push({
        t: ch.created || "",
        type: "reward",
        detail: m ? "Block #" + m[1] : ch.usage || "Reward",
        amt: Number(ch.amount || 0),
      });
    });

    (payments || []).forEach(function (p) {
      var txLink = p.transactionConfirmationData
        ? cleanExplorerLink("tx", p.transactionConfirmationData)
        : null;
      rows.push({
        t: p.created || "",
        type: "payout",
        detail: p.transactionConfirmationData
          ? "Tx " + String(p.transactionConfirmationData).slice(0, 14) + "…"
          : "Payout",
        link: txLink,
        amt: Number(p.amount || 0),
      });
    });

    rows.sort(function (a, b) {
      return String(b.t).localeCompare(String(a.t));
    });

    if (cnt) cnt.textContent = rows.length ? rows.length + " entries" : "";
    if (!body) return;

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="empty-row-msg">No rewards credited yet.</td></tr>';
      return;
    }

    body.innerHTML = rows
      .slice(0, 15)
      .map(function (r) {
        var d = r.t ? new Date(r.t) : null;
        var timeStr = d && !isNaN(d.getTime()) ? d.toLocaleString() : "—";
        var badge =
          r.type === "reward"
            ? '<span class="pill-conf confirmed">Reward</span>'
            : '<span class="pill-conf" style="background:rgba(0,204,82,0.12); color:var(--accent-neon); border:1px solid rgba(0,204,82,0.4);">Paid</span>';

        var detailContent = r.link
          ? '<a href="' +
            esc(r.link) +
            '" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">' +
            esc(r.detail) +
            " ↗</a>"
          : esc(r.detail);

        return (
          "<tr>" +
          '<td style="white-space:nowrap; color:var(--text-dim);">' +
          esc(timeStr) +
          "</td>" +
          "<td>" +
          badge +
          "</td>" +
          "<td>" +
          detailContent +
          "</td>" +
          '<td class="num" style="color:var(--accent-neon); font-weight:700;">' +
          r.amt.toFixed(4) +
          " KSH</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function lookupMinerAddress(addr) {
    if (!addr) return;
    addr = addr.trim();

    var resultBox = document.getElementById("workerResultBox");
    var rigsBody = document.getElementById("workerRigsBody");

    if (resultBox) resultBox.classList.add("active");
    if (wHashrate) wHashrate.textContent = "Querying…";
    if (wPendingShares) wPendingShares.textContent = "—";
    if (wPendingBal) wPendingBal.textContent = "—";
    if (wTotalPaid) wTotalPaid.textContent = "—";
    if (wMinerEffort) wMinerEffort.textContent = "—";
    if (wBlocksFound) wBlocksFound.textContent = "—";
    if (wTodayPaid) wTodayPaid.textContent = "—";
    if (wLastPayout) wLastPayout.textContent = "—";

    // Match in live miners list
    var activeMinerMatch = rawMinersList.find(function (m) {
      return String(m.miner).toLowerCase() === addr.toLowerCase();
    });

    var enc = encodeURIComponent(addr);
    Promise.all([
      fetchJSON(API_BASE + "/miners/" + enc + "?perfMode=Hour").catch(function () {
        return {};
      }),
      fetchJSON(API_BASE + "/miners/" + enc + "/balancechanges").catch(function () {
        return [];
      }),
      fetchJSON(API_BASE + "/miners/" + enc + "/payments").catch(function () {
        return [];
      }),
    ])
      .then(function (res) {
        var data = res[0] || {};
        var histBc = res[1] || [];
        var histPay = res[2] || [];
        var hRate = 0;
        var hashrateStr = "0.00 H/s";
        var isLive = false;
        var lastSample = null;

        if (activeMinerMatch && (activeMinerMatch.hashrate || 0) > 0) {
          hashrateStr = fmtHash(activeMinerMatch.hashrate).join(" ");
          isLive = true;
          hRate = activeMinerMatch.hashrate;
        } else if (data && data.performanceSamples && data.performanceSamples.length) {
          lastSample = data.performanceSamples[data.performanceSamples.length - 1];
          var sAgeMs = lastSample.created
            ? Date.now() - new Date(lastSample.created).getTime()
            : Infinity;
          if (sAgeMs <= 15 * 60 * 1000 && lastSample.workers) {
            Object.keys(lastSample.workers).forEach(function (wKey) {
              hRate += lastSample.workers[wKey].hashrate || 0;
            });
            if (hRate > 0) {
              hashrateStr = fmtHash(hRate).join(" ");
              isLive = true;
            }
          }
        }

        // 1. Worker Hashrate
        if (wHashrate) wHashrate.textContent = isLive ? hashrateStr : "0.00 H/s";

        // 2. Pending Shares
        if (wPendingShares)
          wPendingShares.textContent = fmtNum(data.pendingShares || (activeMinerMatch ? activeMinerMatch.sharesPerSecond * 60 : 0), 2);

        // 3. Unpaid Balance
        if (wPendingBal)
          wPendingBal.textContent =
            (data.pendingBalance != null ? Number(data.pendingBalance).toFixed(4) : "0.0000") + " KSH";

        // 4. Total Paid
        if (wTotalPaid)
          wTotalPaid.textContent =
            (data.totalPaid != null ? Number(data.totalPaid).toFixed(4) : "0.0000") + " KSH";

        // 5. Miner Effort
        if (wMinerEffort) {
          var effortVal = data.minerEffort != null ? Number(data.minerEffort) * 100 : 0;
          wMinerEffort.textContent = effortVal > 0 ? effortVal.toFixed(1) + "%" : "100.0%";
        }

        // 6. Blocks Contributed
        if (wBlocksFound) {
          var blkCount = data.totalConfirmedBlocks != null ? data.totalConfirmedBlocks : 0;
          wBlocksFound.textContent = blkCount + " Blocks";
        }

        // 7. Today Paid
        if (wTodayPaid) {
          var tPaid = data.todayPaid != null ? Number(data.todayPaid).toFixed(4) : "0.0000";
          wTodayPaid.textContent = tPaid + " KSH";
        }

        // 8. Last Payout
        if (wLastPayout) {
          if (data.lastPayment) {
            var pAgo = timeAgo(data.lastPayment);
            var pLink = cleanExplorerLink("tx", data.transactionConfirmationData || data.lastPaymentLink);
            wLastPayout.innerHTML =
              '<a href="' +
              esc(pLink) +
              '" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">' +
              esc(pAgo) +
              " ↗</a>";
          } else {
            wLastPayout.textContent = "Never";
          }
        }

        // Render Rigs Breakdown
        var rigs = [];
        if (isLive && data.performanceSamples && data.performanceSamples.length) {
          var latestWorkers =
            data.performanceSamples[data.performanceSamples.length - 1].workers || {};
          Object.keys(latestWorkers).forEach(function (wName) {
            rigs.push({
              name: wName,
              hashrate: latestWorkers[wName].hashrate || 0,
              sharesPerSecond: latestWorkers[wName].sharesPerSecond || 0,
            });
          });
        }

        if (rigsBody) {
          if (rigs.length) {
            rigsBody.innerHTML = rigs
              .map(function (r) {
                var rh = fmtHash(r.hashrate);
                return (
                  "<tr>" +
                  '<td><strong style="color:var(--accent-neon);">' +
                  esc(r.name) +
                  "</strong></td>" +
                  '<td class="num"><span class="pill-hash">' +
                  rh[0] +
                  " " +
                  rh[1] +
                  "</span></td>" +
                  '<td class="num">' +
                  fmtNum(r.sharesPerSecond, 3) +
                  "</td>" +
                  '<td class="center"><span class="pill-conf' +
                  (isLive ? ' confirmed">Online' : ' standby">Standby') +
                  "</span></td>" +
                  "</tr>"
                );
              })
              .join("");
          } else if (activeMinerMatch) {
            var mh = fmtHash(activeMinerMatch.hashrate);
            var isRigOnline = (activeMinerMatch.hashrate || 0) > 0 || (activeMinerMatch.sharesPerSecond || 0) > 0;
            rigsBody.innerHTML =
              "<tr>" +
              '<td><strong style="color:var(--accent-neon);">default_worker</strong></td>' +
              '<td class="num"><span class="pill-hash">' +
              mh[0] +
              " " +
              mh[1] +
              "</span></td>" +
              '<td class="num">' +
              fmtNum(activeMinerMatch.sharesPerSecond, 3) +
              "</td>" +
              '<td class="center"><span class="pill-conf ' +
              (isRigOnline ? 'confirmed">Online' : 'standby">Standby') +
              "</span></td>" +
              "</tr>";
          } else {
            rigsBody.innerHTML =
              '<tr><td colspan="4" class="empty-row-msg">No active worker rigs detected — this address is currently offline.' +
              (data.lastPayment ? " Last payout credited " + timeAgo(data.lastPayment) + "." : "") +
              "</td></tr>";
          }
        }

        renderWorkerHistory(histBc, histPay);
        localStorage.setItem("korsh_saved_miner", addr);
      })
      .catch(function () {
        if (activeMinerMatch) {
          if (wHashrate) wHashrate.textContent = fmtHash(activeMinerMatch.hashrate).join(" ");
          if (wPendingShares)
            wPendingShares.textContent = fmtNum(activeMinerMatch.sharesPerSecond * 60, 0);
          if (wPendingBal) wPendingBal.textContent = "0.0000 KSH";
          if (wTotalPaid) wTotalPaid.textContent = "0.0000 KSH";
          if (wMinerEffort) wMinerEffort.textContent = "100.0%";
          if (wBlocksFound) wBlocksFound.textContent = "—";
          if (wTodayPaid) wTodayPaid.textContent = "0.0000 KSH";
          if (wLastPayout) wLastPayout.textContent = "Never";
        } else {
          if (wHashrate) wHashrate.textContent = "0.00 H/s";
          if (wPendingShares) wPendingShares.textContent = "0";
          if (wPendingBal) wPendingBal.textContent = "0.0000 KSH";
          if (wTotalPaid) wTotalPaid.textContent = "0.0000 KSH";
          if (wMinerEffort) wMinerEffort.textContent = "0.0%";
          if (wBlocksFound) wBlocksFound.textContent = "0 Blocks";
          if (wTodayPaid) wTodayPaid.textContent = "0.0000 KSH";
          if (wLastPayout) wLastPayout.textContent = "Never";
          if (rigsBody) {
            rigsBody.innerHTML =
              '<tr><td colspan="4" class="empty-row-msg">No worker telemetry available for this address.</td></tr>';
          }
        }
      });
  }

  // Lookup button and inputs
  var lookupBtn = document.getElementById("lookupBtn");
  var minerAddressInput = document.getElementById("minerAddressInput");
  var demoAddrBtn = document.getElementById("demoAddrBtn");

  if (lookupBtn && minerAddressInput) {
    lookupBtn.addEventListener("click", function () {
      lookupMinerAddress(minerAddressInput.value);
    });
    minerAddressInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") lookupMinerAddress(this.value);
    });
  }

  if (demoAddrBtn && minerAddressInput) {
    demoAddrBtn.addEventListener("click", function () {
      var demo = rawMinersList.length
        ? rawMinersList[0].miner
        : "SbEDKADfnEYV7C5SThXKMcRndmjmnpXeR6";
      minerAddressInput.value = demo;
      lookupMinerAddress(demo);
    });
  }

  // Auto-restore saved miner from localStorage
  var savedMiner = localStorage.getItem("korsh_saved_miner");
  if (savedMiner && minerAddressInput) {
    minerAddressInput.value = savedMiner;
  }

  /* ==========================================================================
     8. INTERACTIVE MINING COMMAND GENERATOR (CPUMINER / SRB / NATIVE)
     ========================================================================== */
  var genAddrInput = document.getElementById("genAddressInput");
  var genWorkerInput = document.getElementById("genWorkerInput");
  var genThreadsInput = document.getElementById("genThreadsInput");
  var genCmdOutput = document.getElementById("genCmdOutput");

  var btnMinerCpuminer = document.getElementById("btnMinerCpuminer");
  var btnMinerSrb = document.getElementById("btnMinerSrb");
  var btnMinerNative = document.getElementById("btnMinerNative");

  function updateMiningCmd() {
    if (!genCmdOutput) return;
    var addr = (genAddrInput ? genAddrInput.value : "YOUR_KSH_ADDRESS") || "YOUR_KSH_ADDRESS";
    addr = addr.trim();
    var worker = (genWorkerInput ? genWorkerInput.value : "rig1") || "rig1";
    worker = worker.trim();
    var threads = (genThreadsInput ? genThreadsInput.value : "8") || "8";
    var stratumHost = "pool.korsh.org:3333";
    var userArg = addr + "." + worker;

    if (currentSelectedMinerSoftware === "srb") {
      genCmdOutput.textContent =
        "SRBMiner-MULTI --algorithm yespower --pool " +
        stratumHost +
        " --wallet " +
        userArg +
        " --cpu-threads " +
        threads +
        " --password c=KSH";
    } else if (currentSelectedMinerSoftware === "native") {
      genCmdOutput.textContent =
        "korsh-miner --stratum stratum+tcp://" +
        stratumHost +
        " --user " +
        userArg +
        " --threads " +
        threads;
    } else {
      // Default: cpuminer-opt
      genCmdOutput.textContent =
        "cpuminer -a yespower -o stratum+tcp://" +
        stratumHost +
        " -u " +
        userArg +
        " -t " +
        threads +
        " -p c=KSH";
    }
  }

  function setMinerSoftware(swType) {
    currentSelectedMinerSoftware = swType;
    if (btnMinerCpuminer) btnMinerCpuminer.classList.toggle("active", swType === "cpuminer");
    if (btnMinerSrb) btnMinerSrb.classList.toggle("active", swType === "srb");
    if (btnMinerNative) btnMinerNative.classList.toggle("active", swType === "native");
    updateMiningCmd();
  }

  if (btnMinerCpuminer) {
    btnMinerCpuminer.addEventListener("click", function () {
      setMinerSoftware("cpuminer");
    });
  }
  if (btnMinerSrb) {
    btnMinerSrb.addEventListener("click", function () {
      setMinerSoftware("srb");
    });
  }
  if (btnMinerNative) {
    btnMinerNative.addEventListener("click", function () {
      setMinerSoftware("native");
    });
  }

  if (genAddrInput) genAddrInput.addEventListener("input", updateMiningCmd);
  if (genWorkerInput) genWorkerInput.addEventListener("input", updateMiningCmd);
  if (genThreadsInput) genThreadsInput.addEventListener("input", updateMiningCmd);

  var genCmdCopyBtn = document.getElementById("genCmdCopyBtn");
  if (genCmdCopyBtn && genCmdOutput) {
    genCmdCopyBtn.addEventListener("click", function () {
      copyText(genCmdOutput.textContent, "Mining command copied!");
      this.textContent = "COPIED ✓";
      var btn = this;
      setTimeout(function () {
        btn.textContent = "COPY";
      }, 1800);
    });
  }

  var stratumCopyMainBtn = document.getElementById("stratumCopyMainBtn");
  if (stratumCopyMainBtn) {
    stratumCopyMainBtn.addEventListener("click", function () {
      copyText("stratum+tcp://pool.korsh.org:3333", "Stratum URL copied!");
      this.textContent = "COPIED ✓";
      var btn = this;
      setTimeout(function () {
        btn.textContent = "Copy Stratum";
      }, 1800);
    });
  }

  /* ==========================================================================
     9. SEGMENTED EXPLORER TABS (Miners vs Blocks vs Payments)
     ========================================================================== */
  var tabBtnMiners = document.getElementById("tabBtnMiners");
  var tabBtnBlocks = document.getElementById("tabBtnBlocks");
  var tabBtnPayments = document.getElementById("tabBtnPayments");
  var paneMiners = document.getElementById("paneMiners");
  var paneBlocks = document.getElementById("paneBlocks");
  var panePayments = document.getElementById("panePayments");

  function switchExplorerTab(tab) {
    currentActiveTab = tab;
    if (tabBtnMiners) tabBtnMiners.classList.toggle("active", tab === "miners");
    if (tabBtnBlocks) tabBtnBlocks.classList.toggle("active", tab === "blocks");
    if (tabBtnPayments) tabBtnPayments.classList.toggle("active", tab === "payments");

    if (paneMiners) paneMiners.classList.toggle("active", tab === "miners");
    if (paneBlocks) paneBlocks.classList.toggle("active", tab === "blocks");
    if (panePayments) panePayments.classList.toggle("active", tab === "payments");

    if (filterMinersInput) {
      if (tab === "miners") filterMinersInput.placeholder = "Search miner address...";
      else if (tab === "blocks") filterMinersInput.placeholder = "Search block height, hash or miner...";
      else if (tab === "payments") filterMinersInput.placeholder = "Search payment address or tx hash...";
    }

    filterExplorer();
  }

  if (tabBtnMiners) {
    tabBtnMiners.addEventListener("click", function () {
      switchExplorerTab("miners");
    });
  }
  if (tabBtnBlocks) {
    tabBtnBlocks.addEventListener("click", function () {
      switchExplorerTab("blocks");
    });
  }
  if (tabBtnPayments) {
    tabBtnPayments.addEventListener("click", function () {
      switchExplorerTab("payments");
    });
  }

  /* ==========================================================================
     MOBILE NAVIGATION DROPDOWN CONTROLLER
     ========================================================================== */
  var mobileMenuBtn = document.getElementById("mobileMenuBtn");
  var mobileDropdownMenu = document.getElementById("mobileDropdownMenu");

  if (mobileMenuBtn && mobileDropdownMenu) {
    mobileMenuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isHidden = (mobileDropdownMenu.style.display === "none" || !mobileDropdownMenu.style.display);
      mobileDropdownMenu.style.display = isHidden ? "flex" : "none";
      mobileMenuBtn.classList.toggle("active", isHidden);
    });

    // Close on click outside
    document.addEventListener("click", function (e) {
      if (mobileDropdownMenu.style.display !== "none" && !mobileDropdownMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        mobileDropdownMenu.style.display = "none";
        mobileMenuBtn.classList.remove("active");
      }
    });

    // Close on link click
    mobileDropdownMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobileDropdownMenu.style.display = "none";
        mobileMenuBtn.classList.remove("active");
      });
    });

    // Close on ESC key
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobileDropdownMenu.style.display !== "none") {
        mobileDropdownMenu.style.display = "none";
        mobileMenuBtn.classList.remove("active");
      }
    });
  }

  /* ==========================================================================
     10. MAIN PERIODIC POLLING TICK
     ========================================================================== */
  function tick() {
    // 1. Fetch /api/pools/korsh (Pool configuration & real-time networkStats)
    fetchJSON(API_BASE)
      .then(function (cfg) {
        cachedPoolConfig = cfg;
        if (livePill) livePill.classList.remove("err");
        if (liveTxt) liveTxt.textContent = "LIVE";
        updateHUD(null, cachedPoolConfig);
      })
      .catch(function () {
        if (livePill) livePill.classList.add("err");
        if (liveTxt) liveTxt.textContent = "OFFLINE";
      });

    // 2. Fetch /api/pools/korsh/performance (Performance history & chart)
    fetchJSON(API_STATS)
      .then(function (perf) {
        updateHUD(perf, cachedPoolConfig);
        if (perf && perf.stats) renderChart(perf.stats);
      })
      .catch(function () {});

    // 3. Fetch /api/pools/korsh/miners (Connected miners list)
    fetchJSON(API_MINERS)
      .then(function (mList) {
        renderMiners(mList);
        updateHUD(null, cachedPoolConfig);
      })
      .catch(function () {});

    // 4. Fetch /api/pools/korsh/blocks (Solved blocks)
    fetchJSON(API_BLOCKS + "?pageSize=100")
      .then(renderBlocks)
      .catch(function () {});

    // 5. Fetch /api/pools/korsh/payments (Pool Payouts)
    fetchJSON(API_PAYMENTS)
      .then(renderPayments)
      .catch(function () {});
  }

  // Initialize Particle Stage
  initParticleCanvas();

  // Initialize Default Mining Command
  updateMiningCmd();

  // Initial execution & 5s interval loop
  tick();
  setInterval(tick, 5000);
})();
