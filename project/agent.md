Budujemy aplikacje
ogolne dzialanie

wspomaganie osob niewidzacych przez model do wykrywanie przeszkod(1 endpoint) + drugi endpoint do obserwowania kamerki poruszajacej sie osoby niewidomej przez asystenta
+ trzeci endpoint statystyki dzialania modelu

zalozenie dzialania
- uzytkownik(niewidomy) z kamera z telefonu przesyla in real time nagranie (do przesylu uzywamy narzedzia Smelter) na backend(endpoint 1)
 - na backendzie mamy model ktory szacuje odleglosci i
 jesli wykryje przeszkode blisko to wysle komunikat glosowy o niebezpieczenstwie do uzytkownika, dodatkowo ekran uzytkownika jest przesylany(tez Smelter) na drugi endpoint do opiekuna, na drugim endpoincie opiekun widzi real time stream z ekrana uzytkownika, po prawej stornie ma chat gdzie sa pokazane komunikaty jakie wyslal model do uzytkownika(maks co 2 sekundy komunikat), ponizej jest mapa z pokazana lokalizacja uzytkownika, w ostatnim wolnym miejscu ma przycisk przez ktory sam moze przeslac komunikat glosowy do uzytkownika, na panelu uzytkownika niewidomy ma tez mozliwosc powiedzenia komendy glosowej (opowiedz o okolicy), wtedy z backendu poleci zapytanie do gemini live z lokalizacja i zdjeciem z kamerki zeby on opowiedzial co sie dzieje aktulnie, model ktory sprawdza czy nie ma przeszkody ma zalezy od tego czy uzytkownika jest wewnatrz czy na zewnatrz, o to powinnismy pytac gemini live (zdjecia wysylamy)
 - trzeci endpoint rozszerzony endpoint asystaneta, w prawym gornym ekranie maja byc wyniki modelu (tzn podczerwien czy tam cokolwiek on zwroci jak szacuje odleglosc), na lewo na dole ma byc gemini live ktory real time opisuje co sie dzieje u niewodomego uzytkownika(request co sekunde z nowmy zdjeciem) proste instrukcje np user idzie prosto, user skrecil itp, prawo gora ma byc taka sama transmisja wizji uzytkownika (Smelter) co jest przekazywana dla asystenta, na prawym dole maja byc wykresy sprawnosci dziala modelu(czas odpowiedzi) i odpowiedzi z gemini(tez czas odpowiedzi) albo jakies inne dane pokazujace health i dzialanie modelu - diagnostics itp, calosc stylu frontentowego neobrutalism, tailwindcss, frontend react, sdk do smeltera reactowe, model ktory liczy odleglosci - depth anything v2 w tej duzej wersji, chcemy zeby oczywiscie wszystko dzialalo jak najszybciej, smelter nie ma wersji na windowsy a ja jestem na windowsie, ale mam docker na wsl moze zadziala, na razie live obraz z uzytkownia hardkoujemy(zostaw folder gdzie wrzuca plik mp4), hardkodujemy tez respony od gemini(moga byc na razie losowe i przychodzi ze stala odlegloscia czasowa), jak smeltera nie zadziala u mnie to moze go tez jakos zahardkowac na razie

 stworz cala aplikacje, jesli masz jakies watpliwosci albo pytania to napisz przed implementacja to dopisze szczegoly, pamietaj ze czesc rzeczy na razie mockujemy, dobrze by bylo rozbic te zmockowane rzeczy w oddzielnych modulach zeby potem mozna byla latwo to dopisac, dopisz do zahardkodowanych rzeczy czego dokladnie oczekuje danych(zeby potem bylo latwo dopisac) aplikacja webowa, pythona FastAPI react, przeanalizuj i zadaj pytania jesli masz a jesli nie to implementuj moze byc krok po kroku, wtedy stworz sobie plan implementacji




 1. https://github.com/software-mansion/smelter 
 Quick start
You can use Smelter in a few ways, however we recommend the TypeScript SDK as the best option to get started. If you are not sure what is the best choice for you check out this page for comparison of different setups.

TypeScript SDK
TypeScript SDK is a set of libraries that provide React components you can use to control how Smelter manipulates videos. Currently, we support running it in a Node.js environment and a browser.

You can generate a new starter project using the following command:

npm
pnpm
yarn
bun
npx create-smelter-app

To learn more, explore TypeScript SDK documentation or check out step-by-step guides.

Standalone
You can use Smelter as a standalone multimedia server. The server can be started by:

