import base64
import os
import requests
from dotenv import load_dotenv

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("DEEPINFRA_TOKEN")

# API endpoint for the Stability AI SD3.5 model
url = "https://api.deepinfra.com/v1/inference/stabilityai/sd3.5"

# Headers for the request
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# Payload with parameters for image generation
payload = {
    "prompt": "skinny girls playing volleyball",  # Main text prompt
    "negative_prompt": "blurry, low-resolution, overly dark",  # Optional: Prevent specific attributes
    "num_images": 1,  # Optional: Number of images to generate (default: 1)
    "num_inference_steps": 35,  # Optional: Number of steps (default: ~50 for high quality)
    "aspect_ratio": "1:1",  # Optional: Aspect ratio of the image (e.g., "1:1", "16:9")
    "guidance_scale": 7.0,  # Optional: How closely to follow the prompt (higher = stricter)
    "seed": None,  # Optional: Specify seed for reproducibility
    "width": 512,  # Optional: Width of the generated image in pixels (default: model-specific)
    "height": 512,  # Optional: Height of the generated image in pixels (default: model-specific)
    "sampler": "euler_a",  # Optional: Sampling method (e.g., "euler_a", "ddim")
    "controlnet_input_image": None,  # Optional: Base64 image input for ControlNet
    "controlnet_conditioning_scale": 1.0,  # Optional: Weight for ControlNet conditioning
    "mask": None,  # Optional: Base64 mask for inpainting tasks
    "init_image": None,  # Optional: Base64 initial image for image-to-image generation
    "strength": 0.75,  # Optional: How much of the init image is preserved (for image-to-image tasks)
    "upscale": False,  # Optional: Whether to upscale the generated image
}

def main():
    try:
        # Send POST request to generate image
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # Raise HTTPError for bad responses

        # Parse JSON response
        result = response.json()
        image_data = result["images"][0].split(",")[1]  # Extract base64 data

        # Decode and save the image
        with open("generated_image.png", "wb") as image_file:
            image_file.write(base64.b64decode(image_data))
        print("Image saved as 'generated_image.png'.")

    except requests.exceptions.RequestException as e:
        print(f"HTTP Request failed: {e}")
    except KeyError:
        print("Unexpected response format.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()

