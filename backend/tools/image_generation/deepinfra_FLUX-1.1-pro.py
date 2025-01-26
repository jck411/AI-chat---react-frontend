import os
import requests
from dotenv import load_dotenv

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("DEEPINFRA_TOKEN")

# API endpoint for the FLUX-1.1-pro model
url = "https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1.1-pro"

# Headers for the request
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Payload with parameters for image generation
payload = {
    "prompt": "a yorkie in space suit in outer space trying to catch a tennis ball no gravity",  # Main text prompt
    "width": 512,  # Width of the generated image in pixels
    "height": 512,  # Height of the generated image in pixels
    "prompt_upsampling": True,  # Whether to perform upsampling on the prompt
    "seed": None,  # Optional seed for reproducibility
    "safety_tolerance": 6,  # Moderation level (0 = strictest, 6 = least strict)
}

def download_image(image_url, filename="generated_image.png"):
    try:
        # Send GET request to download the image
        response = requests.get(image_url, stream=True)
        response.raise_for_status()

        # Write the image to a file
        with open(filename, "wb") as file:
            for chunk in response.iter_content(chunk_size=8192):
                file.write(chunk)
        print(f"Image saved as '{filename}'.")
    except requests.exceptions.RequestException as e:
        print(f"Failed to download the image: {e}")

def main():
    try:
        # Send POST request to generate image
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raise HTTPError for bad responses

        # Parse JSON response
        result = response.json()
        image_url = result.get("image_url")

        if image_url:
            # Download and save the image
            download_image(image_url)
        else:
            print("Image URL not found in the response.")

    except requests.exceptions.RequestException as e:
        print(f"HTTP Request failed: {e}")
    except KeyError:
        print("Unexpected response format.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
