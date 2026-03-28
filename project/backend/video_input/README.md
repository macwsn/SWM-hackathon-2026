# video_input/

Place any `.mp4`, `.avi`, or `.mov` video file here.

The backend will loop through it as the mock camera input for the blind user's phone stream.

**Expected real data (Smelter integration):**
- Smelter receives an RTMP or WHIP stream from the user's phone camera
- The `SmelterMock` in `mocks/smelter_mock.py` simulates this with a local file
- See `mocks/smelter_mock.py` for replacement instructions
