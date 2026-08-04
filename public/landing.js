(function () {
  'use strict';
  function catSlug(cat) {
    return cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  var dataEl = document.getElementById('state-data');
  if (!dataEl) return;
  var PAYLOAD = JSON.parse(dataEl.textContent);
  var STATE_COUNTS = PAYLOAD.stateCounts;
  var STATE_LABELS = PAYLOAD.stateLabels;
  var ALL_UNIS = PAYLOAD.unis;
  var unisById = {};
  ALL_UNIS.forEach(function (uni) {
    unisById[uni.id] = uni;
  });

  function stateLabel(name) {
    return STATE_LABELS[name] || name;
  }

  var svg = document.getElementById('map-svg');
  var tooltip = document.getElementById('map-tooltip');
  var ttSwatch = tooltip.querySelector('.tt-swatch');
  var ttName = tooltip.querySelector('.tt-name');
  var ttCounts = tooltip.querySelector('.tt-counts');
  var endpointEl = document.getElementById('endpoint');
  var statusEl = document.getElementById('tester-status');
  var responseEl = document.getElementById('response');
  var responsePanel = document.getElementById('response-panel');
  var responsePrompt = document.getElementById('response-prompt');
  var runBtn = document.getElementById('run-btn');
  var zoomHint = document.getElementById('zoom-hint');
  var listEl = document.getElementById('uni-list');
  var emptyEl = document.getElementById('uni-empty');
  var countEl = document.getElementById('uni-count');
  var searchEl = document.getElementById('uni-search');
  var stateSelect = document.getElementById('state-select');
  var filterBtns = Array.prototype.slice.call(document.querySelectorAll('.uni-filter button'));
  var statePill = document.getElementById('state-filter-pill');
  var statePillName = document.getElementById('state-filter-name');
  var statePillClear = document.getElementById('state-filter-clear');
  var pagePrev = document.getElementById('page-prev');
  var pageNext = document.getElementById('page-next');
  var pageIndicator = document.getElementById('page-indicator');
  var paginationEl = document.getElementById('pagination');
  var resultsCard = document.getElementById('results-card');
  var detailDrawer = document.getElementById('detail-drawer');
  var detailTitle = document.getElementById('detail-title');
  var detailMeta = document.getElementById('detail-meta');
  var detailCampuses = document.getElementById('detail-campuses');
  var detailEmpty = document.getElementById('detail-empty');

  var statePaths = Array.prototype.slice.call(document.querySelectorAll('.state'));
  var campusDots = Array.prototype.slice.call(document.querySelectorAll('.campus-dot'));

  /* ---------------- camera: zoom & pan ---------------- */
  var vb = svg.getAttribute('viewBox').split(' ').map(Number);
  var BASE = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  var MAX_SCALE = 10;
  var cam = { x: BASE.x, y: BASE.y, w: BASE.w, h: BASE.h };
  var animFrame = null;

  function clampCam(c) {
    c.w = Math.min(BASE.w, Math.max(BASE.w / MAX_SCALE, c.w));
    c.h = c.w * (BASE.h / BASE.w);
    c.x = Math.min(BASE.x + BASE.w - c.w, Math.max(BASE.x, c.x));
    c.y = Math.min(BASE.y + BASE.h - c.h, Math.max(BASE.y, c.y));
    return c;
  }

  function applyCam() {
    svg.setAttribute('viewBox', cam.x + ' ' + cam.y + ' ' + cam.w + ' ' + cam.h);
    var scale = BASE.w / cam.w;
    var r = 3.5 / Math.pow(scale, 0.6);
    if (r < 0.7) r = 0.7;
    campusDots.forEach(function (dot) {
      dot.setAttribute('r', r);
    });
    svg.classList.toggle('zoomed', scale > 1.02);
  }

  function animateTo(target, duration) {
    if (animFrame) cancelAnimationFrame(animFrame);
    var from = { x: cam.x, y: cam.y, w: cam.w, h: cam.h };
    var start = performance.now();
    function step(now) {
      var t = Math.min(1, (now - start) / duration);
      var e = 1 - Math.pow(1 - t, 3);
      cam.x = from.x + (target.x - from.x) * e;
      cam.y = from.y + (target.y - from.y) * e;
      cam.w = from.w + (target.w - from.w) * e;
      cam.h = from.h + (target.h - from.h) * e;
      applyCam();
      if (t < 1) animFrame = requestAnimationFrame(step);
    }
    animFrame = requestAnimationFrame(step);
  }

  function zoomAt(clientX, clientY, factor) {
    var rect = svg.getBoundingClientRect();
    var fx = (clientX - rect.left) / rect.width;
    var fy = (clientY - rect.top) / rect.height;
    var px = cam.x + fx * cam.w;
    var py = cam.y + fy * cam.h;
    var next = { w: cam.w / factor, h: 0, x: 0, y: 0 };
    next.w = Math.min(BASE.w, Math.max(BASE.w / MAX_SCALE, next.w));
    next.h = next.w * (BASE.h / BASE.w);
    next.x = px - fx * next.w;
    next.y = py - fy * next.h;
    cam = clampCam(next);
    applyCam();
  }

  function zoomToBBox(b) {
    var aspect = BASE.w / BASE.h;
    var w = Math.max(b.width * 1.5, b.height * 1.5 * aspect, 70);
    var target = clampCam({
      w: w,
      h: w / aspect,
      x: b.x + b.width / 2 - w / 2,
      y: b.y + b.height / 2 - (w / aspect) / 2,
    });
    animateTo(target, 320);
  }

  function resetView() {
    animateTo({ x: BASE.x, y: BASE.y, w: BASE.w, h: BASE.h }, 320);
  }

  document.getElementById('zoom-in').addEventListener('click', function () {
    var rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.6);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    var rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.6);
  });
  document.getElementById('zoom-reset').addEventListener('click', function () {
    clearUniPin();
    clearPin();
    resetView();
  });

  var hintTimer = null;
  svg.addEventListener(
    'wheel',
    function (event) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, Math.pow(1.0015, -event.deltaY));
      } else {
        zoomHint.classList.add('show');
        if (hintTimer) clearTimeout(hintTimer);
        hintTimer = setTimeout(function () {
          zoomHint.classList.remove('show');
        }, 1200);
      }
    },
    { passive: false }
  );

  /* drag to pan + two-finger pinch */
  var pointers = {};
  var didDrag = false;
  var downPos = null;

  function pointerList() {
    return Object.keys(pointers).map(function (id) {
      return pointers[id];
    });
  }

  function pointerCountNow() {
    return Object.keys(pointers).length;
  }

  svg.addEventListener('pointerdown', function (event) {
    /* A mouse only ever has one pointerId. If it's already tracked, the
       matching pointerup/pointercancel for the previous press was lost
       (can happen with fast clicks, focus changes, or automation) --
       without this reset, pointerCountNow() overshoots and every future
       click gets misrouted into the two-pointer pinch branch below, which
       unconditionally sets didDrag = true and silently swallows clicks. */
    if (event.pointerType === 'mouse') {
      pointers = {};
    }
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (pointerCountNow() === 1) {
      downPos = { x: event.clientX, y: event.clientY };
      didDrag = false;
    }
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', function (event) {
    var p = pointers[event.pointerId];
    if (!p) return;
    if (pointerCountNow() === 2) {
      var list = pointerList();
      var other = list[0] === p ? list[1] : list[0];
      var prevDist = Math.hypot(p.x - other.x, p.y - other.y);
      var newDist = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (prevDist > 0 && newDist > 0) {
        zoomAt((event.clientX + other.x) / 2, (event.clientY + other.y) / 2, newDist / prevDist);
      }
      didDrag = true;
    } else if (pointerCountNow() === 1) {
      var dx = event.clientX - p.x;
      var dy = event.clientY - p.y;
      if (!didDrag && downPos && Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) > 12) {
        didDrag = true;
        svg.classList.add('dragging');
      }
      if (didDrag) {
        var rect = svg.getBoundingClientRect();
        cam.x -= dx * (cam.w / rect.width);
        cam.y -= dy * (cam.h / rect.height);
        cam = clampCam(cam);
        applyCam();
      }
    }
    p.x = event.clientX;
    p.y = event.clientY;
  });

  function endPointer(event) {
    delete pointers[event.pointerId];
    if (pointerCountNow() <= 0) {
      svg.classList.remove('dragging');
    }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  /* swallow the click that follows a drag so it doesn't pin a state */
  svg.addEventListener(
    'click',
    function (event) {
      if (didDrag) {
        event.stopPropagation();
        event.preventDefault();
        didDrag = false;
      }
    },
    true
  );

  /* ---------------- API tester ---------------- */
  var currentUrl = null;
  var pinnedUni = null;
  var runTimer = null;
  var cache = {};

  var JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  function renderJson(text) {
    responseEl.textContent = '';
    var frag = document.createDocumentFragment();
    var last = 0;
    var match;
    JSON_TOKEN.lastIndex = 0;
    while ((match = JSON_TOKEN.exec(text)) !== null) {
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      var span = document.createElement('span');
      if (match[1] !== undefined) {
        span.className = match[2] !== undefined ? 'j-key' : 'j-str';
        span.textContent = match[1];
        frag.appendChild(span);
        if (match[2] !== undefined) {
          frag.appendChild(document.createTextNode(match[2]));
        }
      } else if (match[0] === 'true' || match[0] === 'false' || match[0] === 'null') {
        span.className = 'j-lit';
        span.textContent = match[0];
        frag.appendChild(span);
      } else {
        span.className = 'j-num';
        span.textContent = match[0];
        frag.appendChild(span);
      }
      last = JSON_TOKEN.lastIndex;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    responseEl.appendChild(frag);
  }

  function hideResponsePanel() {
    responsePanel.classList.remove('open');
    responsePrompt.hidden = false;
  }

  function revealResponsePanel() {
    responsePrompt.hidden = true;
    if (!responsePanel.classList.contains('open')) {
      requestAnimationFrame(function () {
        responsePanel.classList.add('open');
      });
    }
  }

  /* Sets the endpoint the tester is pointed at without firing the request --
     the response panel stays collapsed until the user presses Run, so Run
     always has something to actually do. */
  function setEndpoint(url) {
    currentUrl = url;
    endpointEl.textContent = 'GET ' + url;
    updateSnippet();
    hideResponsePanel();
  }

  function showResult(rec) {
    if (rec.url !== currentUrl) return;
    responseEl.classList.remove('loading');
    statusEl.textContent = '';
    var strong = document.createElement('span');
    strong.className = rec.ok ? 'st-good' : 'st-bad';
    strong.textContent = rec.status + (rec.ok ? ' OK' : '');
    statusEl.appendChild(strong);
    statusEl.appendChild(document.createTextNode(' \u00b7 ' + rec.ms + ' ms \u00b7 GET ' + rec.url));
    if (rec.isJson) {
      renderJson(rec.body);
    } else {
      responseEl.textContent = rec.body;
    }
  }

  function run(url) {
    currentUrl = url;
    endpointEl.textContent = 'GET ' + url;
    updateSnippet();
    revealResponsePanel();
    if (cache[url]) {
      showResult(cache[url]);
      return;
    }
    responseEl.classList.add('loading');
    statusEl.textContent = 'Loading\u2026';
    var started = performance.now();
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, ok: res.ok, text: text };
        });
      })
      .then(function (r) {
        var body;
        var isJson = true;
        try {
          body = JSON.stringify(JSON.parse(r.text), null, 2);
        } catch (e) {
          body = r.text;
          isJson = false;
        }
        var rec = {
          url: url,
          status: r.status,
          ok: r.ok,
          ms: Math.round(performance.now() - started),
          body: body,
          isJson: isJson,
        };
        cache[url] = rec;
        showResult(rec);
      })
      .catch(function (err) {
        if (url !== currentUrl) return;
        responseEl.classList.remove('loading');
        statusEl.textContent = 'Request failed: ' + err.message;
      });
  }

  /* ---------------- search, filter & pagination ---------------- */
  var PAGE_SIZE = 10;
  var filter = { query: '', cat: 'ALL', state: null, page: 1 };

  function matchesFilter(uni) {
    var okCat = filter.cat === 'ALL' || uni.cat === filter.cat;
    var okState = !filter.state || uni.states.indexOf(filter.state) !== -1;
    var okText = !filter.query || (uni.short + ' ' + uni.name).toLowerCase().indexOf(filter.query) !== -1;
    return okCat && okState && okText;
  }

  function getFiltered() {
    return ALL_UNIS.filter(matchesFilter);
  }

  function markActiveRow(id) {
    Array.prototype.slice.call(listEl.querySelectorAll('.uni-item')).forEach(function (el) {
      el.classList.toggle('active', id !== null && el.getAttribute('data-id') === id);
    });
  }

  function buildRow(uni) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'uni-item';
    row.setAttribute('data-id', uni.id);
    row.title = uni.name;

    var logo = document.createElement('span');
    logo.className = 'uni-logo';
    if (uni.logo) {
      var img = document.createElement('img');
      img.src = uni.logo;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        img.remove();
      });
      logo.appendChild(img);
    }
    var mono = document.createElement('span');
    mono.className = 'uni-monogram';
    mono.setAttribute('aria-hidden', 'true');
    var monoSource = uni.short && uni.short !== uni.id ? uni.short : uni.name;
    mono.textContent = monoSource.slice(0, 6);
    logo.appendChild(mono);
    row.appendChild(logo);

    var info = document.createElement('span');
    info.className = 'uni-item-info';

    var nameLine = document.createElement('span');
    nameLine.className = 'uni-item-short';
    var nameText = document.createElement('span');
    nameText.className = 'uni-item-title';
    /* short_name defaults to the id slug for institutions we couldn't find a
       real abbreviation for -- showing that raw slug as the headline is the
       exact mess from the old chip-wall design, so prefer the full name
       whenever short looks auto-generated. */
    nameText.textContent = uni.short && uni.short !== uni.id ? uni.short + ' \u2014 ' + uni.name : uni.name;
    nameLine.appendChild(nameText);
    var catBadge = document.createElement('span');
    catBadge.className = 'uni-cat ' + catSlug(uni.cat);
    catBadge.textContent = uni.cat;
    nameLine.appendChild(catBadge);
    info.appendChild(nameLine);

    var metaLine = document.createElement('span');
    metaLine.className = 'uni-item-name';
    var metaParts = [uni.c.length + (uni.c.length === 1 ? ' campus' : ' campuses')];
    if (uni.states.length) metaParts.push(uni.states.map(stateLabel).join(', '));
    metaLine.textContent = metaParts.join(' \u00b7 ');
    info.appendChild(metaLine);

    row.appendChild(info);
    row.addEventListener('click', function () {
      selectUniversity(uni.id);
    });
    return row;
  }

  function scrollToResults() {
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderResults() {
    var filtered = getFiltered();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (filter.page > totalPages) filter.page = totalPages;
    if (filter.page < 1) filter.page = 1;
    var start = (filter.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    listEl.textContent = '';
    pageItems.forEach(function (uni) {
      listEl.appendChild(buildRow(uni));
    });
    if (pinnedUni) {
      markActiveRow(pinnedUni);
      var pinnedRowEl = listEl.querySelector('.uni-item[data-id="' + pinnedUni + '"]');
      if (pinnedRowEl) {
        openDrawerAt(pinnedRowEl);
      } else {
        detachDrawer();
      }
    }

    emptyEl.hidden = filtered.length !== 0;
    countEl.textContent = filtered.length + (filtered.length === 1 ? ' university found' : ' universities found');
    pageIndicator.textContent = 'Page ' + filter.page + ' of ' + totalPages;
    pagePrev.disabled = filter.page <= 1;
    pageNext.disabled = filter.page >= totalPages;
    paginationEl.hidden = totalPages <= 1;
  }

  searchEl.addEventListener('input', function () {
    filter.query = searchEl.value.trim().toLowerCase();
    filter.page = 1;
    renderResults();
  });
  searchEl.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var filtered = getFiltered();
    if (filtered.length) selectUniversity(filtered[0].id);
  });

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filter.cat = btn.getAttribute('data-cat');
      filter.page = 1;
      filterBtns.forEach(function (other) {
        other.classList.toggle('active', other === btn);
      });
      renderResults();
    });
  });

  pagePrev.addEventListener('click', function () {
    if (filter.page > 1) {
      filter.page--;
      renderResults();
      scrollToResults();
    }
  });
  pageNext.addEventListener('click', function () {
    filter.page++;
    renderResults();
    scrollToResults();
  });

  function setStateFilter(name) {
    filter.state = name;
    filter.page = 1;
    stateSelect.value = name || '';
    if (name) {
      statePillName.textContent = stateLabel(name);
      statePill.hidden = false;
    } else {
      statePill.hidden = true;
    }
    renderResults();
  }

  stateSelect.addEventListener('change', function () {
    var name = stateSelect.value || null;
    var path = name ? document.querySelector('.state[data-state="' + name + '"]') : null;
    if (path) {
      /* reuse the map's own click handler so the pin, zoom, and dot
         highlighting all stay in sync with a dropdown-driven selection */
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      clearUniPin();
      clearPin();
      setStateFilter(null);
    }
  });

  statePillClear.addEventListener('click', function () {
    setStateFilter(null);
    clearPin();
  });

  /* ---------------- detail card ---------------- */
  function renderDetail(uni) {
    detailEmpty.hidden = true;
    detailTitle.textContent = uni.name;
    var metaParts = [uni.cat, uni.c.length + (uni.c.length === 1 ? ' campus' : ' campuses')];
    if (uni.states.length) metaParts.push(uni.states.map(stateLabel).join(', '));
    detailMeta.textContent = metaParts.join(' \u00b7 ');
    detailCampuses.textContent = '';
    uni.c.forEach(function (campus) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = campus.name;
      var citySpan = document.createElement('span');
      citySpan.className = 'city';
      citySpan.textContent = campus.city + ', ' + stateLabel(campus.state);
      btn.appendChild(nameSpan);
      btn.appendChild(citySpan);
      btn.addEventListener('click', function () {
        setEndpoint('/api/campus/' + campus.id);
      });
      li.appendChild(btn);
      detailCampuses.appendChild(li);
    });
  }

  function clearDetail() {
    detailEmpty.hidden = false;
    detailTitle.textContent = '';
    detailMeta.textContent = '';
    detailCampuses.textContent = '';
  }

  /* ---------------- detail drawer (accordion under the selected row) ---------------- */
  /* The drawer is a single reused element that gets moved to sit right after
     the clicked row via insertAdjacentElement, then animated open with the
     grid-template-rows 0fr -> 1fr trick (animates to intrinsic height without
     JS measuring). drawerGen guards against a stale close/detach timer firing
     after the drawer has since been reopened or moved elsewhere. */
  var drawerGen = 0;

  function openDrawerAt(rowEl) {
    if (!rowEl) return;
    drawerGen++;
    rowEl.insertAdjacentElement('afterend', detailDrawer);
    if (!detailDrawer.classList.contains('open')) {
      requestAnimationFrame(function () {
        detailDrawer.classList.add('open');
      });
    }
  }

  function detachDrawer() {
    drawerGen++;
    detailDrawer.classList.remove('open');
    if (detailDrawer.parentNode) detailDrawer.parentNode.removeChild(detailDrawer);
  }

  function closeDrawer() {
    if (!detailDrawer.classList.contains('open')) {
      detachDrawer();
      return;
    }
    drawerGen++;
    var gen = drawerGen;
    detailDrawer.classList.remove('open');
    function finish() {
      if (gen !== drawerGen) return;
      if (detailDrawer.parentNode) detailDrawer.parentNode.removeChild(detailDrawer);
    }
    detailDrawer.addEventListener('transitionend', function onEnd(event) {
      if (event.target !== detailDrawer || event.propertyName !== 'grid-template-rows') return;
      detailDrawer.removeEventListener('transitionend', onEnd);
      finish();
    });
    setTimeout(finish, 350);
  }

  /* ---------------- hover, tooltip, pin ---------------- */
  /* Dots are hidden by default (see .campus-dot CSS) and only revealed via
     .lit -- with 500+ campuses, showing them all at once turns the Klang
     Valley into an unreadable smudge. The state choropleth coloring already
     communicates density at a glance; dots are an on-demand detail layer
     shown only for a hovered/pinned state or a selected university. */
  function litDots(name) {
    campusDots.forEach(function (dot) {
      dot.classList.toggle('lit', name !== null && dot.getAttribute('data-state') === name);
    });
  }

  function moveTooltip(event) {
    var pad = 14;
    var rect = tooltip.getBoundingClientRect();
    var x = event.clientX + pad;
    var y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function fillTooltip(name, path) {
    ttName.textContent = stateLabel(name);
    var counts = STATE_COUNTS[name];
    ttCounts.textContent =
      counts.u + (counts.u === 1 ? ' university' : ' universities') +
      ' \u00b7 ' + counts.c + (counts.c === 1 ? ' campus' : ' campuses');
    var fill = getComputedStyle(path).fill;
    ttSwatch.style.background = fill.indexOf('url') === 0 ? 'var(--map-none)' : fill;
  }

  var pinnedState = null;
  function clearPin() {
    if (!pinnedState) return;
    var prev = document.querySelector('.state.pinned');
    if (prev) prev.classList.remove('pinned');
    svg.classList.remove('has-pin');
    pinnedState = null;
    litDots(null);
  }

  statePaths.forEach(function (path) {
    var name = path.getAttribute('data-state');

    path.addEventListener('pointerenter', function (event) {
      fillTooltip(name, path);
      tooltip.style.display = 'block';
      moveTooltip(event);
      if (!pinnedState) litDots(name);
    });
    path.addEventListener('pointermove', moveTooltip);
    path.addEventListener('pointerleave', function () {
      tooltip.style.display = 'none';
      if (!pinnedState) litDots(null);
    });
    path.addEventListener('focus', function () {
      fillTooltip(name, path);
      if (!pinnedState) litDots(name);
    });
    path.addEventListener('blur', function () {
      if (!pinnedState) litDots(null);
    });
    path.addEventListener('click', function () {
      tooltip.style.display = 'none';
      if (pinnedState === name) {
        clearPin();
        setStateFilter(null);
        resetView();
        return;
      }
      clearUniPin();
      clearPin();
      pinnedState = name;
      path.classList.add('pinned');
      svg.classList.add('has-pin');
      litDots(name);
      setStateFilter(name);
      zoomToBBox(path.getBBox());
      scrollToResults();
    });
    path.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        path.click();
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      clearUniPin();
      clearPin();
      setStateFilter(null);
      resetView();
    }
  });

  /* legend keys highlight their bin on the map */
  Array.prototype.slice.call(document.querySelectorAll('.legend button.key')).forEach(function (btn) {
    var bin = btn.getAttribute('data-bin');
    function focusBin() {
      statePaths.forEach(function (path) {
        path.classList.toggle('dim', path.getAttribute('data-bin') !== bin);
      });
    }
    function unfocusBin() {
      statePaths.forEach(function (path) {
        path.classList.remove('dim');
      });
    }
    btn.addEventListener('pointerenter', focusBin);
    btn.addEventListener('pointerleave', unfocusBin);
    btn.addEventListener('focus', focusBin);
    btn.addEventListener('blur', unfocusBin);
  });

  /* ---------------- university selection ---------------- */
  function highlightUni(id) {
    campusDots.forEach(function (dot) {
      dot.classList.toggle('lit', dot.getAttribute('data-university') === id);
    });
    var uni = unisById[id];
    var states = uni ? uni.states : [];
    statePaths.forEach(function (path) {
      path.classList.toggle('dim', states.indexOf(path.getAttribute('data-state')) === -1);
    });
  }

  function clearUniPin() {
    if (!pinnedUni) return;
    pinnedUni = null;
    svg.classList.remove('uni-pin');
    markActiveRow(null);
    statePaths.forEach(function (path) {
      path.classList.remove('dim');
    });
    litDots(pinnedState);
    clearDetail();
    closeDrawer();
  }

  function zoomToUni(id) {
    var xs = [];
    var ys = [];
    campusDots.forEach(function (dot) {
      if (dot.getAttribute('data-university') === id) {
        xs.push(Number(dot.getAttribute('cx')));
        ys.push(Number(dot.getAttribute('cy')));
      }
    });
    if (xs.length === 0) {
      resetView();
      return;
    }
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    zoomToBBox({ x: minX - 12, y: minY - 12, width: maxX - minX + 24, height: maxY - minY + 24 });
  }

  function selectUniversity(id) {
    if (pinnedUni === id) {
      clearUniPin();
      resetView();
      return;
    }
    clearPin();
    pinnedUni = id;
    svg.classList.add('uni-pin');
    highlightUni(id);
    zoomToUni(id);
    renderDetail(unisById[id]);

    /* jump to whichever page the row lives on so the drawer has a row to
       drop down from, even when selection came from the search Enter-key
       shortcut rather than a visible click */
    var filtered = getFiltered();
    for (var i = 0; i < filtered.length; i++) {
      if (filtered[i].id === id) {
        filter.page = Math.floor(i / PAGE_SIZE) + 1;
        break;
      }
    }
    renderResults();

    if (runTimer) clearTimeout(runTimer);
    setEndpoint('/api/university/' + id);
  }

  runBtn.addEventListener('click', function () {
    run(currentUrl);
  });

  Array.prototype.slice.call(document.querySelectorAll('.quick-links button')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      setEndpoint(btn.getAttribute('data-url'));
    });
  });

  /* ---------------- copy as URL / cURL / JS / Python ---------------- */
  var snippetEl = document.getElementById('snippet');
  var copyBtn = document.getElementById('copy-btn');
  var snippetTabs = Array.prototype.slice.call(
    document.querySelectorAll('.snippet-tabs button[data-lang]')
  );
  var activeLang = 'url';

  function snippetFor(lang, url) {
    var full = window.location.origin + url;
    if (lang === 'curl') {
      return 'curl -s "' + full + '"';
    }
    if (lang === 'js') {
      return (
        "const res = await fetch('" + full + "');\n" +
        'const data = await res.json();\n' +
        'console.log(data);'
      );
    }
    if (lang === 'py') {
      return (
        'import requests\n\n' +
        'data = requests.get("' + full + '").json()\n' +
        'print(data)'
      );
    }
    return full;
  }

  function updateSnippet() {
    snippetEl.textContent = snippetFor(activeLang, currentUrl);
  }

  snippetTabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeLang = btn.getAttribute('data-lang');
      snippetTabs.forEach(function (other) {
        other.classList.toggle('active', other === btn);
      });
      updateSnippet();
    });
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* nothing else to try */
    }
    document.body.removeChild(ta);
  }

  var copyTimer = null;
  copyBtn.addEventListener('click', function () {
    var text = snippetEl.textContent;
    function done() {
      copyBtn.classList.add('copied');
      copyBtn.textContent = 'Copied!';
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(function () {
        copyBtn.classList.remove('copied');
        copyBtn.textContent = 'Copy';
      }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  });

  /* ---------------- stat counters ---------------- */
  function animateCounters() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
    if (!els.length) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.forEach(function (el, i) {
      var target = Number(el.getAttribute('data-count'));
      if (!isFinite(target)) return;
      if (reduceMotion) {
        el.textContent = target.toLocaleString();
        return;
      }
      var duration = 900;
      var delay = Math.min(i * 60, 400);
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start - delay) / duration);
        if (t < 0) {
          requestAnimationFrame(step);
          return;
        }
        var e = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * e).toLocaleString();
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------------- init ---------------- */
  clearDetail();
  renderResults();
  setEndpoint('/api/university');
  animateCounters();
})();

