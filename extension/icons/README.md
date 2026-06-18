# Icons — the puff mark

`ypuf-mark.svg` is the source: the **"puff"** logo — an amber dot mid-dissipation
(scattering up-and-right, the sound of a tab let go; asymmetric, no halo/ring/sparkle).

`icon16.png` / `icon48.png` / `icon128.png` (toolbar action + extension + notification)
are rendered from it, amber on transparent. The masthead + popup render the same mark as
inline themed SVG (`currentColor` → amber in light/dark, lavender in star); the new-tab
favicon links the SVG directly.

To regenerate the PNGs after editing the SVG:

```sh
cd extension/icons
for s in 16 48 128; do rsvg-convert -w $s -h $s ypuf-mark.svg -o icon$s.png; done
```
