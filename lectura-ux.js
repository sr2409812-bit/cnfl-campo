(function () {
  const baseLoadReadingState = loadReadingState;
  const baseRestoreReadingRoute = restoreReadingRoute;

  function normalizeReadingStatuses() {
    readingOrders = readingOrders.map((o, index) => {
      const wasDeferredLegacy = o.status === 'unread';
      return {
        ...o,
        status: o.status === 'read' ? 'read' : 'pending',
        deferCount: Number(o.deferCount || (wasDeferredLegacy ? 1 : 0)),
        sequence: Number(o.sequence || index + 1),
        originalSequence: Number(o.originalSequence || o.sequence || index + 1)
      };
    });
  }

  loadReadingState = function () {
    baseLoadReadingState();
    normalizeReadingStatuses();
  };

  restoreReadingRoute = function (routeId) {
    baseRestoreReadingRoute(routeId);
    normalizeReadingStatuses();
    saveReadingState();
    renderAll();
  };

  stats = function (orders = readingOrders) {
    const total = orders.length;
    const read = orders.filter(o => o.status === 'read').length;
    const pending = total - read;
    return { total, read, pending, done: read };
  };

  renderCurrent = function () {
    const container = document.getElementById('currentReadingCard');
    const nextContainer = document.getElementById('nextReadingCard');
    const pending = readingOrders.filter(o => o.status !== 'read');
    const s = stats();

    if (!pending.length) {
      container.innerHTML = `
        <div class="done-card">
          <i class="fa-solid fa-circle-check"></i>
          <h2>Jornada completada</h2>
          <p>${s.read} medidores visitados</p>
        </div>`;
      nextContainer.innerHTML = '';
      return;
    }

    const current = pending[0];
    const gps = gpsLabel(current);
    const gpsOk = current.gpsStatus !== 'conflict' &&
      Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lon));
    const waze = gpsOk ? `https://www.waze.com/ul?ll=${current.lat},${current.lon}&navigate=yes` : '#';
    const maps = gpsOk ? `https://www.google.com/maps/search/?api=1&query=${current.lat},${current.lon}` : '#';

    container.innerHTML = `
      <article class="reading-card">
        <div class="card-kicker">
          <span>MEDIDOR ACTUAL</span>
          <span>${s.read + 1} / ${s.total}</span>
        </div>
        <div class="reading-main">
          <div class="reading-ident">
            <div>
              <span>MEDIDOR</span>
              <strong>${escapeHtml(current.medidor)}</strong>
            </div>
            <div class="loc">
              <span>LOCALIZACIÓN</span>
              <strong>${escapeHtml(current.localizacion)}</strong>
            </div>
          </div>

          <div class="gps-line">
            <span class="gps-status ${gps.cls}"><i class="fa-solid fa-location-dot"></i> ${gps.text}</span>
            <span class="circuit">${escapeHtml(current.circuito || '')}</span>
          </div>

          <div class="nav-grid">
            <a class="nav-link ${gpsOk ? '' : 'disabled'}" href="${waze}" target="_blank" rel="noopener">
              <i class="fa-brands fa-waze"></i> WAZE
            </a>
            <a class="nav-link ${gpsOk ? '' : 'disabled'}" href="${maps}" target="_blank" rel="noopener">
              <i class="fa-solid fa-map-location-dot"></i> MAPS
            </a>
          </div>

          <div class="primary-action">
            <button class="btn-primary" onclick="markCurrentReading('read')">
              <i class="fa-solid fa-check"></i> MARCAR VISITADO
            </button>
          </div>
          <div class="secondary-actions">
            <button class="btn-secondary" onclick="deferCurrentReading()">
              <i class="fa-solid fa-forward-step"></i> DEJAR PENDIENTE
            </button>
          </div>
        </div>
      </article>`;

    const next = pending[1];
    nextContainer.innerHTML = next ? `
      <div class="next-card">
        <div class="eyebrow">SIGUIENTE EN LA RUTA</div>
        <div class="next-row">
          <div><span>MEDIDOR</span><br><strong>${escapeHtml(next.medidor)}</strong></div>
          <div style="text-align:right"><span>LOCALIZACIÓN</span><br><strong>${escapeHtml(next.localizacion)}</strong></div>
        </div>
      </div>` : '';
  };

  markCurrentReading = function (status) {
    if (status !== 'read') {
      window.deferCurrentReading();
      return;
    }

    const current = readingOrders.find(o => o.status !== 'read');
    if (!current) return;

    current.status = 'read';
    current.readAt = new Date().toISOString();
    archiveReadingEvent(current);
    saveReadingState();
    renderAll();
    showReadingToast(`Medidor ${current.medidor} visitado · siguiente`);
  };

  window.deferCurrentReading = function () {
    const pendingIndexes = readingOrders
      .map((o, index) => o.status !== 'read' ? index : -1)
      .filter(index => index >= 0);

    if (!pendingIndexes.length) return;
    if (pendingIndexes.length === 1) {
      showReadingToast('Es el único medidor pendiente.');
      return;
    }

    const currentIndex = pendingIndexes[0];
    const current = readingOrders[currentIndex];
    current.status = 'pending';
    current.deferCount = Number(current.deferCount || 0) + 1;
    current.deferredAt = new Date().toISOString();

    readingOrders.splice(currentIndex, 1);
    readingOrders.push(current);
    readingRouteMeta = null;
    saveReadingState();
    renderAll();
    showReadingToast(`Medidor ${current.medidor} queda pendiente · seguimos`);
  };

  window.setNextReading = function (localizacion) {
    const targetIndex = readingOrders.findIndex(o =>
      o.localizacion === String(localizacion) && o.status !== 'read'
    );
    if (targetIndex < 0) return;

    const firstPendingIndex = readingOrders.findIndex(o => o.status !== 'read');
    if (firstPendingIndex < 0) return;

    const target = readingOrders[targetIndex];
    target.status = 'pending';

    if (targetIndex !== firstPendingIndex) {
      readingOrders.splice(targetIndex, 1);
      readingOrders.splice(firstPendingIndex, 0, target);
      readingRouteMeta = null;
      saveReadingState();
      renderAll();
    }

    switchReadingTab('route', document.getElementById('tabRoute'));
    showReadingToast(`Medidor ${target.medidor} será el siguiente`);
  };

  renderList = function () {
    const q = readingSearch.trim().toLowerCase();
    const rows = readingOrders.filter(o =>
      !q || String(o.medidor).includes(q) || String(o.localizacion).includes(q)
    );

    document.getElementById('readingList').innerHTML = rows.map(o => {
      const visited = o.status === 'read';
      const deferred = !visited && Number(o.deferCount || 0) > 0;
      const label = visited ? 'VISITADO' : (deferred ? 'PENDIENTE · POSPUESTO' : 'PENDIENTE');
      const click = visited ? '' : `onclick="setNextReading('${o.localizacion}')"`;
      const hint = visited ? '' : '<span class="list-next-hint">HACER SIGUIENTE</span>';

      return `
        <div class="reading-list-item ${visited ? 'read' : 'pending selectable'}" ${click}>
          <div class="list-id">
            <div><span>MEDIDOR</span><strong>${escapeHtml(o.medidor)}</strong></div>
            <div><span>LOCALIZACIÓN</span><strong>${escapeHtml(o.localizacion)}</strong></div>
          </div>
          <div class="list-right">
            <div class="list-status ${visited ? 'read' : 'pending'}">${label}</div>
            ${hint}
          </div>
        </div>`;
    }).join('');
  };

  renderSummary = function () {
    const s = stats();
    const totalEl = document.getElementById('sumTotal');
    if (totalEl) totalEl.textContent = s.total;
    document.getElementById('sumRead').textContent = s.read;
    document.getElementById('sumPending').textContent = s.pending;

    const cache = loadJson(GEO_KEY, {});
    const count = Object.values(cache).filter(g =>
      g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lon)) && g.status !== 'conflict'
    ).length;
    document.getElementById('gpsMemoryCount').textContent = count;
  };

  copyReadingSummary = function () {
    const s = stats();
    const lines = [
      'CNFL CAMPO · LECTURA',
      routeDisplayName(),
      readingRouteInfo.subtitle || '',
      `Total: ${s.total}`,
      `Visitados: ${s.read}`,
      `Pendientes: ${s.pending}`,
      '',
      'PENDIENTES:'
    ];

    const pending = readingOrders.filter(o => o.status !== 'read');
    if (!pending.length) lines.push('Ninguno');
    else pending.forEach(o => {
      const suffix = Number(o.deferCount || 0) > 0 ? ' · pospuesto' : '';
      lines.push(`${o.localizacion} · Medidor ${o.medidor}${suffix}`);
    });

    const text = lines.join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => showReadingToast('Resumen copiado.'));
    } else {
      prompt('Copia el resumen:', text);
    }
  };

  resetReadingDay = function () {
    if (!confirm('¿Reiniciar esta jornada de lectura? La memoria GPS NO se borra.')) return;

    readingOrders = readingOrders
      .slice()
      .sort((a,b) => Number(a.originalSequence || 0) - Number(b.originalSequence || 0))
      .map((o,index) => ({
        ...o,
        status:'pending',
        readAt:'',
        deferredAt:'',
        deferCount:0,
        sequence:index + 1
      }));

    readingRouteMeta = null;
    saveReadingState();
    renderAll();
    switchReadingTab('route', document.getElementById('tabRoute'));
    showReadingToast('Jornada reiniciada. La memoria GPS se conserva.');
  };

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = n => n * Math.PI / 180;
    const R = 6371000;
    const p1 = toRad(lat1);
    const p2 = toRad(lat2);
    const dp = toRad(lat2 - lat1);
    const dl = toRad(lon2 - lon1);
    const a = Math.sin(dp / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderNearbyPanel(rows, title) {
    const panel = document.getElementById('nearbyReadingPanel');
    if (!panel) return;

    if (!rows.length) {
      panel.innerHTML = '<div class="nearby-empty">No hay otros pendientes con GPS disponible.</div>';
      panel.classList.add('show');
      return;
    }

    panel.innerHTML = `
      <div class="nearby-head">
        <div><strong>${escapeHtml(title)}</strong><span>No cambia tu ruta hasta que elijás uno.</span></div>
        <button onclick="document.getElementById('nearbyReadingPanel').classList.remove('show')">×</button>
      </div>
      <div class="nearby-list">
        ${rows.map(item => `
          <button class="nearby-item" onclick="setNextReading('${item.order.localizacion}')">
            <span><strong>${escapeHtml(item.order.medidor)}</strong><small>${escapeHtml(item.order.localizacion)}</small></span>
            <b>${item.distance < 1000 ? Math.round(item.distance) + ' m' : (item.distance / 1000).toFixed(1) + ' km'}</b>
          </button>
        `).join('')}
      </div>`;
    panel.classList.add('show');
  }

  window.showNearbyReadings = async function () {
    const panel = document.getElementById('nearbyReadingPanel');
    if (panel) {
      panel.innerHTML = '<div class="nearby-empty"><i class="fa-solid fa-spinner fa-spin"></i> Buscando pendientes cercanos…</div>';
      panel.classList.add('show');
    }

    try {
      const pos = await getCurrentPositionPromise();
      const lat = Number(pos.coords.latitude);
      const lon = Number(pos.coords.longitude);
      const current = readingOrders.find(o => o.status !== 'read');

      let candidates = readingOrders
        .filter(o =>
          o.status !== 'read' &&
          Number.isFinite(Number(o.lat)) &&
          Number.isFinite(Number(o.lon)) &&
          o.gpsStatus !== 'conflict'
        )
        .map(order => ({
          order,
          distance: distanceMeters(lat, lon, Number(order.lat), Number(order.lon))
        }))
        .sort((a,b) => a.distance - b.distance);

      if (candidates.length > 1 && current) {
        candidates = candidates.filter(x => x.order.localizacion !== current.localizacion);
      }

      const within250 = candidates.filter(x => x.distance <= 250).slice(0, 5);
      if (within250.length) {
        renderNearbyPanel(within250, `${within250.length} pendientes a menos de 250 m`);
      } else {
        renderNearbyPanel(candidates.slice(0, 3), 'No hay pendientes a menos de 250 m · más cercanos');
      }
    } catch (err) {
      if (panel) {
        panel.innerHTML = '<div class="nearby-empty">No pude obtener tu ubicación. Revisá el permiso de ubicación.</div>';
        panel.classList.add('show');
      }
    }
  };
})();