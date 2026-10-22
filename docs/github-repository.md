# GitHub repository metadata

Owner-chosen 2026-10-21 and applied to <https://github.com/Shilo/pixelate> (MIT, `OWN-008`). The same description is the README tagline, the app's `<meta name="description">` and its start screen (`emptyTitle` and `emptyLead` in `app/src/lib/copy.js`); change them together.

**Description** (165 characters):

> Every pixel is a true pixel. Turn AI-generated or handmade images into real pixel art at the exact size you choose, with a clean palette and no generative AI needed.

**Topics** (20, GitHub's maximum):

`pixel-art`, `pixel-art-converter`, `pixelation`, `downscaling`, `image-processing`, `ai-art`, `grid-detection`, `color-quantization`, `color-palette`, `background-removal`, `sprites`, `gamedev`, `digital-art`, `deterministic`, `local-first`, `privacy`, `web-app`, `svelte`, `vite`, `javascript`

Apply and verify:

```sh
gh repo edit Shilo/pixelate --description "Every pixel is a true pixel. Turn AI-generated or handmade images into real pixel art at the exact size you choose, with a clean palette and no generative AI needed." --add-topic pixel-art,pixel-art-converter,pixelation,downscaling,image-processing,ai-art,grid-detection,color-quantization,color-palette,background-removal,sprites,gamedev,digital-art,deterministic,local-first,privacy,web-app,svelte,vite,javascript
gh repo view Shilo/pixelate --json description,repositoryTopics
```

Every topic describes the project as it is today. GitHub reads the MIT licence from `LICENSE`, so no licence topic is needed.
