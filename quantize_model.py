import onnx
from onnxconverter_common import float16

input_model = "depth_anything_v2_single_big.onnx"
output_model = "depth_anything_v2_big_fp16.onnx"

print("1. Ładowanie modelu Float32...")
model = onnx.load(input_model)

print("2. Konwersja do Float16 (z zachowaniem wejścia/wyjścia jako Float32)...")
# keep_io_types=True to klucz! Dzięki temu Twój kod JS (Float32Array) nadal zadziała.
model_fp16 = float16.convert_float_to_float16(model, keep_io_types=True)

print("3. Zapisywanie...")
onnx.save(model_fp16, output_model)

import os
size_mb = os.path.getsize(output_model) / (1024 * 1024)
print(f"Gotowe! 🎉 Twój nowy model waży: {size_mb:.1f} MB")