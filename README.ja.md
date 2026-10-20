# Egatari の部品

[English](README.md)（英語が正本）

[Egatari Studio](https://github.com/egatari/egatari-studio) の動く図の部品（Web Components）です。段階ごとに伸びる棒、組み上がる流れ図、1 本ずつ引く線、読む順に字をたどる漢文など。Studio がこれらを Egatari の教材（[形式](https://github.com/egatari/egatari-spec)。オフラインで再生できる 1 つの HTML）に組み込みます。

一覧は **[CATALOG.md](CATALOG.md)**。部品は 1 つずつ `components/<名前>/` にあります。

| ファイル | 中身 |
|---|---|
| `index.js` | カスタム要素 `<m-<名前>>`（Studio の[部品の約束事](https://github.com/egatari/egatari-studio/blob/main/docs/contract.ja.md)に従う） |
| `README.md` | 先頭の frontmatter（`name`・`series`・`summary`・`steps`・`props`）と使い方 |
| `demo.html` | 1〜2 枚の見本のデッキ |

## 使い方

ここから何かを入れる必要はありません。Studio の各版は、試験を通した部品の写しを持っています（`vendor/components/<名前>/<版>/`、版は `components.lock.json` で固定）。Studio の管理者が新しい版を取り込むには

```bash
npm run components:update -- v1.0.0
```

を使います。リリースの tarball を取ってきて `manifest.json` と照らし、取り込んだ版をすべて残します（古い版で組んだ教材も、そのとおりに組み直せるように）。

## リリースと版

- リリースはタグ `vX.Y.Z` と 2 つのファイル：`egatari-components-vX.Y.Z.tar.gz`（全部品のファイルと `LICENSE`）と `manifest.json`（`name`・`version`・tarball の SHA-256・各ファイルの SHA-256。`index.js` も）。リリースの説明にも tarball の SHA-256 を書きます。tarball の hash はバイトのまま、各ファイルの hash は[仕様 §6](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#6-components-and-profiles)の同一性の hash です（字のファイルは、CRLF と単独の CR を LF にし、先頭の UTF-8 の BOM を除いてから hash する。どの OS の checkout でも同じ hash）。ファイルは LF で置きます。
- **タグは付け替えず、使い回しません。** 直しは新しい版にします。
- Egatari のファイルは部品庫の部品を `{name, version, sha256}` で記録し、`sha256` は `index.js` だけのハッシュです（[仕様 §6](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#6-components-and-profiles)）。`index.js` を（改行のほかで）変えるとハッシュが変わるので、編集アプリは教材が要る版を見分けられます。
- 版の番号：今ある教材の見え方（配置・時間・段階）が変わりうる変更はマイナー以上、教材が書くデータの形を壊す変更はメジャー。

リリースの手順は [RELEASING.md](RELEASING.md)。

## 部品の提案

[提案の Issue](https://github.com/egatari/components/issues/new?template=proposal.yml) を開いてください。例・使った授業・データの形の案・最終状態・インライン SVG と Studio の動きの素では足りない理由・権利・静止したときに読めなければならないもの・ほかの分野での使い道を聞きます。名前はこの段階で管理者が決めます。詳しくは [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)。

部品の不具合は[不具合の報告](https://github.com/egatari/components/issues/new?template=bug.yml)へ。編集アプリ・組み立て・デッキの不具合は [Egatari Studio](https://github.com/egatari/egatari-studio/issues) へ。

## 試験

```bash
npm test
```

Node 22 以上と、Chrome・Edge・Playwright の Chromium のどれか。試験は、固定した版の Egatari Studio（[tools/studio.json](tools/studio.json)）で見本を組みます。初回は `.studio/` に clone して `npm ci` します（ネットワークを使うのはここだけ）。見本ごとに、コンソールのエラーがないこと、段階ごとの画像（動きの途中と最終状態）、決定性（ほかの位置へ飛んで戻っても同じ画素）、字が 24px 以上、字の重なりとスライドからのはみ出しがないこと、形の違うデータでは例外を出さずにその場に札を出すことを確かめます。CI は Linux・macOS・Windows で走らせます。

## 経緯

これらの部品は Egatari Studio（旧 motion-academic-slides）の中で作られ、2026 年 10 月に履歴ごとここへ移りました。v1.0.0 は Studio v0.4.3（commit 8419183）の `components/` とバイト単位で同じです。

## ライセンス

[MIT](LICENSE)（Egatari Studio と同じ）。見本の文章は作者の書き下ろし、パブリックドメイン（漢文・古文）、または架空（社名と数値）です。
