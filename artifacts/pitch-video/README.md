# BlindPass five-minute pitch video

Open **blindpass-5-minute-pitch.mp4** in a browser or video player.

- Format: 1920 × 1080, 24 fps, H.264 video and AAC audio.
- Runtime: approximately 5:00, fifteen 20-second chapters.
- Voice: synthetic English narration, Microsoft Edge `en-US-AndrewNeural`.
- Captions: burned into the video; a separate `blindpass-pitch.srt` is included.
- Visuals: edited screenshots captured from the running local application, with gentle motion and chapter transitions. The raw browser recording is retained in `assets/recording/`.
- Payment confirmation is simulated. The capture script exercised real credential issuance and redemption. Replay, forgery, and malicious issuer configuration checks completed successfully; the resulting page text is in `assets/verified-demo.txt`.
- This is a prototype pitch. It does not claim a live on-chain payment, independent security audit, shipped future integrations, or existing customers.

## Edit and rebuild

`scenes.json` contains the narrative and screen selection. `narration.md` is the readable script. `build.py` creates the visuals, voice, captions and final video; `capture.mjs` captures the product flow.

The build requires Python with `edge-tts` and `Pillow`, FFmpeg with libass and libx264, and DejaVu fonts. Voice generation needs network access. Capture requires the repository's Playwright installation and the local application at `http://localhost:3000` with simulated payments enabled. Use an isolated demo database and fresh browser context.

```bash
node artifacts/pitch-video/capture.mjs
python artifacts/pitch-video/build.py
```

Generated voice files are cached. After changing narration, remove the corresponding `assets/voice-NN.mp3` and `assets/words-NN.json` before rebuilding that scene.

The source project was already modified before video creation. Product source files were not intentionally changed for this video.
