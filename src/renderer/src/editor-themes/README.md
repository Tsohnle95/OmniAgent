# Bundled editor themes

These Monaco-native theme definitions are vendored from
[monaco-themes](https://github.com/brijeshb42/monaco-themes) (MIT licensed)
so the editor theme gallery works fully offline.

- `Dracula.json`
- `Monokai.json`
- `Night Owl.json`
- `Nord.json`
- `GitHub Light.json`
- `Solarized-light.json`

They are registered under `curated-*` ids in `../monaco.ts`. To refresh or
extend the set, copy additional `*.json` files from the upstream `themes`
directory and add matching entries to `CURATED_THEME_SOURCES`.
