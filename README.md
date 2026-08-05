# DFM React PWA

Moderní React PWA postavená přes Vite a vite-plugin-pwa.

## Lokální spuštění

```bash
npm install
npm run dev
```

## Produkční build

```bash
npm run build
```

## GitHub Pages

Projekt obsahuje workflow `.github/workflows/deploy.yml`.

V GitHubu nastav:

1. Settings
2. Pages
3. Source: GitHub Actions

Po každém pushi do `main` se aplikace automaticky sestaví a publikuje.

## Aktualizace PWA

PWA používá `registerType: autoUpdate`. Když je dostupná nová verze, aplikace nabídne její okamžité načtení.

## Data

Data se ukládají lokálně v prohlížeči přes `localStorage`.
