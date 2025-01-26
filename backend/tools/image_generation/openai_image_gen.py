import os
import requests
import base64
from dotenv import load_dotenv

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")

# API endpoint for OpenAI's image generation
url = "https://api.openai.com/v1/images/generations"

# Headers for the request
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Payload with all possible parameters for image generation
payload = {
    "prompt": "a yorkie on the moon",  # Description of the image
    "model": "dall-e-3",  # Model to use for image generation (options: "dall-e-2", "dall-e-3")
    "n": 1,  # Number of images to generate (1–10 for dall-e-2, only 1 for dall-e-3)
    "quality": "hd",  # Image quality (options: "standard", "hd" for dall-e-3 only)
    "response_format": "b64_json",  # Format for generated images (options: "url", "b64_json")
    "size": "1024x1024",  # Image size (options: "256x256", "512x512", "1024x1024" for dall-e-2, or others for dall-e-3)
    "style": "natural",  # Style of the image (options: "vivid", "natural" for dall-e-3 only)
    "user": "example-user-id",  # Optional: unique identifier for tracking the user
}

def main():
    try:
        # Send POST request to generate the image
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raise HTTPError for bad responses

        # Parse JSON response
        result = response.json()

        # Decode and save images
        for i, image_data in enumerate(result["data"]):
            image_content = image_data["b64_json"]
            image_filename = f"generated_image_{i+1}.png"
            with open(image_filename, "wb") as image_file:
                image_file.write(base64.b64decode(image_content))
            print(f"Image saved as '{image_filename}'.")

    except requests.exceptions.RequestException as e:
        print(f"HTTP Request failed: {e}")
    except KeyError as e:
        print(f"Unexpected response format: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
