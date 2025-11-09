import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

beercaps_path = os.path.join(BASE_DIR, "beercaps.json")
images_dir = os.path.join(BASE_DIR, "images")

# Load the JSON
with open(beercaps_path, "r", encoding="utf-8") as f:
    data = json.load(f)

# Collect all image filenames used in the JSON
used_images = set()

for country, cdata in data.items():
    for city, citydata in cdata["cities"].items():
        for brewery in citydata["breweries"]:
            for img in brewery["caps"]:
                used_images.add(img)

# List all images in the directory
all_files = set(os.listdir(images_dir))

# Detect unused files (case-sensitive!)
unused = sorted(all_files - used_images)

print("=== Unused image files ===")
if not unused:
    print("✅ No unused images found!")
else:
    for filename in unused:
        print(filename)
