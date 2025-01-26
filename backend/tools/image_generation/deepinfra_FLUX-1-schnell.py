import base64
import os
import requests
from dotenv import load_dotenv

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("DEEPINFRA_TOKEN")

# API endpoint for the FLUX-1-schnell model
url = "https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-schnell"

# Headers for the request
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Payload with parameters for image generation
payload = {
    "prompt": "a yorkie with alcohol",  # Main text prompt
    "num_images": 1,  # Number of images to generate (default: 1)
    "num_inference_steps": 4,  # Number of denoising steps (default: 1; range: 1 to 50)
    "width": 512,  # Width of the generated image in pixels (default: 1024; range: 128 to 2048)
    "height": 512,  # Height of the generated image in pixels (default: 1024; range: 128 to 2048)
    "seed": None,  # Optional seed for reproducibility
    # "webhook": None,  # Optional: URL to call when inference is done
}

def main():
    try:
        # Send POST request to generate image
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raise HTTPError for bad responses

        # Parse JSON response
        result = response.json()
        images = result.get("images", [])

        if images:
            # Decode and save the image
            image_data = images[0].split(",")[1]  # Extract base64 data
            with open("generated_image.png", "wb") as image_file:
                image_file.write(base64.b64decode(image_data))
            print("Image saved as 'generated_image.png'.")
        else:
            print("No images found in the response.")

    except requests.exceptions.RequestException as e:
        print(f"HTTP Request failed: {e}")
    except KeyError:
        print("Unexpected response format.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
