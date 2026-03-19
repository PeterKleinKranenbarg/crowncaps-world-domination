const map = L.map('map').setView([20, 0], 2);

// Basemap
L.tileLayer('https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=IAPFK9sWNdeiCqW4Dnj4#1.0/0.00000/0.00000', {
  attribution: '&copy; OpenStreetMap contributors &copy; MapTiler'
}).addTo(map);

// Global state
let searchIndex = [];
let globalCapsData = null;
let globalWorldData = null;
let countryLayers = {};
let cityLayer = null;
let currentCountryLayer = null;

// Lightbox state
let lightboxCaps = [];
let lightboxCurrentIndex = 0;
let lightboxBreweryName = '';

// ==================== SEARCH FUNCTIONALITY ====================

function buildSearchIndex(capsData) {
  const index = [];
  
  for (const country in capsData) {
    for (const cityName in capsData[country].cities) {
      const city = capsData[country].cities[cityName];
      
      for (const brewery of city.breweries) {
        index.push({
          type: 'brewery',
          name: brewery.name,
          country: country,
          city: cityName,
          lat: city.lat,
          lon: city.lon,
          brewery: brewery
        });
        
        for (const cap of brewery.caps) {
          const capName = cap.replace(/\.(jpe?g|png|gif)$/i, '');
          index.push({
            type: 'beer',
            name: capName,
            country: country,
            city: cityName,
            lat: city.lat,
            lon: city.lon,
            brewery: brewery,
            capImage: cap
          });
        }
      }
    }
  }
  
  return index;
}

function performSearch(query) {
  if (!query || query.length < 2) return [];
  
  const lowerQuery = query.toLowerCase();
  const results = searchIndex.filter(item => 
    item.name.toLowerCase().includes(lowerQuery)
  );
  
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase().startsWith(lowerQuery);
    const bExact = b.name.toLowerCase().startsWith(lowerQuery);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return results.slice(0, 50);
}

function renderSearchResults(results) {
  const resultsContainer = document.getElementById('search-results');
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="search-no-results">No results found</div>';
    resultsContainer.classList.add('active');
    return;
  }
  
  let html = '';
  results.forEach((result, index) => {
    const typeClass = result.type;
    const typeLabel = result.type === 'brewery' ? 'Brewery' : 'Beer';
    
    html += `
      <div class="search-result-item" data-index="${index}">
        <span class="search-result-type ${typeClass}">${typeLabel}</span>
        <span class="search-result-name">${escapeHtml(result.name)}</span>
        <div class="search-result-location">${escapeHtml(result.city)}, ${escapeHtml(result.country)}</div>
      </div>
    `;
  });
  
  resultsContainer.innerHTML = html;
  resultsContainer.classList.add('active');
  
  resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      handleSearchResultClick(results[idx]);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleSearchResultClick(result) {
  document.getElementById('search-results').classList.remove('active');
  document.getElementById('search-input').value = '';
  
  map.setView([result.lat, result.lon], 10);
  
  if (cityLayer) {
    cityLayer.remove();
    cityLayer = null;
  }
  
  const cityData = globalCapsData[result.country].cities[result.city];
  const totalCaps = cityData.breweries.reduce((sum, b) => sum + b.caps.length, 0);
  
  const circle = L.circleMarker([result.lat, result.lon], {
    radius: 12,
    fillColor: '#fc2626ff',
    color: '#ff1100ff',
    weight: 1,
    opacity: 1,
    fillOpacity: 0.7,
    pane: 'markerPane'
  }).bindPopup(`<b>${result.city}</b><br>${totalCaps} crown caps<br>${cityData.breweries.length} breweries`);
  
  cityLayer = L.layerGroup([circle]).addTo(map);
  
  // Show sidebar with the specific brewery expanded
  const breweries = cityData.breweries.map(b => ({
    name: b.name,
    city: result.city,
    caps: b.caps
  }));
  
  const highlightCap = result.type === 'beer' ? result.capImage : null;
  renderSidebar({
    title: result.city,
    subtitle: result.country,
    breweries: breweries,
    expandBrewery: result.brewery.name,
    highlightCap: highlightCap
  });
}

function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let debounceTimer;
  let selectedIndex = -1;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = e.target.value.trim();
      if (query.length >= 2) {
        const results = performSearch(query);
        renderSearchResults(results);
        selectedIndex = -1;
      } else {
        searchResults.classList.remove('active');
      }
    }, 200);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    const items = searchResults.querySelectorAll('.search-result-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelectedItem(items, selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelectedItem(items, selectedIndex);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      items[selectedIndex].click();
    } else if (e.key === 'Escape') {
      searchResults.classList.remove('active');
      searchInput.blur();
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.classList.remove('active');
    }
  });
}

