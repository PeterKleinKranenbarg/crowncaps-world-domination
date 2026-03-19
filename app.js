const map = L.map('map').setView([20, 0], 2);

// Basemap
L.tileLayer('https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=IAPFK9sWNdeiCqW4Dnj4#1.0/0.00000/0.00000', {
  attribution: '&copy; OpenStreetMap contributors &copy; MapTiler'
}).addTo(map);
// L.tileLayer('https://api.maptiler.com/maps/base-v4/?key=IAPFK9sWNdeiCqW4Dnj4#1.0/0.00000/0.00000', {
//   tileSize: 512,
//   zoomOffset: -1,
//   attribution: '&copy; OpenStreetMap contributors &copy; MapTiler'
// }).addTo(map);
// L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
//   attribution: '&copy; OpenStreetMap contributors &copy; Stadia Maps'
// }).addTo(map);

// Search index - will be populated after data loads
let searchIndex = [];
let globalCapsData = null;
let globalWorldData = null;
let countryLayers = {};

// Build search index from caps data
function buildSearchIndex(capsData) {
  const index = [];
  
  for (const country in capsData) {
    for (const cityName in capsData[country].cities) {
      const city = capsData[country].cities[cityName];
      
      for (const brewery of city.breweries) {
        // Add brewery to index
        index.push({
          type: 'brewery',
          name: brewery.name,
          country: country,
          city: cityName,
          lat: city.lat,
          lon: city.lon,
          brewery: brewery
        });
        
        // Add each beer/cap to index
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

// Search function
function performSearch(query) {
  if (!query || query.length < 2) return [];
  
  const lowerQuery = query.toLowerCase();
  const results = searchIndex.filter(item => 
    item.name.toLowerCase().includes(lowerQuery)
  );
  
  // Sort results: exact matches first, then by name
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase().startsWith(lowerQuery);
    const bExact = b.name.toLowerCase().startsWith(lowerQuery);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Limit results to prevent performance issues
  return results.slice(0, 50);
}

// Render search results
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
  
  // Add click handlers
  resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      handleSearchResultClick(results[idx]);
    });
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Handle search result click
function handleSearchResultClick(result) {
  // Close search results
  document.getElementById('search-results').classList.remove('active');
  document.getElementById('search-input').value = '';
  
  // Zoom to location
  map.setView([result.lat, result.lon], 10);
  
  // Remove existing city markers
  if (cityLayer) {
    cityLayer.remove();
    cityLayer = null;
  }
  
  // Add a marker for the selected city
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
  
  // Show sidebar with the brewery expanded and the cap highlighted if it's a beer search
  showSearchResult(result);
}

// Show search result in sidebar
function showSearchResult(result) {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.display = 'block';
  
  const cityData = globalCapsData[result.country].cities[result.city];
  const sortedBreweries = cityData.breweries.slice().sort((a, b) => a.name.localeCompare(b.name));
  
  // Find the index of the brewery in the sorted list
  const breweryIndex = sortedBreweries.findIndex(b => b.name === result.brewery.name);
  
  let html = `
    <button id="close-sidebar" title="Close sidebar">&times;</button>
    <h2>${result.city}</h2>
    <p style="color:#666; margin-top:-10px; font-size:14px;">${result.country}</p>
    <ul style="list-style:none; padding-left:0;">
  `;
  
  sortedBreweries.forEach((brewery, index) => {
    const isTargetBrewery = brewery.name === result.brewery.name;
    html += `
      <li style="margin-bottom:8px;">
        <button class="brewery-btn" data-index="${index}" style="background:none; border:none; color:blue; cursor:pointer; text-decoration:underline; font-size:16px; ${isTargetBrewery ? 'font-weight:bold;' : ''}">
          ${brewery.name}
        </button>
        <div class="caps" id="caps-${index}" style="display:${isTargetBrewery ? 'block' : 'none'}; margin-top:5px;">
          ${isTargetBrewery ? generateCapsHtml(brewery, result.type === 'beer' ? result.capImage : null) : ''}
        </div>
      </li>
    `;
  });
  
  html += `</ul>`;
  sidebar.innerHTML = html;
  
  // Add close button event
  document.getElementById('close-sidebar').addEventListener('click', () => {
    sidebar.style.display = 'none';
  });
  
  // Stop map zoom/pan when clicking inside sidebar
  sidebar.addEventListener('click', e => {
    e.stopPropagation();
  });
  
  // Add click event listeners to brewery buttons
  document.querySelectorAll('.brewery-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const idx = e.target.dataset.index;
      toggleCaps(sortedBreweries[idx], idx);
    });
  });
  
  // Scroll to the brewery if needed
  if (breweryIndex >= 0) {
    setTimeout(() => {
      const breweryElement = document.querySelector(`[data-index="${breweryIndex}"]`);
      if (breweryElement) {
        breweryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
}

// Generate HTML for caps with optional highlighting
function generateCapsHtml(brewery, highlightCap = null) {
  let html = '';
  brewery.caps.forEach(capImg => {
    const capName = capImg.replace(/\.(jpe?g|png|gif)$/i, '');
    const isHighlighted = highlightCap === capImg;
    
    html += `
      <div style="display:inline-block; margin:5px; text-align:center; cursor:pointer; ${isHighlighted ? 'background-color:#ffffcc; padding:5px; border-radius:8px; border:2px solid #ffcc00;' : ''}">
        <img 
          src="data/images/${capImg}" 
          style="width:80px; border:1px solid #ccc; border-radius:4px;" 
          alt="Cap image"
          onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none';"
        />
        <div style="display:${isHighlighted ? 'block' : 'none'}; font-size:12px; margin-top:4px; color:#333;">
          ${capName}
        </div>
      </div>
    `;
  });
  return html;
}

// Initialize search
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
  
  // Keyboard navigation
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
  
  // Close search results when clicking outside
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

// Load your data
Promise.all([
  fetch('data/world.geojson').then(r => r.json()),
  fetch('data/beercaps.json').then(r => r.json())
]).then(([world, capsData]) => {
  
  // Store data globally for search
  globalCapsData = capsData;
  globalWorldData = world;
  
  // Build search index
  searchIndex = buildSearchIndex(capsData);
  
  // Initialize search functionality
  initSearch();
  
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

let cityLayer = null;
let currentCountryLayer = null;
function zoomToCountry(layer, name, capsData) {
  // map.fitBounds(layer.getBounds(), { padding: [20, 20] });

  // Remove previous city layer if exists
  if (cityLayer) {
    cityLayer.remove();
    cityLayer = null;
  }

  const cities = capsData[name]?.cities;
  if (!cities) return;

  // Build markers for cities as before
  const markers = [];
  const capsCounts = Object.values(cities).map(city =>
    city.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0)
  );
  if (capsCounts.length === 0) return;

  let totalCapsInCountry = 0;
  let maxCapsInCountry = 0;

  for (const cityName in cities) {
    const c = cities[cityName];
    totalCapsInCountry += c.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0);
    maxCapsInCountry = Math.max(c.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0), maxCapsInCountry);
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
      .on('click', () => showCityBreweries(cityName, c));

    markers.push(circle);
  }

  cityLayer = L.layerGroup(markers).addTo(map);
  currentCountryLayer = layer;

  // --- NEW: List ALL breweries in the country, alphabetically, in the sidebar ---

  const sidebar = document.getElementById('sidebar');
  sidebar.style.display = 'block';

  // Collect all breweries from all cities in this country
  let allBreweries = [];
  for (const cityName in cities) {
    const cityBreweries = cities[cityName].breweries.map(brewery => ({
      name: brewery.name,
      city: cityName,
      caps: brewery.caps
    }));
    allBreweries = allBreweries.concat(cityBreweries);
  }

  // Sort breweries alphabetically by name
  allBreweries.sort((a, b) => a.name.localeCompare(b.name));

  let html = `<h2>Breweries in ${name}</h2><ul style="list-style:none; padding-left:0;">`;

  allBreweries.forEach((brewery, index) => {
    html += `
      <li style="margin-bottom:8px;">
        <button class="brewery-btn" data-index="${index}" style="background:none; border:none; color:blue; cursor:pointer; text-decoration:underline; font-size:16px;">
          ${brewery.name} <small style="color:#555;">(${brewery.city})</small>
        </button>
        <div class="caps" id="caps-${index}" style="display:none; margin-top:5px;"></div>
      </li>
    `;
  });

  html += '</ul>';

  sidebar.innerHTML = html;

  // Add click event listeners to brewery buttons
  document.querySelectorAll('.brewery-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const idx = e.target.dataset.index;
      toggleCaps(allBreweries[idx], idx);
    });
  });
}




