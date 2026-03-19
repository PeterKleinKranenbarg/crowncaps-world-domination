const map = L.map('map').setView([20, 0], 2);

// Basemap
L.tileLayer('https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=IAPFK9sWNdeiCqW4Dnj4#1.0/0.00000/0.00000', {
  attribution: '&copy; OpenStreetMap contributors &copy; MapTiler'
}).addTo(map);

// ==================== GLOBAL STATE ====================
let searchIndex = [];
let globalCapsData = null;
let globalWorldData = null;
let countryLayers = {};
let cityLayer = null;
let currentCountryLayer = null;

// Navigation state
let navigationStack = [];
let currentSort = localStorage.getItem('capSort') || 'name';

// Lightbox state
let lightboxCaps = [];
let lightboxCurrentIndex = 0;
let lightboxBreweryName = '';

// Touch state
let touchStartY = 0;
let touchStartX = 0;
let sidebarStartY = 0;
let isDraggingSidebar = false;

// ==================== UTILITY FUNCTIONS ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isMobile() {
  return window.innerWidth <= 768;
}

// ==================== URL STATE MANAGEMENT ====================

function updateUrlState(state) {
  const params = new URLSearchParams();
  if (state.country) params.set('country', state.country);
  if (state.city) params.set('city', state.city);
  if (state.brewery) params.set('brewery', state.brewery);
  
  const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
  window.history.replaceState(state, '', newUrl);
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    country: params.get('country'),
    city: params.get('city'),
    brewery: params.get('brewery')
  };
}

function restoreFromUrl() {
  const state = parseUrlState();
  if (!state.country || !globalCapsData) return false;
  
  const countryData = globalCapsData[state.country];
  if (!countryData) return false;
  
  if (state.city && countryData.cities[state.city]) {
    const cityData = countryData.cities[state.city];
    const breweries = cityData.breweries.map(b => ({
      name: b.name,
      city: null,
      caps: b.caps
    }));
    
    // Add marker
    if (cityLayer) cityLayer.remove();
    const circle = L.circleMarker([cityData.lat, cityData.lon], {
      radius: 12,
      fillColor: '#fc2626ff',
      color: '#ff1100ff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.7,
      pane: 'markerPane'
    });
    cityLayer = L.layerGroup([circle]).addTo(map);
    map.setView([cityData.lat, cityData.lon], 10);
    
    navigationStack = [{ type: 'country', name: state.country }];
    renderSidebar({
      title: state.city,
      subtitle: state.country,
      breweries: breweries,
      expandBrewery: state.brewery
    });
    return true;
  } else {
    // Just country
    const layer = countryLayers[state.country];
    if (layer) {
      zoomToCountry(layer, state.country, globalCapsData);
      return true;
    }
  }
  return false;
}

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
  
  const breweries = cityData.breweries.map(b => ({
    name: b.name,
    city: result.city,
    caps: b.caps
  }));
  
  navigationStack = [{ type: 'country', name: result.country }];
  const highlightCap = result.type === 'beer' ? result.capImage : null;
  
  updateUrlState({ country: result.country, city: result.city, brewery: result.brewery.name });
  
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

// ==================== DASHBOARD ====================

