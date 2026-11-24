#!/usr/bin/env python3
"""Envía comandos al ESP32 por serie y muestra su salida.  Uso: serial.py [segundos] [comando ...]"""
import sys, time, glob, serial

port = (glob.glob('/dev/cu.usbmodem*') + glob.glob('/dev/ttyACM*'))[0]
secs = float(sys.argv[1]) if len(sys.argv) > 1 else 5
s = serial.Serial(port, 115200, timeout=0.1)
time.sleep(0.3)
for cmd in sys.argv[2:]:
    s.write((cmd + '\n').encode()); time.sleep(0.3)
end = time.time() + secs
while time.time() < end:
    data = s.read(4096)
    if data:
        sys.stdout.write(data.decode('utf-8', 'replace')); sys.stdout.flush()
