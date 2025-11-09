const map = L.map('map').setView([20, 0], 2);

// Basemap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 10
}).addTo(map);

// Load your data
Promise.all([
  fetch('data/world.geojson').then(r => r.json()),
  fetch('data/beercaps.json').then(r => r.json())
]).then(([world, capsData]) => {
  
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

  for (const cityName in cities) {
    const c = cities[cityName];
    totalCapsInCountry += c.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0);
  }

  for (const cityName in cities) {
    const c = cities[cityName];
    const totalCaps = c.breweries.reduce((sum, brewery) => sum + brewery.caps.length, 0);
    const radiusMeters = Math.max(3, totalCaps);

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
