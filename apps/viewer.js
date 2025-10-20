// Externalized app logic for viewer.html
// This script assumes it is loaded after Leaflet and that the HTML contains the expected IDs.

// Initialize map
const map = L.map('map').setView([38.4405, -122.7144], 10); // default to Santa Rosa area
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// We'll create a custom overlay control to manage layer entries reactively
const layerControl = L.control({ position: 'topright' });
// define onAdd before adding to the map so Leaflet can call it when the
// control is registered. Calling addTo(map) before setting onAdd causes
// "this.onAdd is not a function" because Leaflet invokes onAdd immediately.
layerControl.onAdd = function () {
    const container = L.DomUtil.create('div', 'leaflet-control-layers');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Layer control');
    const title = L.DomUtil.create('div', 'leaflet-control-layers-title', container);
    title.textContent = 'Layers';
    const list = L.DomUtil.create('div', 'leaflet-control-layers-list', container);
    list.id = 'customLayerList';
    return container;
};
layerControl.addTo(map);
const activeLayers = new Map(); // key: normalized identifier, value: { layer, name }
const layerLabelsVisible = new Map(); // Track label visibility state

// Define hardcoded layers
const predefinedLayers = [
    {
        name: "Locations All Schools",
        url: "https://raw.githubusercontent.com/Santa-Rosa-City-Schools/maps/refs/heads/main/General/School_Locations.geojson"
    },
    {
        name: "Locations Elementary",
        url: "https://raw.githubusercontent.com/Santa-Rosa-City-Schools/maps/refs/heads/main/General/School_Locations_Elementary.geojson"
    },
    {
        name: "Locations Middle",
        url: "https://raw.githubusercontent.com/Santa-Rosa-City-Schools/maps/refs/heads/main/General/School_Locations_Middle.geojson"
    },
    {
        name: "Locations High",
        url: "https://raw.githubusercontent.com/Santa-Rosa-City-Schools/maps/refs/heads/main/General/School_Locations_High.geojson"
    },
    {
        name: "Locations Charter",
        url: "https://raw.githubusercontent.com/Santa-Rosa-City-Schools/maps/refs/heads/main/General/School_Locations_Charter.geojson"
    }
];

// Populate dropdown menu
const dropdown = document.getElementById('layersDropdown');
predefinedLayers.forEach(layer => {
    const link = document.createElement('a');
    link.textContent = layer.name;
    link.href = '#';
    link.onclick = (e) => { e.preventDefault(); loadFromUrl(layer.url); };
    dropdown.appendChild(link);
});

