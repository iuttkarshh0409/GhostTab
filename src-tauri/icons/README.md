# Icons (pending)

Required by the Windows (NSIS) build — referenced by `tauri.conf.json`
(`bundle.icon`):

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.ico` (Windows)

These are **not yet generated**. They must exist before `npm run tauri build`
can succeed. Once the Tauri CLI's native binary is available, generate them
from a single square source image (e.g. `source.png`):

    npm run tauri icon source.png

This writes all required icons into this directory. The `identifier` in
`tauri.conf.json` is frozen at `com.ghosttab.app` so that later builds keep the
same WebView user-data directory and preserve existing IndexedDB data.
