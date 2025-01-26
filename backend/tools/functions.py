# tools/functions.py
import os
import json
import requests
import pytz
import inspect
from datetime import datetime
from timezonefinder import TimezoneFinder
from dotenv import load_dotenv
from typing import Callable, Tuple, Dict, Any

load_dotenv()

def check_args(function: Callable, args: dict) -> bool:
    sig = inspect.signature(function)
    params = sig.parameters
    for name in args:
        if name not in params:
            return False
    for name, param in params.items():
        if param.default is param.empty and name not in args:
            return False
    return True

def get_function_and_args(tool_call: dict, available_functions: dict) -> Tuple[Callable, dict]:
    """
    Matches a parsed tool_call dict to the actual Python function + validated arguments.
    """
    function_name = tool_call["function"]["name"]
    function_args = json.loads(tool_call["function"]["arguments"])

    if function_name not in available_functions:
        raise ValueError(f"Function '{function_name}' not found")

    function_to_call = available_functions[function_name]
    if not check_args(function_to_call, function_args):
        raise ValueError(f"Invalid arguments for function '{function_name}'")

    return function_to_call, function_args

def fetch_weather(lat=28.5383, lon=-81.3792, exclude="minutely", units="metric", lang="en"):
    api_key = os.getenv('OPENWEATHER_API_KEY')
    if not api_key:
        raise ValueError("API key not found. Please set OPENWEATHER_API_KEY in your .env file.")

    url = f"https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&appid={api_key}&units={units}&lang={lang}"
    if exclude:
        url += f"&exclude={exclude}"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def get_time(lat=28.5383, lon=-81.3792):
    tf = TimezoneFinder()
    tz_name = tf.timezone_at(lat=lat, lng=lon)
    if not tz_name:
        raise ValueError("Time zone could not be determined for the given coordinates.")
    local_tz = pytz.timezone(tz_name)
    local_time = datetime.now(local_tz)
    return local_time.strftime("%H:%M:%S")

def get_tools():
    """
    Return the tool definitions in the format needed by OpenAI for function calling.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "fetch_weather",
                "description": "Fetch current weather and forecast data...",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "required": ["lat", "lon", "exclude", "units", "lang"],
                    "properties": {
                        "lat": {"type": "number", "description": "Latitude..."},
                        "lon": {"type": "number", "description": "Longitude..."},
                        "exclude": {"type": "string", "description": "Data to exclude..."},
                        "units": {"type": "string", "description": "Units of measurement..."},
                        "lang": {"type": "string", "description": "Language of the response..."}
                    },
                    "additionalProperties": False
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_time",
                "description": "Fetch the current time based on location...",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "required": ["lat", "lon"],
                    "properties": {
                        "lat": {"type": "number", "description": "Latitude..."},
                        "lon": {"type": "number", "description": "Longitude..."}
                    },
                    "additionalProperties": False
                }
            }
        }
    ]

def get_available_functions() -> Dict[str, Callable]:
    """
    Return a mapping of function_name -> actual Python callable.
    """
    return {
        "fetch_weather": fetch_weather,
        "get_time": get_time
    }
