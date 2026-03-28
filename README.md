# 🦯 VisionAssist

**VisionAssist** to inteligentny audio-asystent dla osób niewidomych, który w czasie rzeczywistym wykrywa przeszkody i informuje o nich głosowo. System wykorzystuje model **Metric Depth Anything V2 Large** do analizy głębi i raportuje odległości bezpośrednio w metrach.

## 🚀 Jak uruchomić projekt na laptopie

### 1. Wymagania
- **Python 3.10+**
- **Node.js 18+**
- **GPU NVIDIA** (zalecane dla płynności 10+ FPS, na CPU będzie ~2 FPS)

---

### 2. Konfiguracja Backend (Python)
Otwórz nowy terminal w folderze `backend`:

```powershell
# Wejdź do folderu backend
cd backend

# Aktywuj wirtualne środowisko (venv już utworzyłem)
.\venv\Scripts\activate

# Zainstaluj zależności (może to zająć chwilę - pobiera PyTorch i modele)
pip install -r requirements.txt

# Uruchom serwer
python main.py
```
*Serwer będzie dostępny pod adresem: `http://localhost:8000`*

---

### 3. Konfiguracja Frontend (React)
Otwórz drugi terminal w folderze `frontend`:

```powershell
# Wejdź do folderu frontend
cd frontend

# Zainstaluj zależności Node
npm install

# Uruchom aplikację w sieci lokalnej po HTTPS
npm run dev -- --host
```
*Aplikacja będzie dostępna pod adresem: `https://localhost:3000`*

---

### 4. Podłączenie telefonu (Widok Asystenta)

⚠️ **WAŻNE: Kamera na telefonie wymaga HTTPS**
Frontend jest już skonfigurowany pod HTTPS oraz bezpieczny WebSocket (`wss`) przez proxy Vite.

1. Uruchom backend na komputerze (`python main.py`) i frontend (`npm run dev -- --host`).
2. Odczytaj IP komputera (np. `ipconfig`) i na telefonie otwórz:
	- `https://<IP_KOMPA>:3000`
3. Zaakceptuj ostrzeżenie certyfikatu self-signed (tryb deweloperski), żeby przejść do aplikacji.

Połączenie WebSocket do backendu idzie przez ten sam adres HTTPS (czyli `wss://<IP_KOMPA>:3000/ws`), więc nie ma problemu mixed-content.

## 🛠 Architektura
- **Frontend:** React 19 + Vite (UI z glassmorphismem, Web Speech API dla TTS).
- **Backend:** FastAPI + WebSocket (Strumieniowanie klatek).
- **AI:** Depth Anything V2 Metric Small (Indoor/Outdoor) z przełączaniem trybu w UI i wyjściem metrycznym.
- **Integracje:** Software Mansion (Reanimated/Gesture Handler ready).

## 📏 Metryczna głębia i heatmapa
- Widok aplikacji pokazuje obraz kamery oraz heatmapę głębi obok siebie.
- Heatmapa pokazuje wartości z modelu metrycznego (metry), a panel pod heatmapą wyświetla:
	- najbliższy punkt (`Najbliżej`, w metrach),
	- najdalszy punkt (`Najdalej`, w metrach).
- Alerty głosowe i tekstowe podają dystans w metrach (np. `1.4 m`).

### ⚡ Optymalizacja opóźnień
- Inferencja depth jest skonfigurowana pod GPU (`device="cuda"`, TF32, opcjonalnie FP16).
- Heatmapa jest wysyłana rzadziej, domyślnie co 3 klatki (`heatmap_every_n_frames=3`).
- Oba ustawienia zmienisz w `backend/config.py`:
	- `depth.use_fp16`
	- `depth.enable_tf32`
	- `frame.heatmap_every_n_frames`

## 📅 Roadmapa
- [x] Faza 1: Wykrywanie przeszkód (MVP)
- [ ] Faza 2: OCR (tekst) i rozpoznawanie przedmiotów
- [ ] Faza 3: Dynamiczne opisy scen (Gemini Live API)
- [ ] Faza 4: Pełna aplikacja React Native (ExecuTorch)

---

> [!TIP]
> Jeśli obraz na telefonie się nie ładuje, upewnij się, że Windows Firewall nie blokuje portów 3000 i 8000.