import http.server
import socketserver
import os

PORT = 8080

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Dodajemy nagłówki omijające cache, żeby przeglądarka zawsze ładowała najnowszy kod
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

# Zapewnienie poprawnego typu MIME dla plików WebAssembly (częsty błąd w starych serwerach)
CustomHTTPRequestHandler.extensions_map.update({
    '.wasm': 'application/wasm',
})

# Uruchomienie serwera
with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
    print("="*50)
    print(f"🚀 Lokalny serwer uruchomiony na porcie {PORT}")
    print(f"📂 Serwuję pliki z katalogu: {os.getcwd()}")
    print("="*50)
    print("Aby otworzyć to na telefonie z włączoną kamerą, potrzebujesz HTTPS.")
    print("Skorzystaj z jednego z poniższych narzędzi w nowym oknie terminala:\n")
    print(f"Opcja 1 (Ngrok):  ngrok http {PORT}")
    print(f"Opcja 2 (SSH):    ssh -R 80:localhost:{PORT} nokey@localhost.run")
    print("="*50)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nZatrzymywanie serwera...")
        httpd.server_close()