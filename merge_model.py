import onnx

model_path = "depth_anything_v2_metric_hypersim_vitb.onnx"
single_model_path = "depth_anything_v2_single_big.onnx"

print(f"1. Ładowanie rozdzielonego modelu: {model_path}...")
# Flaga load_external_data=True automatycznie odnajdzie plik .data
model = onnx.load(model_path, load_external_data=True)

print(f"2. Zapisywanie jako pojedynczy plik: {single_model_path}...")
# Wymuszamy zapis wszystkiego wewnątrz jednego pliku
onnx.save_model(model, single_model_path, save_as_external_data=False)

print("Gotowe! Zepsuty podział został naprawiony.")