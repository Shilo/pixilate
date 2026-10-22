# Pixilate

Every pixel is a true pixel. Turn AI-generated or handmade images into real pixel art at the exact size you choose, with a clean palette and no generative AI needed.

**Try it:** <https://shilo.github.io/pixilate/>

AI "pixel art" is usually a large image with drifting, blurred, noisy blocks (mixels) at the wrong size. Pixilate recovers the hidden pixel grid when there is one and falls back to a raster reduction when there is not. It outputs a PNG at exactly the width and height you ask for. Conversion is deterministic: the same image and settings give identical pixels. It runs entirely in your browser, and no image leaves your device. Background removal and cropping to the subject are optional and off by default.

## Repository

- [`app/`](app/README.md): the web app (Vite + Svelte 5, JavaScript, GlassKit). Every push to `main` tests it, builds it and publishes it to GitHub Pages.
- [`prototype/`](prototype/README.md): the conversion engine, its plain test harness, tests and benchmarks.
- [`docs/`](docs/planning/product-requirements.md): requirements, plans, research and test results.

## Run locally

Requires Node.js 22.

```sh
cd prototype && npm install && npm test
cd ../app && npm install && npm run dev   # http://localhost:5210
```

## Licence

[MIT](LICENSE). Third-party notices for the app are in [`app/public/THIRD-PARTY-NOTICES.txt`](app/public/THIRD-PARTY-NOTICES.txt).