function showCityBreweries(cityName, cityData) {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.display = 'block'; // show sidebar

  // Sort breweries alphabetically by name
  const sortedBreweries = cityData.breweries.slice().sort((a, b) => a.name.localeCompare(b.name));

  // Sidebar content with close button
  let html = `
    <button id="close-sidebar" title="Close sidebar">&times;</button>
    <h2>${cityName}</h2>
    <ul style="list-style:none; padding-left:0;">
  `;

  sortedBreweries.forEach((brewery, index) => {
    html += `
      <li style="margin-bottom:8px;">
        <button class="brewery-btn" data-index="${index}" style="background:none; border:none; color:blue; cursor:pointer; text-decoration:underline; font-size:16px;">
          ${brewery.name}
        </button>
        <div class="caps" id="caps-${index}" style="display:none; margin-top:5px;"></div>
      </li>
    `;
  });

  html += `</ul>`;

  sidebar.innerHTML = html;

  // Add close button event
  document.getElementById('close-sidebar').addEventListener('click', () => {
    sidebar.style.display = 'none';
  });

  // Stop map zoom/pan when clicking inside sidebar
  sidebar.addEventListener('click', e => {
    e.stopPropagation();
  });

  // Add click event listeners to brewery buttons
  document.querySelectorAll('.brewery-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const idx = e.target.dataset.index;
      toggleCaps(sortedBreweries[idx], idx);  // <-- Use sortedBreweries here
    });
  });
}