function updateSelectedItem(items, index) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === index);
  });
  if (items[index]) {
    items[index].scrollIntoView({ block: 'nearest' });
  }
}

// ==================== SIDEBAR RENDERING ====================

function renderSidebar(options) {
  const { title, subtitle, breweries, expandBrewery, highlightCap } = options;
  
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('active');
  
  // Sort breweries alphabetically
  const sortedBreweries = breweries.slice().sort((a, b) => a.name.localeCompare(b.name));
  
  // Calculate totals
  const totalCaps = sortedBreweries.reduce((sum, b) => sum + b.caps.length, 0);
  const totalBreweries = sortedBreweries.length;
  
  let html = `
    <div class="sidebar-header">
      <button id="close-sidebar" title="Close">&times;</button>
      <h2>${escapeHtml(title)}</h2>
      ${subtitle ? `<div class="location-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <div class="sidebar-stats">
        <div class="sidebar-stat">
          <span class="sidebar-stat-icon">&#127866;</span>
          <span>${totalCaps} caps</span>
        </div>
        <div class="sidebar-stat">
          <span class="sidebar-stat-icon">&#127983;</span>
          <span>${totalBreweries} ${totalBreweries === 1 ? 'brewery' : 'breweries'}</span>
        </div>
      </div>
    </div>
    <div class="sidebar-content">
      <ul class="brewery-list">
  `;
  
  sortedBreweries.forEach((brewery, index) => {
    const isExpanded = expandBrewery && brewery.name === expandBrewery;
    const showCity = brewery.city && subtitle; // Show city when viewing a country
    
    html += `
      <li class="brewery-card${isExpanded ? ' expanded' : ''}" data-index="${index}">
        <button class="brewery-header">
          <div class="brewery-info">
            <div class="brewery-name">${escapeHtml(brewery.name)}</div>
            ${showCity ? `<div class="brewery-city">${escapeHtml(brewery.city)}</div>` : ''}
          </div>
          <div class="brewery-meta">
            <span class="cap-count-badge">${brewery.caps.length}</span>
            <span class="brewery-chevron">&#9660;</span>
          </div>
        </button>
        <div class="caps-container">
          <div class="caps-grid">
            ${isExpanded ? renderCapsGrid(brewery, highlightCap) : ''}
          </div>
        </div>
      </li>
    `;
  });
  
  html += `
      </ul>
    </div>
  `;
  
  sidebar.innerHTML = html;
  
  // Event: Close button
  document.getElementById('close-sidebar').addEventListener('click', () => {
    sidebar.classList.remove('active');
  });
  
  // Event: Brewery card toggle
  document.querySelectorAll('.brewery-card').forEach((card, index) => {
    const header = card.querySelector('.brewery-header');
    header.addEventListener('click', () => {
      const wasExpanded = card.classList.contains('expanded');
      
      // Close all other cards
      document.querySelectorAll('.brewery-card').forEach(c => c.classList.remove('expanded'));
      
      if (!wasExpanded) {
        card.classList.add('expanded');
        const grid = card.querySelector('.caps-grid');
        if (!grid.innerHTML.trim()) {
          grid.innerHTML = renderCapsGrid(sortedBreweries[index], null);
          attachCapClickHandlers(grid, sortedBreweries[index]);
        }
      }
    });
  });
  
  // Attach cap click handlers for pre-expanded brewery
  if (expandBrewery) {
    const expandedCard = document.querySelector('.brewery-card.expanded');
    if (expandedCard) {
      const grid = expandedCard.querySelector('.caps-grid');
      const breweryIndex = sortedBreweries.findIndex(b => b.name === expandBrewery);
      if (breweryIndex >= 0) {
        attachCapClickHandlers(grid, sortedBreweries[breweryIndex]);
        
        // Scroll to the expanded brewery
        setTimeout(() => {
          expandedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }
  
  // Stop map interaction when clicking sidebar
  sidebar.addEventListener('click', e => e.stopPropagation());
}

function renderCapsGrid(brewery, highlightCap = null) {
  let html = '';
  brewery.caps.forEach((capImg, index) => {
    const capName = capImg.replace(/\.(jpe?g|png|gif)$/i, '');
    const isHighlighted = highlightCap === capImg;
    
    html += `
      <div class="cap-item${isHighlighted ? ' highlighted' : ''}" data-cap-index="${index}" data-cap-img="${escapeHtml(capImg)}">
        <img src="data/images/${encodeURIComponent(capImg)}" alt="${escapeHtml(capName)}" loading="lazy">
        <div class="cap-label">${escapeHtml(capName)}</div>
      </div>
    `;
  });
  return html;
}

function attachCapClickHandlers(grid, brewery) {
  grid.querySelectorAll('.cap-item').forEach(item => {
    item.addEventListener('click', () => {
      const capIndex = parseInt(item.dataset.capIndex);
      openLightbox(brewery.caps, capIndex, brewery.name);
    });
  });
}

// ==================== LIGHTBOX ====================

function openLightbox(caps, index, breweryName) {
  lightboxCaps = caps;
  lightboxCurrentIndex = index;
  lightboxBreweryName = breweryName;
  
  updateLightboxContent();
  document.getElementById('lightbox').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.body.style.overflow = '';
}

function updateLightboxContent() {
  const cap = lightboxCaps[lightboxCurrentIndex];
  const capName = cap.replace(/\.(jpe?g|png|gif)$/i, '');
  
  document.querySelector('.lightbox-image').src = `data/images/${encodeURIComponent(cap)}`;
  document.querySelector('.lightbox-beer-name').textContent = capName;
  document.querySelector('.lightbox-brewery-name').textContent = lightboxBreweryName;
  
  // Show/hide nav buttons
  document.querySelector('.lightbox-nav.prev').style.display = lightboxCaps.length > 1 ? 'flex' : 'none';
  document.querySelector('.lightbox-nav.next').style.display = lightboxCaps.length > 1 ? 'flex' : 'none';
}

function lightboxPrev() {
  lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxCaps.length) % lightboxCaps.length;
  updateLightboxContent();
}

function lightboxNext() {
  lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxCaps.length;
  updateLightboxContent();
}

function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  
  // Close button
  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  
  // Navigation buttons
  lightbox.querySelector('.lightbox-nav.prev').addEventListener('click', lightboxPrev);
  lightbox.querySelector('.lightbox-nav.next').addEventListener('click', lightboxNext);
  
  // Close on overlay click
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });
  
  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    
    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      lightboxPrev();
    } else if (e.key === 'ArrowRight') {
      lightboxNext();
    }
  });
}

// ==================== MAP FUNCTIONALITY ====================

function zoomToCountry(layer, name, capsData) {
  if (cityLayer) {
    cityLayer.remove();
    cityLayer = null;
  }

  const cities = capsData[name]?.cities;
  if (!cities) return;

  const markers = [];
  let maxCapsInCountry = 0;

  for (const cityName in cities) {
    const c = cities[cityName];
    const cityTotalCaps = c.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0);
    maxCapsInCountry = Math.max(cityTotalCaps, maxCapsInCountry);
  }

  for (const cityName in cities) {
    const c = cities[cityName];
    const totalCaps = c.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0);
    const radiusMeters = 6 + (totalCaps / maxCapsInCountry) * 14;

    const circle = L.circleMarker([c.lat, c.lon], {
      radius: radiusMeters,
      fillColor: '#fc2626ff',
      color: '#ff1100ff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.7,
      pane: 'markerPane'
    }).bindPopup(`<b>${cityName}</b><br>${totalCaps} crown caps<br>${c.breweries.length} breweries`)
      .on('click', () => showCityBreweries(cityName, c, name));

    markers.push(circle);
  }

  cityLayer = L.layerGroup(markers).addTo(map);
  currentCountryLayer = layer;

  // Collect all breweries from all cities
  const allBreweries = [];
  for (const cityName in cities) {
    cities[cityName].breweries.forEach(brewery => {
      allBreweries.push({
        name: brewery.name,
        city: cityName,
        caps: brewery.caps
      });
    });
  }

  renderSidebar({
    title: name,
    subtitle: null,
    breweries: allBreweries
  });
}

function showCityBreweries(cityName, cityData, countryName) {
  const breweries = cityData.breweries.map(b => ({
    name: b.name,
    city: null, // Don't show city when viewing city-level
    caps: b.caps
  }));

  renderSidebar({
    title: cityName,
    subtitle: countryName || null,
    breweries: breweries
  });
}

// ==================== INITIALIZATION ====================

Promise.all([
  fetch('data/world.geojson').then(r => r.json()),
  fetch('data/beercaps.json').then(r => r.json())
]).then(([world, capsData]) => {
  
  globalCapsData = capsData;
  globalWorldData = world;
  
  searchIndex = buildSearchIndex(capsData);
  
  initSearch();
  initLightbox();
  
  function getColor(countryName) {
    const count = capsData[countryName]?.count || 0;
    return count === 0 ? '#eee' :
           count < 10 ? '#cce5ff' :
           count < 30 ? '#66b2ff' :
           '#0066cc';
  }

  L.geoJSON(world, {
    style: feature => ({
      color: "#333",
      weight: 1,
      fillColor: getColor(feature.properties.ADMIN),
      fillOpacity: 0.8
    }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.ADMIN;
      countryLayers[name] = layer;
      layer.on('click', () => zoomToCountry(layer, name, capsData));
    }
  }).addTo(map);
});