function renderDashboard() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('active');
  
  // Calculate stats
  let totalCaps = 0;
  let totalBreweries = 0;
  let totalCountries = 0;
  const countryStats = [];
  
  for (const country in globalCapsData) {
    totalCountries++;
    let countryCaps = 0;
    let countryBreweries = 0;
    
    for (const city in globalCapsData[country].cities) {
      const breweries = globalCapsData[country].cities[city].breweries;
      countryBreweries += breweries.length;
      breweries.forEach(b => {
        countryCaps += b.caps.length;
      });
    }
    
    totalCaps += countryCaps;
    totalBreweries += countryBreweries;
    countryStats.push({ name: country, caps: countryCaps });
  }
  
  // Sort by caps descending
  countryStats.sort((a, b) => b.caps - a.caps);
  const topCountries = countryStats.slice(0, 5);
  
  let html = `
    <div class="sidebar-drag-handle"><span></span></div>
    <div class="dashboard">
      <h2>My Crown Cap Collection</h2>
      
      <div class="dashboard-stats">
        <div class="dashboard-stat-card">
          <div class="dashboard-stat-value">${totalCaps.toLocaleString()}</div>
          <div class="dashboard-stat-label">Crown Caps</div>
        </div>
        <div class="dashboard-stat-card">
          <div class="dashboard-stat-value">${totalBreweries.toLocaleString()}</div>
          <div class="dashboard-stat-label">Breweries</div>
        </div>
        <div class="dashboard-stat-card">
          <div class="dashboard-stat-value">${totalCountries}</div>
          <div class="dashboard-stat-label">Countries</div>
        </div>
        <div class="dashboard-stat-card" id="random-cap-card" style="cursor: pointer;">
          <div class="dashboard-stat-value">?</div>
          <div class="dashboard-stat-label">Surprise Me!</div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3>Top Countries</h3>
        <ul class="top-countries-list">
          ${topCountries.map(c => `
            <li class="top-country-item" data-country="${escapeHtml(c.name)}">
              <span class="top-country-name">${escapeHtml(c.name)}</span>
              <span class="top-country-count">${c.caps} caps</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
  
  sidebar.innerHTML = html;
  
  // Event handlers
  document.querySelectorAll('.top-country-item').forEach(item => {
    item.addEventListener('click', () => {
      const countryName = item.dataset.country;
      const layer = countryLayers[countryName];
      if (layer) {
        zoomToCountry(layer, countryName, globalCapsData);
      }
    });
  });
  
  document.getElementById('random-cap-card').addEventListener('click', showRandomCap);
  
  initSidebarTouch();
}

function showRandomCap() {
  if (searchIndex.length === 0) return;
  
  // Filter to only beers (not breweries)
  const beers = searchIndex.filter(item => item.type === 'beer');
  if (beers.length === 0) return;
  
  const randomBeer = beers[Math.floor(Math.random() * beers.length)];
  
  // Zoom to location
  map.setView([randomBeer.lat, randomBeer.lon], 8);
  
  // Add marker
  if (cityLayer) cityLayer.remove();
  const circle = L.circleMarker([randomBeer.lat, randomBeer.lon], {
    radius: 12,
    fillColor: '#fc2626ff',
    color: '#ff1100ff',
    weight: 1,
    opacity: 1,
    fillOpacity: 0.7,
    pane: 'markerPane'
  });
  cityLayer = L.layerGroup([circle]).addTo(map);
  
  // Open lightbox directly
  openLightbox([randomBeer.capImage], 0, randomBeer.brewery.name);
}

// ==================== SIDEBAR RENDERING ====================

