# Contributing

[日本語](CONTRIBUTING.ja.md)

Proposals, bug reports and pull requests are welcome. English or Japanese both work.

## 1. Before a component: write the figure in your deck

Most figures do not need a component. A deck can draw inline SVG and animate it with `data-step`, attention marks, morphs and the camera (Studio's motion primitives; see Studio's [contract](https://github.com/egatari/egatari-studio/blob/main/docs/contract.md)). If one deck needs something more, write a **deck-local** component in `<deck>/components/<name>/index.js`; Studio's build looks there first. The `motion-components` skill in Studio walks through it.

A figure becomes a proposal here when it has served a real lesson and would serve others.

## 2. Propose it in an issue

Open a [proposal](https://github.com/egatari/components/issues/new?template=proposal.yml). The template asks for:

| Field | Why |
|---|---|
| **Example** | an inline-SVG figure from your deck, or an image (sketch, screenshot, photo of a board) |
| **Lesson used in** | components here come from lessons people actually taught |
| **Data shape (draft)** | what an author (or an AI) will write: the child JSON or text, and the attributes |
| **Final state** | what the last step shows: this is what is printed and what is shown when motion is off |
| **Why inline SVG and the motion primitives are not enough** | a component is code every lesson trusts; it has to earn that |
| **Rights** | the sources and licences of the text, data, images and code in the example and the demo |
| **What must be readable when static** | in print, on the reading surface and for a screen reader |
| **Other fields and lessons** | a component is for more than one lesson |

**The maintainer decides the name** (`m-<name>`, a registry name `^[a-z][a-z0-9-]{0,63}$`) in the issue, before any code is merged. Names are permanent: a lesson records the name, and it is never reused for a different component.

## 3. Pull request

After the proposal is accepted and named, open a pull request that adds `components/<name>/`. Variants and the seed, box-and-line diagrams and purpose declarations follow the [shared conventions](docs/conventions.md) (draft).

- [ ] `index.js` defines `<m-<name>>` and follows the [component contract](https://github.com/egatari/egatari-studio/blob/main/docs/contract.md#3-components-web-components): `render(k, t)` decides the picture from the step and time only (no `setTimeout`, `requestAnimationFrame`, `Date` or unseeded random; `t = Infinity` is the final state), colors only through theme variables (`var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)`), the data's shape declared in `static shape`, no deck-specific text or numbers
- [ ] no eval-like code (`npm test` runs `tools/scan-code.mjs`): no `eval`, `Function`, `constructor`, string timers, `import`, `innerHTML` and similar; a formula an author writes is evaluated with `tools/expr.js` (copy it in with `node tools/expr-sync.mjs` and add the component to its `USERS`), never as JavaScript ([SECURITY.md](SECURITY.md))
- [ ] `README.md` with frontmatter `name`, `series` (`common`, `academic`, `business`, `kokugo` or `info`), `summary`, `steps`, `props`, and a body saying when to use it
- [ ] `demo.html`: a 1–2 slide sample deck whose texts and data are yours, public domain or fictional
- [ ] a wrong-shape example for it in `tools/test-shape.mjs`
- [ ] `node tools/catalog.mjs` re-run (CATALOG.md is generated)
- [ ] `npm test` passes, and you looked at the screenshots it writes (mid-step and final)
- [ ] a line in `CHANGELOG.md` under `## Unreleased`

Changing an existing component: keep lessons that use it working. A change to how existing data is drawn (layout, timing, number of steps) is a new minor version at least; say so in the pull request.

## Tests

```bash
npm test                                   # everything
node tools/test-all.mjs --only test-components
node tools/test-components.mjs bars        # one demo (screenshots in components/bars/out/shots/)
```

The tests build the demos with a pinned release of Egatari Studio (`tools/studio.json`, fetched by `tools/studio.mjs` into `.studio/`). To test against a Studio checkout of your own, set `EGATARI_STUDIO=<path to a scratch copy>` (the components here are copied into it). When Studio changes the component contract, the pin moves to a Studio release that has it; tags are never moved, so a pin always means the same code.

## Releases

Only the maintainer tags releases: [RELEASING.md](RELEASING.md). Tags are never moved.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
