import os
import base64
import requests
from dotenv import load_dotenv

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("DEEPINFRA_TOKEN")

# API endpoint for the FLUX-pro model
url = "https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-pro"

# Headers for the request
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Payload with parameters for image generation
payload = {
    "prompt": "a pharmacist at work",  # Main text prompt
    "width": 512,  # Width of the generated image in pixels (must be a multiple of 32)
    "height": 512,  # Height of the generated image in pixels (must be a multiple of 32)
    "steps": 25,  # Number of steps for the image generation process (default: 25; range: 1 to 50)
    "prompt_upsampling": False,  # Whether to perform upsampling on the prompt
    "seed": None,  # Optional seed for reproducibility
    "guidance_scale": 3.0,  # Guidance scale for image generation (default: 3; range: 1.5 to 5)
    "safety_tolerance": 6,  # Tolerance level for input and output moderation (0 = most strict, 6 = least strict)
    "interval": 2,  # Increases variance in outputs; higher values produce more dynamic outputs (default: 2; range: 1 to 4)
    # "webhook": None,  # Optional: URL to call when inference is done
}

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
            image_response = requests.get(image_url)
            image_response.raise_for_status()
            with open("generated_image.png", "wb") as image_file:
                image_file.write(image_response.content)
            print("Image saved as 'generated_image.png'.")
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