Building from sources github.com/software-mansion/smelter.
Using binaries from GitHub releases.
Using Docker ghcr.io/software-mansion/smelter.
Membrane Framework plugin
Membrane is a multimedia processing framework written in Elixir. You can use it with Smelter via membrane_smelter_plugin. It integrates a Smelter server into the Membrane pipeline.

See membrane.stream/learn to learn how to get started with Membrane.
Plugin documentation - membrane_smelter_plugin
Core membrane documentation - membrane_core
jest na repo tez .claude.md mozemy zaciagnac to jesli chcesz lepiej ogarnac w smeltera

2. model stawiamy lokalnie, na razie moze dzialac srednio bedziemy to potem ustawaic, pamietaj o venvie.  https://github.com/DepthAnything/Depth-Anything-V2/tree/main/metric_depth#pre-trained-models

3. glos od uzytkownika, to twoj wybor ja sie na tym nie znam, jakos to telefon musi wylapac, mozemy ustawic ze uzytkownik klika jakis przycisk na telefonie i wtedy dopiero wlacza sie nasluchiwnaie(na razie nasluchiwanie mozemy pominac, mozemy zbudowac przycisk ktory po prostu wysle 'opisz okolice' request)
glos do uzytkwonika jakkolwiek, potem najwyzej zmienimy

4. opiekun mowi in real time do uzytkownika, jakby prowadzili rozmowe telefoniczna

5. beda mial kluc, na razie nie mam, moze napisac api do gemini ale bedziemy uzywac zmockowanych requestow

6. mapa openstreetmap, moze byc react leaflet, lokalizacja mockowana np w Krakowie Polska ale ma sie przemieszczac na czas mockowania np 2m/s, zabdaj o odpowiednie scalowanie mapy na panelu asystenta w zaleznosci od predkosci poruszania, jesli sie da to bedziemy sciagac dane lokalizacyjne z przegladarki - google chrome

7. moze byc 3 strony react, zakladam ze /stats i /assitant nie beda odpalone na raz zeby nie przeciazac modelu/smeltera, jesli bedzie duzo obciazanie na smeltrze mozemy uzyc https://github.com/fishjam-dev/fishjam 


polaczenie user-assistant duplex, dziala dwustronie, mozemy dodac u uzytkownika drugi przycsik na 'get help' ktory 'zadzwoni' do opiekuna, wtedy tez bedzie polaczenie, odleglosc od testow 2 m

claude.md z smeltera 
# CLAUDE.md

## Project Overview

Smelter is a toolkit for real-time, low-latency, programmable video and audio composition. It combines multimedia from different sources into a single video or live stream, with support for text, custom shaders, and embedded websites.

## Architecture

**Core pipeline:**
- **`smelter` (root)** — HTTP server (Axum). Parses config, proxies calls to `smelter-core` Pipeline.
- **`smelter-api`** — HTTP request/response types with JSON serde. Converts API types to `smelter-core`/`smelter-render` types. Also used by `smelter-render-wasm`.
- **`smelter-core`** — Main library. Pipeline management, queue logic, encoding/decoding, muxing/transport protocols, audio mixing. Uses `smelter-render` for composition.
- **`smelter-render`** — GPU rendering engine (wgpu). Takes input frames → produces composed output frames. Handles YUV/NV12↔RGBA conversion, scene layout, animations/transitions. Two core entrypoints: `Renderer::render` and `Renderer::update_scene`.
- **`smelter-render-wasm`** — WASM wrapper around `smelter-render` for browser use.

**Libraries:**
- **`vk-video`** — Vulkan Video hardware codec (H.264 decode/encode), Linux/Windows only.
- **`libcef`** — Chromium Embedded Framework bindings (web rendering in compositions).
- **`decklink`** — DeckLink SDK bindings for Blackmagic capture cards.
- **`rtmp`** — RTMP protocol implementation.

**Utilities:**
- **`integration-tests`** — Snapshot tests for rendering and full pipeline. Create includes examples used for manual testing.
- **`tools`** — Internal utilities: `generate_from_types`, `package_for_release`, doc generation.

**Feature flags:** `web-renderer` (default, enables Chromium), `decklink`, `update-snapshots`.

**TypeScript SDK** - See `ts/CLAUDE.md` for details

#### Server control flow

HTTP API `smelter` crate → `smelter-api` (parse) → `smelter-core` (pipeline: inputs, queue, encoders, outputs) → `smelter-render` (GPU composition) → encoded output to transport.

## API Changes

After modifying types in `smelter-api` or types in `smelter-core::stats`, use `/api-change` to run the full generation and validation workflow. to jest .claude.md z smeltera