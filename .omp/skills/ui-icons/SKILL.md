---
name: ui-icons
description: Add, swap or find a UI icon in KEYMASH_ (buttons, drawer rows, selects, toasts). One icon set (MingCute, filled) from the Iconify API, committed as SVG files, drawn as a CSS mask. Use whenever a button or message would otherwise show an emoji or symbol character.
---

# UI icons in KEYMASH_

Buttons, drawer rows, selects and toasts show icons from **one set: MingCute, filled** (`mingcute:*-fill`,
soft rounded shapes, one colour). Never emoji or symbol characters (▶ ✖ ⛶ 📂). Emoji stay only where
they are program text: demos, the key bar's emoji keys, what a running program shows.

## How it fits together

- `scripts/ui-icons.ts`: the `ICONS` list (our name → MingCute name). Running it downloads every icon
  from the Iconify API into `src/ui/icons/<name>.svg` and rewrites `src/ui/icons/index.ts`
  (one `import x from './x.svg?url'` per icon, `ICONS`, `type IconName`, and `INK`: each icon's drawn rows,
  measured in headless Chromium, for `iconFillClip()`). Never edit `index.ts` by hand.
- `src/ui/icon.ts`: `iconEl(name)` (a new `<i>`) and `setIcon(el, name)`. The SVG URL goes into
  `--icon`; `icon.css.ts` draws it as `mask-image` over `currentColor`, 1em square. So an icon takes
  the colour and `font-size` of where it sits; size it with `font-size`, colour it with `color`.
- Consumers: `<km-button icon="name">` / `button.icon = 'name'`, `KmItem.create({ icon })`,
  `KmSelect.create({ icon: iconEl('globe') })`, `toast(text, 'paw')` in `main.ts`, mode drawer rows via
  `item(name, sub, onPick, icon)`, the key bar's cursor keys (`NAV_KEYS` in `src/ui/editor.ts`).

## Find an icon

Search the set (Iconify API, https://iconify.design/docs/api/):

```sh
curl -s 'https://api.iconify.design/search?query=heart&prefix=mingcute&limit=64' | jq -r '.icons[]' | grep -- '-fill$'
```

Check that names exist (`not_found` lists the missing ones):

```sh
curl -s 'https://api.iconify.design/mingcute.json?icons=heart-fill,star-fill' | jq '.not_found'
```

Preview one: `https://api.iconify.design/mingcute/heart-fill.svg?color=%2339ff7a&height=64`.
Pick the `-fill` variant; MingCute's `-line` variants don't match the rest.

## Add or swap an icon

1. Add or change the entry in `ICONS` in `scripts/ui-icons.ts`. Our name is a JS identifier
   (camelCase: `fullscreenExit`) and says what the button does, not what it shows (`share`, not `link`).
2. `bun scripts/ui-icons.ts`. It fails loudly on an unknown name, removes SVGs no longer listed and formats `index.ts`.
3. Use it: `icon="name"` in `index.html`, or `iconEl('name')` / `setIcon(el, 'name')` in code. `tsc`
   checks the name against `IconName`.
4. Look at it in the app (`bun run dev`, or headless Chromium via playwright-core) in at least one dark theme.
   Next to text, an icon is 1em; adjust with `font-size` on the `i` in the component's `*.css.ts`.
5. Commit the SVG(s), `src/ui/icons/index.ts` and the script change together. Docs: README "Icons"
   paragraph and CLAUDE.md only change if the mechanism changes, not per icon.

## Pitfalls

- A class that composes several styles (`style([a, b])`) is two class names: `classList.add()` throws on it.
  Styles that go onto an icon element via `classList.add` must be single `style({...})` calls.
- `[hidden]` loses against the icon class's `display: inline-block`; remove the element or don't set the icon instead.
- Text-only places (`<option>`, `title`, `aria-label`, canvas text) can't hold an icon: use words there,
  and put the icon next to the control (see `KmSelect`'s `icon`).
- The mode icons in the header (`ModeDef.icon`, inline SVG markup per mode) are the modes' own logos, not part of this set.
