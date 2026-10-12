# BlindPass submission videos

Upload these as two separate videos:

- **blindpass-pitch-2min.mp4** — two-minute pitch: problem, solution, Zcash's role, developer opportunity, roadmap, and invitation to pilot collaborators.
- **blindpass-demo-3min.mp4** — three-minute narrated product walkthrough: purchase, simulated payment confirmation, blind credential issuance, paid search, wallet custody, two-client protocol demonstration, transcript separation, abuse checks, and privacy boundaries.

Both use 1920 × 1080 H.264 video, AAC synthetic English narration, burned-in captions, and separate SRT files. Matching scripts are included. Visuals reuse captured application screenshots with motion from the original five-minute video; this is a narrated walkthrough rather than a continuous live screen recording. Chapter numbering and progress indicators are specific to each video.

Payment confirmation is simulated; the source capture exercised real credential issuance and redemption. These videos do not demonstrate a live Zcash transaction. Future integrations and external security review are described as roadmap items. Neither video claims existing customers or total anonymity.

Rebuild from the repository root:

```bash
python artifacts/pitch-video/split-submission.py
```

Requires FFmpeg, fontconfig, and the original generated assets in `artifacts/pitch-video/`. No new voice generation or app changes are required.