function toggleCaps(brewery, index) {
  const capsDiv = document.getElementById(`caps-${index}`);
  if (!capsDiv) return;

  if (capsDiv.style.display === 'none') {
    // Show caps
    let html = '';
    brewery.caps.forEach(capImg => {
      html += `<img src="data/images/${capImg}" style="width:80px; margin:5px; border:1px solid #ccc; border-radius:4px;" alt="Cap image" />`;
    });
    capsDiv.innerHTML = html;
    capsDiv.style.display = 'block';
  } else {
    // Hide caps
    capsDiv.style.display = 'none';
  }
}

function toggleCaps(brewery, index) {
  const capsDiv = document.getElementById(`caps-${index}`);
  if (!capsDiv) return;

  if (capsDiv.style.display === 'none') {
    // Show caps with clickable images revealing the name
    let html = '';
    brewery.caps.forEach(capImg => {
      // Extract the cap name from the filename (remove extension)
      const capName = capImg.replace(/\.(jpe?g|png|gif)$/i, '');

      html += `
        <div style="display:inline-block; margin:5px; text-align:center; cursor:pointer;">
          <img 
            src="data/images/${capImg}" 
            style="width:80px; border:1px solid #ccc; border-radius:4px;" 
            alt="Cap image"
            onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none';"
          />
          <div style="display:none; font-size:12px; margin-top:4px; color:#333;">
            ${capName}
          </div>
        </div>
      `;
    });
    capsDiv.innerHTML = html;
    capsDiv.style.display = 'block';
  } else {
    // Hide caps
    capsDiv.style.display = 'none';
  }
}
