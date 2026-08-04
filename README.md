# DFM v2 – Drone Fleet Manager

Čistý mobilní projekt bez service workeru. Změny se proto načítají standardně z GitHub Pages a aplikace si nedrží starou offline cache.

## Funkce

- Přehled flotily
- Dron jako hlavní technická sestava
- Baterie uvnitř konkrétního dronu
- Příslušenství uvnitř konkrétního dronu
- Nehody, reklamace a servis u dronu
- Piloti
- Letový deník
- Úkoly
- Export a import JSON
- Data uložená v localStorage telefonu

## Nasazení na GitHub Pages

Nahraj obsah této složky přímo do kořene repozitáře. V kořenu musí být soubory `index.html`, `app.css`, `app.js`, `manifest.webmanifest` a složka `icons`.

V GitHubu nastav `Settings → Pages → Deploy from a branch → main → /(root)`.

## Poznámka k ikoně na iPhonu

iOS ikonu aplikace ukládá samostatně. Změna ikony se často projeví až po odstranění staré ikony z plochy a novém přidání ze Safari.
