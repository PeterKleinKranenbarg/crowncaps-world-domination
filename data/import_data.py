import csv
import json
import os

from shapely import wkt
from shapely.geometry import mapping

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# File paths
raw_csv_path = os.path.join(BASE_DIR, 'raw.csv')
cities_csv_path = os.path.join(BASE_DIR, 'cities.csv')
beercaps_json_path = os.path.join(BASE_DIR, 'beercaps.json')
images_dir = 'images'  # for image file existence checks (optional)



city_geometries = {}

# Load cities lat/lon into a dict: city_name -> (lat, lon)
city_coords = {}
with open(cities_csv_path, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter=';')
    for row in reader:
        city = row['city'].strip()
        wkt_str = row['lat'].strip()  # 'lat' column has WKT POINT string like "POINT (3.0145726 50.9747148)"
        try:
            point = wkt.loads(wkt_str)
            lon, lat = point.coords[0]  # WKT POINT coords are (x=lon, y=lat)
            city_coords[city] = (lat, lon)  # store as (lat, lon) for Leaflet / your code
        except Exception as e:
            print(f"Error parsing WKT for city '{city}': {e}")
            city_coords[city] = (None, None)

# Load raw.csv
with open(raw_csv_path, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter=';')
    raw_rows = list(reader)

# Build the beercaps JSON structure
beercaps_data = {}

for row in raw_rows:
    country = row['Country'].strip()
    city = row['City'].strip()
    brewery = row['Brewery'].strip()
    crowncap = row['Crowncap'].strip()

    if country not in beercaps_data:
        beercaps_data[country] = {'count': 0, 'cities': {}}

    country_data = beercaps_data[country]
    country_data['count'] += 1

    if city not in country_data['cities']:
        lat, lon = city_coords.get(city, (None, None))
        if lat is None or lon is None:
            print(f"Warning: Coordinates for city '{city}' not found. Skipping.")
            # Optionally skip adding this city and continue
            continue
        country_data['cities'][city] = {
            'lat': lat,
            'lon': lon,
            'breweries': []
        }

    city_data = country_data['cities'][city]

    # Find if brewery already exists
    brewery_data = next((b for b in city_data['breweries'] if b['name'] == brewery), None)
    if not brewery_data:
        brewery_data = {'name': brewery, 'caps': []}
        city_data['breweries'].append(brewery_data)

    # Determine cap image filename with .jpeg or .jpg
    jpeg_file = crowncap + '.jpeg'
    jpg_file = crowncap + '.jpg'

    jpeg_path = os.path.join(BASE_DIR, images_dir, jpeg_file)
    jpg_path = os.path.join(BASE_DIR, images_dir, jpg_file)

    if os.path.exists(jpeg_path):
        img_filename = jpeg_file
    elif os.path.exists(jpg_path):
        img_filename = jpg_file
    else:
        print(f"Warning: Image file '{jpeg_file}' or '{jpg_file}' not found.")
        img_filename = None  # no image found

    if img_filename and img_filename not in brewery_data['caps']:
        brewery_data['caps'].append(img_filename)


# Write out beercaps.json
with open(beercaps_json_path, 'w', encoding='utf-8') as f:
    json.dump(beercaps_data, f, indent=2, ensure_ascii=False)

print("Import complete. Updated imported.csv and beercaps.json.")
