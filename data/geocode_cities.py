import csv
import os
import time
from geopy.geocoders import Nominatim
from shapely.geometry import Point
from shapely.wkt import dumps

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

raw_csv_path = os.path.join(BASE_DIR, 'raw.csv')
cities_csv_path = os.path.join(BASE_DIR, 'cities.csv')

# Initialize geolocator
geolocator = Nominatim(user_agent="bierdopjes_city_geocoder")

# Load already geocoded cities from cities.csv
geocoded_cities = set()
if os.path.exists(cities_csv_path):
    with open(cities_csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            city = row['city'].strip()
            geocoded_cities.add(city)

# Find unique (city, country) from raw.csv
unique_cities = set()
with open(raw_csv_path, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter=';')
    for row in reader:
        city = row['City'].strip()
        country = row['Country'].strip()
        unique_cities.add( (city, country) )

# Open cities.csv for appending new geocoded cities
file_exists = os.path.exists(cities_csv_path)
with open(cities_csv_path, 'a', newline='', encoding='utf-8') as f:
    fieldnames = ['city', 'geometry']
    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')

    # Write header if file is empty/new
    if not file_exists or os.stat(cities_csv_path).st_size == 0:
        writer.writeheader()

    for city, country in unique_cities:
        if city in geocoded_cities:
            continue  # already geocoded

        # Geocode
        try:
            query = f"{city}, {country}"
            location = geolocator.geocode(query)
            if location:
                point = Point(location.longitude, location.latitude)
                wkt_point = dumps(point)
                writer.writerow({'city': city, 'geometry': wkt_point})
                print(f"Geocoded {query} -> {wkt_point}")
                geocoded_cities.add(city)
            else:
                print(f"Failed to geocode: {query}")
        except Exception as e:
            print(f"Error geocoding {query}: {e}")

        time.sleep(1)  # be kind to Nominatim server