function getRandomColor() {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

function getFeatureStyle(feature) {
    const props = feature.properties || {};
    return {
        color: props.stroke || props.color || '#000000',
        weight: props['stroke-width'] || props.weight || 2,
        opacity: props['stroke-opacity'] || props.opacity || 0.5,
        fillColor: props.fill || props.fillColor || props.stroke || getRandomColor(),
        fillOpacity: props['fill-opacity'] || props.fillOpacity || 0.5
    };
}

function getPointStyle(feature) {
    const props = feature.properties || {};
    return {
        radius: 6,
        fillColor: props.fill || props.fillColor || props.stroke || getRandomColor(),
        color: props.stroke || props.color || '#000000',
        weight: props['stroke-width'] || props.weight || 2,
        opacity: props['stroke-opacity'] || props.opacity || 1,
        fillOpacity: props['fill-opacity'] || props.fillOpacity || 0.8
    };
}

function showStyleEditor(identifier) {
    const entry = activeLayers.get(identifier);
    if (!entry) return;
    const layer = entry.layer;

    const labelsVisible = layerLabelsVisible.get(identifier) !== false;

    let featuresHtml = '';
    layer.eachLayer(featureLayer => {
        const feature = featureLayer.feature;
        const style = getFeatureStyle(feature);
        const name = feature.properties.Name || feature.properties.name || feature.properties.school || feature.properties.School || '';
        const isVisible = !feature.properties.hidden;

        featuresHtml += `
            <div class="feature-item">
                <div class="visibility-toggle">
                    <input type="checkbox" class="feature-visible" ${isVisible ? 'checked' : ''} data-feature-id="${feature.id}">
                    <label>Visible</label>
                </div>
                <div class="feature-controls">
                    <label>Name</label>
                    <input type="text" class="feature-name" value="${escapeHtml(name)}" data-feature-id="${feature.id}">
                </div>
                <div class="feature-controls">
                    <label>Stroke</label>
                    <input type="color" class="feature-stroke" value="${style.color}" data-feature-id="${feature.id}">
                </div>
                <div class="feature-controls">
                    <label>Fill</label>
                    <input type="color" class="feature-fill" value="${style.fillColor}" data-feature-id="${feature.id}">
                </div>
                <div class="feature-controls">
                    <label>Width</label>
                    <input type="number" class="feature-width" value="${style.weight}" min="0" max="10" step="0.5" data-feature-id="${feature.id}">
                </div>
                <div class="feature-controls">
                    <label>Opacity</label>
                    <input type="number" class="feature-opacity" value="${style.opacity}" min="0" max="1" step="0.1" data-feature-id="${feature.id}">
                </div>
            </div>`;
    });

    const editorHtml = `
        <div class="backdrop">
            <div class="style-editor" role="dialog" aria-modal="true">
                <h3>Edit Features</h3>
                <div class="layer-settings" style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="layer-labels-toggle" ${labelsVisible ? 'checked' : ''}>
                        Show Labels
                    </label>
                    <div style="margin-top:8px; display:flex; gap:8px;">
                        <button id="removeLayerBtn">Remove Layer</button>
                        <button id="closeEditorBtn">Close</button>
                    </div>
                </div>
                <div class="feature-list">
                    ${featuresHtml}
                </div>
                <div class="buttons">
                    <button id="applyStyleBtn">Apply</button>
                    <button class="clear" id="cancelStyleBtn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('styleEditor').innerHTML = editorHtml;
    document.getElementById('styleEditor').style.display = 'block';

    document.getElementById('applyStyleBtn').onclick = () => applyStyle(identifier);
    document.getElementById('cancelStyleBtn').onclick = closeStyleEditor;
    document.getElementById('closeEditorBtn').onclick = closeStyleEditor;
    document.getElementById('removeLayerBtn').onclick = () => {
        removeLayer(identifier);
        closeStyleEditor();
    };
}

function closeStyleEditor() {
    document.getElementById('styleEditor').style.display = 'none';
    document.getElementById('styleEditor').innerHTML = '';
}

function applyStyle(identifier) {
    const entry = activeLayers.get(identifier);
    if (!entry) return;
    const layer = entry.layer;

    const labelsToggle = document.getElementById('layer-labels-toggle');
    const showLabels = labelsToggle ? labelsToggle.checked : true;
    layerLabelsVisible.set(identifier, showLabels);

    layer.eachLayer(featureLayer => {
        const featureId = featureLayer.feature.id;
        const visibleInput = document.querySelector(`.feature-visible[data-feature-id="${featureId}"]`);
        const nameInput = document.querySelector(`.feature-name[data-feature-id="${featureId}"]`);
        const strokeInput = document.querySelector(`.feature-stroke[data-feature-id="${featureId}"]`);
        const fillInput = document.querySelector(`.feature-fill[data-feature-id="${featureId}"]`);
        const widthInput = document.querySelector(`.feature-width[data-feature-id="${featureId}"]`);
        const opacityInput = document.querySelector(`.feature-opacity[data-feature-id="${featureId}"]`);

        if (!visibleInput) return; // defensive

        featureLayer.feature.properties.hidden = !visibleInput.checked;
        featureLayer.feature.properties.Name = nameInput ? nameInput.value : featureLayer.feature.properties.Name;
        featureLayer.feature.properties.stroke = strokeInput ? strokeInput.value : featureLayer.feature.properties.stroke;
        featureLayer.feature.properties.fill = fillInput ? fillInput.value : featureLayer.feature.properties.fill;
        featureLayer.feature.properties['stroke-width'] = widthInput ? parseFloat(widthInput.value) : featureLayer.feature.properties['stroke-width'];
        featureLayer.feature.properties['stroke-opacity'] = opacityInput ? parseFloat(opacityInput.value) : featureLayer.feature.properties['stroke-opacity'];
        featureLayer.feature.properties['fill-opacity'] = opacityInput ? parseFloat(opacityInput.value) : featureLayer.feature.properties['fill-opacity'];

        if (visibleInput.checked) {
            const style = {
                color: strokeInput ? strokeInput.value : '#000',
                fillColor: fillInput ? fillInput.value : '#fff',
                weight: widthInput ? parseFloat(widthInput.value) : 2,
                opacity: opacityInput ? parseFloat(opacityInput.value) : 1,
                fillOpacity: opacityInput ? parseFloat(opacityInput.value) : 0.8
            };

            if (featureLayer instanceof L.CircleMarker) style.radius = 6;
            featureLayer.setStyle(style);
            if (!map.hasLayer(featureLayer)) featureLayer.addTo(map);
        } else {
            map.removeLayer(featureLayer);
            if (featureLayer._label) { featureLayer._label.remove(); delete featureLayer._label; }
        }

        // Update labels
        if (nameInput && nameInput.value && visibleInput.checked && showLabels) {
            const center = featureLayer.getBounds ? featureLayer.getBounds().getCenter() : featureLayer.getLatLng();
            updateLabel(featureLayer, nameInput.value, center);
        } else if (featureLayer._label) {
            featureLayer._label.remove(); delete featureLayer._label;
        }
    });

    // Persist layer state
    persistActiveLayers();
    closeStyleEditor();
}

function updateLabel(featureLayer, label, position) {
    if (featureLayer._label) featureLayer._label.remove();
    if (label) {
        featureLayer._label = L.marker(position, {
            icon: L.divIcon({ className: 'label-text', html: label })
        }).addTo(map);
    }
}

function toggleLabels(identifier, show) {
    layerLabelsVisible.set(identifier, show);
    const entry = activeLayers.get(identifier);
    if (!entry) return;
    const layer = entry.layer;

    layer.eachLayer(featureLayer => {
        if (show && featureLayer.feature.properties.Name && !featureLayer.feature.properties.hidden) {
            const center = featureLayer.getBounds ? featureLayer.getBounds().getCenter() : featureLayer.getLatLng();
            updateLabel(featureLayer, featureLayer.feature.properties.Name, center);
        } else if (featureLayer._label) {
            featureLayer._label.remove(); delete featureLayer._label;
        }
    });
}

function clearAllLayers() {
    activeLayers.forEach((entry, id) => {
        const layer = entry.layer;
        layer.eachLayer(f => { if (f._label) f._label.remove(); });
        map.removeLayer(layer);
    });
    activeLayers.clear();
    layerLabelsVisible.clear();
    persistActiveLayers();
}

async function loadFromUrl(url) {
    const urlToLoad = url || document.getElementById('geojsonUrl').value;
    if (!urlToLoad) return;

    const addBtn = document.getElementById('addButton');
    try {
        const normalized = normalizeIdentifier(urlToLoad);
        if (activeLayers.has(normalized)) {
            alert('Layer already added: ' + getLayerName(urlToLoad));
            return;
        }

        showLoading(true);
        const response = await fetch(urlToLoad);
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const data = await response.json();
        addGeoJSONLayer(data, normalized, urlToLoad);
        document.getElementById('geojsonUrl').value = '';

    } catch (error) {
        alert('Error loading GeoJSON: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// File input handler
document.getElementById('fileInput').addEventListener('change', (event) => {
    const files = event.target.files;
    if (!files.length) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const normalized = normalizeIdentifier(file.name);
                if (activeLayers.has(normalized)) {
                    alert('File already added: ' + file.name);
                    return;
                }
                addGeoJSONLayer(data, normalized, file.name);
            } catch (error) {
                alert(`Error parsing ${file.name}: ${error.message}`);
            }
        };
        reader.readAsText(file);
    });
});

function showLoading(visible, text) {
    const el = document.getElementById('loading');
    const addBtn = document.getElementById('addButton');
    const t = document.getElementById('loadingText');
    if (text && t) t.textContent = text;
    if (visible) {
        el.style.display = 'inline-flex'; if (addBtn) addBtn.disabled = true;
    } else { el.style.display = 'none'; if (addBtn) addBtn.disabled = false; }
}

function normalizeIdentifier(id) {
    try {
        const u = new URL(id);
        return u.origin + u.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
    } catch (_) {
        return String(id).trim().toLowerCase();
    }
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>\"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

function getLayerName(identifier) {
    const predefined = predefinedLayers.find(layer => layer.url === identifier);
    if (predefined) return predefined.name;

    let name = identifier.split('.').slice(0, -1).join('.');
    if (!name) name = identifier;
    name = name.split('/').pop();
    name = decodeURIComponent(name);
    name = name.replace(/[_-]/g, ' ');
    name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    return name;
}

// Custom reactive layer list control
function renderLayerList() {
    const list = document.getElementById('customLayerList');
    if (!list) return;
    // Clear children while preserving the node
    while (list.firstChild) list.removeChild(list.firstChild);

    activeLayers.forEach((entry, identifier) => {
        const layer = entry.layer;
        const name = entry.name;

        const row = document.createElement('div');
        row.className = 'leaflet-layer-entry';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', `Layer ${name}`);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = map.hasLayer(layer);
        checkbox.setAttribute('aria-label', `Toggle ${name}`);
        checkbox.onchange = (e) => {
            if (e.target.checked) map.addLayer(layer); else map.removeLayer(layer);
            persistActiveLayers();
        };

        const label = document.createElement('button');
        label.className = 'layer-label-button';
        label.textContent = name;
        label.title = `Open style editor for ${name}`;
        label.onclick = () => showStyleEditor(identifier);
        label.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showStyleEditor(identifier); } };
        label.setAttribute('aria-label', `Edit layer ${name}`);

        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.setAttribute('aria-label', `Edit ${name}`);
        editBtn.onclick = (e) => { e.stopPropagation(); showStyleEditor(identifier); };

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('aria-label', `Remove ${name}`);
        removeBtn.onclick = (e) => { e.stopPropagation(); removeLayer(identifier); };

        row.appendChild(checkbox);
        row.appendChild(label);
        row.appendChild(editBtn);
        row.appendChild(removeBtn);

        // Allow keyboard navigation
        row.tabIndex = 0;
        row.onkeydown = (e) => {
            if (e.key === 'Delete') removeLayer(identifier);
            if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === label) showStyleEditor(identifier);
        };

        list.appendChild(row);
    });
}

// Re-render list when activeLayers changes
function scheduleRender() {
    // simple debounce
    if (scheduleRender._t) clearTimeout(scheduleRender._t);
    scheduleRender._t = setTimeout(() => renderLayerList(), 50);
}

function addGeoJSONLayer(data, identifier, originalIdentifier) {
    if (data.features) {
        data.features.forEach((feature, index) => {
            if (!feature.id) feature.id = `${identifier}-${index}`;
        });
    }

    layerLabelsVisible.set(identifier, true);

    const geoLayer = L.geoJSON(data, {
        style: getFeatureStyle,
        pointToLayer: function(feature, latlng) { return L.circleMarker(latlng, getPointStyle(feature)); },
        onEachFeature: (feature, layer) => {
            if (feature.properties.hidden) map.removeLayer(layer);
            if (feature.properties.Name && !feature.properties.hidden) {
                const center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
                updateLabel(layer, feature.properties.Name, center);
            }
            layer.on('click', () => {
                const props = feature.properties || {};
                const popupHtml = '<pre style="max-height:200px;overflow:auto;">' + escapeHtml(JSON.stringify(props, null, 2)) + '</pre>';
                layer.bindPopup(popupHtml).openPopup();
            });
        }
    }).addTo(map);

    const name = getLayerName(originalIdentifier || identifier);
    // register and render in custom control
    activeLayers.set(identifier, { layer: geoLayer, name: name });
    scheduleRender();

    // Fit bounds to show all layers
    try {
        if (activeLayers.size === 1) map.fitBounds(geoLayer.getBounds());
        else {
            const bounds = Array.from(activeLayers.values()).reduce((acc, entry) => acc.extend(entry.layer.getBounds()), L.latLngBounds([]));
            map.fitBounds(bounds);
        }
    } catch (e) {
        // ignore fitBounds errors for single-point layers
    }

    persistActiveLayers();
}

function removeLayer(identifier) {
    const entry = activeLayers.get(identifier);
    if (!entry) return;
    const layer = entry.layer;
    layer.eachLayer(f => { if (f._label) f._label.remove(); });
    map.removeLayer(layer);
    activeLayers.delete(identifier);
    layerLabelsVisible.delete(identifier);
    persistActiveLayers();
    scheduleRender();
}

function shareCurrentView() {
    const urls = Array.from(activeLayers.keys());
    if (urls.length === 0) { alert('No layers to share'); return; }

    const shareUrl = new URL(window.location.href);
    shareUrl.search = '';
    urls.forEach(url => shareUrl.searchParams.append('url', url));
    navigator.clipboard.writeText(shareUrl.toString()).then(() => alert('Share URL copied to clipboard!'))
        .catch(() => { const textarea = document.createElement('textarea'); textarea.value = shareUrl.toString(); document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); alert('Share URL copied to clipboard!'); });
}

window.addEventListener('load', () => {
    const urls = getUrlParameters();
    const saved = loadPersistedLayers();
    // Try URL params first, then saved state
    if (urls.length) urls.forEach(url => loadFromUrl(url));
    else if (saved && saved.length) saved.forEach(url => loadFromUrl(url));
    // ensure layer list is rendered (may be populated asynchronously)
    setTimeout(() => scheduleRender(), 250);
});

function getUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.getAll('url');
}

// Persist active layers (only keys)
function persistActiveLayers() {
    try {
        const keys = Array.from(activeLayers.keys());
        localStorage.setItem('viewer:layers', JSON.stringify(keys));
    } catch (e) { /* ignore */ }
}

function loadPersistedLayers() {
    try { return JSON.parse(localStorage.getItem('viewer:layers') || '[]'); }
    catch (e) { return []; }
}
