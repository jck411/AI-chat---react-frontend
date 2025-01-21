import serial
import time

ser = serial.Serial('/dev/ttyACM1', baudrate=9600, timeout=1)

try:
    print("Sending pairing commands repeatedly...")
    pairing_command = b'\xFE\x05'  # Hypothetical pairing command

    start_time = time.time()
    while time.time() - start_time < 60:  # Keep sending commands for 1 minute
        ser.write(pairing_command)
        time.sleep(1)  # Wait before sending the next command
        response = ser.readline()
        if response:
            print(f"Response: {response.hex()}")
except Exception as e:
    print(f"Error: {e}")
finally:
    ser.close()