function sortBreweries(breweries, sortBy) {
  const sorted = breweries.slice();
  if (sortBy === 'caps') {
    sorted.sort((a, b) => b.caps.length - a.caps.length);
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

function renderSidebar(options) {
  const { title, subtitle, breweries, expandBrewery, highlightCap } = options;
  
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('active');
  
  // Sort breweries
  const sortedBreweries = sortBreweries(breweries, currentSort);
  
  // Calculate totals
  const totalCaps = sortedBreweries.reduce((sum, b) => sum + b.caps.length, 0);
  const totalBreweries = sortedBreweries.length;
  
  // Build breadcrumb
  let breadcrumbHtml = '';
  if (navigationStack.length > 0) {
    breadcrumbHtml = '<div class="sidebar-breadcrumb">';
    navigationStack.forEach((item, index) => {
      breadcrumbHtml += `<a href="#" data-nav-index="${index}">${escapeHtml(item.name)}</a>`;
      breadcrumbHtml += '<span class="separator">›</span>';
    });
    breadcrumbHtml += `<span>${escapeHtml(title)}</span></div>`;
  }
  
  let html = `
    <div class="sidebar-drag-handle"><span></span></div>
    <div class="sidebar-header sticky">
      <button id="close-sidebar" title="Close">&times;</button>
      ${breadcrumbHtml}
      <h2>${escapeHtml(title)}</h2>
      ${!navigationStack.length && subtitle ? `<div class="location-subtitle">${escapeHtml(subtitle)}</div>` : ''}
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
      <div class="sidebar-controls">
        <select class="sort-select" id="sort-select">
          <option value="name" ${currentSort === 'name' ? 'selected' : ''}>Sort: A-Z</option>
          <option value="caps" ${currentSort === 'caps' ? 'selected' : ''}>Sort: Most Caps</option>
        </select>
        <button class="btn-random" id="btn-random">Surprise Me!</button>
      </div>
    </div>
    <div class="sidebar-content">
      <ul class="brewery-list">
  `;
  
  sortedBreweries.forEach((brewery, index) => {
    const isExpanded = expandBrewery && brewery.name === expandBrewery;
    const showCity = brewery.city && !subtitle;
    
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
    closeSidebar();
  });
  
  // Event: Sort change
  document.getElementById('sort-select').addEventListener('change', (e) => {
    currentSort = e.target.value;
    localStorage.setItem('capSort', currentSort);
    renderSidebar({ ...options, expandBrewery: null, highlightCap: null });
  });
  
  // Event: Random button
  document.getElementById('btn-random').addEventListener('click', showRandomCap);
  
  // Event: Breadcrumb navigation
  document.querySelectorAll('.sidebar-breadcrumb a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const navIndex = parseInt(link.dataset.navIndex);
      navigateBack(navIndex);
    });
  });
  
  // Event: Brewery card toggle
  document.querySelectorAll('.brewery-card').forEach((card, index) => {
    const header = card.querySelector('.brewery-header');
    header.addEventListener('click', () => {
      const wasExpanded = card.classList.contains('expanded');
      
      // Close all cards
      document.querySelectorAll('.brewery-card').forEach(c => c.classList.remove('expanded'));
      
      if (!wasExpanded) {
        card.classList.add('expanded');
        const grid = card.querySelector('.caps-grid');
        if (!grid.innerHTML.trim()) {
          grid.innerHTML = renderCapsGrid(sortedBreweries[index], null);
          attachCapClickHandlers(grid, sortedBreweries[index]);
          observeCapImages(grid);
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
        observeCapImages(grid);
        
        setTimeout(() => {
          expandedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }
  
  initSidebarTouch();
  
  // Stop map interaction
  sidebar.addEventListener('click', e => e.stopPropagation());
}

function navigateBack(toIndex) {
  if (toIndex >= navigationStack.length) return;
  
  const target = navigationStack[toIndex];
  navigationStack = navigationStack.slice(0, toIndex);
  
  if (target.type === 'country') {
    const layer = countryLayers[target.name];
    if (layer) {
      zoomToCountry(layer, target.name, globalCapsData);
    }
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('active');
  navigationStack = [];
  updateUrlState({});
  
  // Show dashboard after a brief delay
  setTimeout(() => {
    renderDashboard();
  }, 300);
}

function renderCapsGrid(brewery, highlightCap = null) {
  let html = '';
  brewery.caps.forEach((capImg, index) => {
    const capName = capImg.replace(/\.(jpe?g|png|gif)$/i, '');
    const isHighlighted = highlightCap === capImg;
    
    html += `
      <div class="cap-item${isHighlighted ? ' highlighted' : ''}" data-cap-index="${index}" data-cap-img="${escapeHtml(capImg)}">
        <img data-src="data/images/${encodeURIComponent(capImg)}" alt="${escapeHtml(capName)}" loading="lazy" decoding="async">
        <div class="cap-label">${escapeHtml(capName)}</div>
      </div>
    `;
  });
  return html;
}

function observeCapImages(grid) {
  const images = grid.querySelectorAll('img[data-src]');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.onload = () => img.classList.add('loaded');
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '50px' });
  
  images.forEach(img => observer.observe(img));
}

function attachCapClickHandlers(grid, brewery) {
  grid.querySelectorAll('.cap-item').forEach(item => {
    item.addEventListener('click', () => {
      const capIndex = parseInt(item.dataset.capIndex);
      openLightbox(brewery.caps, capIndex, brewery.name);
    });
  });
}

// ==================== SIDEBAR TOUCH GESTURES ====================

function initSidebarTouch() {
  const sidebar = document.getElementById('sidebar');
  const dragHandle = sidebar.querySelector('.sidebar-drag-handle');
  
  if (!dragHandle || !isMobile()) return;
  
  dragHandle.addEventListener('touchstart', handleSidebarTouchStart, { passive: true });
  dragHandle.addEventListener('touchmove', handleSidebarTouchMove, { passive: false });
  dragHandle.addEventListener('touchend', handleSidebarTouchEnd, { passive: true });
}

function handleSidebarTouchStart(e) {
  const sidebar = document.getElementById('sidebar');
  touchStartY = e.touches[0].clientY;
  sidebarStartY = sidebar.getBoundingClientRect().top;
  isDraggingSidebar = true;
  sidebar.classList.add('dragging');
}

function handleSidebarTouchMove(e) {
  if (!isDraggingSidebar) return;
  
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - touchStartY;
  
  if (deltaY > 0) {
    e.preventDefault();
    const sidebar = document.getElementById('sidebar');
    const maxTranslate = window.innerHeight * 0.75;
    const translate = Math.min(deltaY, maxTranslate);
    sidebar.style.transform = `translateY(${translate}px)`;
  }
}

function handleSidebarTouchEnd(e) {
  if (!isDraggingSidebar) return;
  
  isDraggingSidebar = false;
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('dragging');
  
  const transform = sidebar.style.transform;
  const match = transform.match(/translateY\((\d+)px\)/);
  const translateY = match ? parseInt(match[1]) : 0;
  
  sidebar.style.transform = '';
  
  // If dragged more than 100px, close sidebar
  if (translateY > 100) {
    closeSidebar();
  }
}

// ==================== LIGHTBOX ====================

function openLightbox(caps, index, breweryName) {
  lightboxCaps = caps;
  lightboxCurrentIndex = index;
  lightboxBreweryName = breweryName;
  
  updateLightboxContent();
  
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // Force reflow for animation
  lightbox.offsetHeight;
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

function updateLightboxContent() {
  const cap = lightboxCaps[lightboxCurrentIndex];
  const capName = cap.replace(/\.(jpe?g|png|gif)$/i, '');
  
  const img = document.querySelector('.lightbox-image');
  img.src = `data/images/${encodeURIComponent(cap)}`;
  
  document.querySelector('.lightbox-beer-name').textContent = capName;
  document.querySelector('.lightbox-brewery-name').textContent = lightboxBreweryName;
  
  // Update or create counter
  let counter = document.querySelector('.lightbox-counter');
  if (!counter) {
    counter = document.createElement('div');
    counter.className = 'lightbox-counter';
    document.querySelector('.lightbox-info').appendChild(counter);
  }
  counter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxCaps.length}`;
  
  // Show/hide nav buttons
  const showNav = lightboxCaps.length > 1;
  document.querySelector('.lightbox-nav.prev').style.display = showNav ? 'flex' : 'none';
  document.querySelector('.lightbox-nav.next').style.display = showNav ? 'flex' : 'none';
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
  lightbox.querySelector('.lightbox-nav.prev').addEventListener('click', (e) => {
    e.stopPropagation();
    lightboxPrev();
  });
  lightbox.querySelector('.lightbox-nav.next').addEventListener('click', (e) => {
    e.stopPropagation();
    lightboxNext();
  });
  
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
  
  // Touch swipe for lightbox
  initLightboxTouch();
}

function initLightboxTouch() {
  const lightbox = document.getElementById('lightbox');
  const content = lightbox.querySelector('.lightbox-content');
  
  let startX = 0;
  let startY = 0;
  let distX = 0;
  let distY = 0;
  
  content.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    distX = 0;
    distY = 0;
  }, { passive: true });
  
  content.addEventListener('touchmove', (e) => {
    distX = e.touches[0].clientX - startX;
    distY = e.touches[0].clientY - startY;
  }, { passive: true });
  
  content.addEventListener('touchend', () => {
    const threshold = 50;
    
    // Horizontal swipe
    if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) > threshold) {
      if (distX > 0) {
        lightboxPrev();
      } else {
        lightboxNext();
      }
    }
    // Vertical swipe down to close
    else if (distY > threshold * 2) {
      closeLightbox();
    }
  }, { passive: true });
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

  // Collect all breweries
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

  navigationStack = [];
  updateUrlState({ country: name });
  
  renderSidebar({
    title: name,
    subtitle: null,
    breweries: allBreweries
  });
}

function showCityBreweries(cityName, cityData, countryName) {
  const breweries = cityData.breweries.map(b => ({
    name: b.name,
    city: null,
    caps: b.caps
  }));

  navigationStack = [{ type: 'country', name: countryName }];
  updateUrlState({ country: countryName, city: cityName });

  renderSidebar({
    title: cityName,
    subtitle: countryName,
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
  
  // Try to restore from URL, otherwise show dashboard
  if (!restoreFromUrl()) {
    renderDashboard();
  }
});

// Handle resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    map.invalidateSize();
  }, 250);
});
