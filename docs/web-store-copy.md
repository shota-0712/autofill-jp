# AutoFill JP Chrome Web Store 文面

公開用 URL

- Homepage URL: `https://shota-0712.github.io/autofill-jp/`
- Support URL: `https://shota-0712.github.io/autofill-jp/#support`
- Privacy policy URL: `https://shota-0712.github.io/autofill-jp/privacy.html`
- Support email: `satellite0712@gmail.com`

## Single Purpose

AutoFill JP の単一目的は、ユーザーが自分で入力した日本語フォーム情報を学習し、次回以降のフォーム入力を短縮することです。

## Short Description

就活フォームで一度入力した内容を学習し、次回以降の入力をまとめて再利用できる日本語向け自動入力拡張。

## Detailed Description

AutoFill JP は、日本の就活・適性検査・各種応募フォーム向けの学習型自動入力 Chrome 拡張です。

- ユーザーがページ上で入力した通常フィールドを学習し、次回は対応するフィールドへまとめて自動入力します。
- ルールは `{ name, value, site }` を基本としてブラウザ内に保存します。
- サイト欄が空欄のルールは全サイトに適用され、必要に応じてホストまたは URL プレフィックスで絞り込めます。
- password / hidden フィールドは学習も自動入力もしません。
- データはローカル保存が中心で、外部サーバーへ送信しません。

## Permissions Justification

### `storage`

学習ルールと設定をブラウザ内に保存するために必要です。ルール本体は `chrome.storage.local`、軽微な UI 設定は `chrome.storage.sync` を使う場合があります。

### `contextMenus`

右クリックメニューから「自動入力」「このページの入力内容を学習」「設定を開く」を実行するために必要です。

### All Sites Access

就活サイトや応募フォームはドメインと DOM 構造がばらばらなため、ユーザーが訪れた任意の `http(s)` フォーム上で同じ機能を提供するには全サイトアクセスが必要です。公開版ではトップフレームにのみ UI を表示し、password / hidden フィールドは対象外にしています。

## Privacy Tab Draft

### 収集するデータ

- ユーザーがフォーム上で入力した通常フィールドの値
- それに対応する `name` / `id` とサイト指定
- 軽微な UI 設定

### 収集しないデータ

- パスワード
- hidden フィールド
- 閲覧履歴の外部送信
- トラッキング / 分析データ

### データ共有

共有しません。現行版は外部送信しません。

### データ販売

販売しません。

### データ利用目的

ユーザーが明示的に要求したフォーム自動入力機能の提供のためだけに利用します。

## Listing / Privacy 整合チェック

- 製品概要ページ: `docs/index.html`
- プライバシーポリシー: `docs/privacy.html`
- Homepage URL: `https://shota-0712.github.io/autofill-jp/`
- Support URL: `https://shota-0712.github.io/autofill-jp/#support`
- Privacy policy URL: `https://shota-0712.github.io/autofill-jp/privacy.html`
- Single Purpose: 「フォーム入力内容の学習と再利用」
- Password / hidden 非対象を Listing / Privacy / README で統一
- ローカル保存中心、外部送信なしを Listing / Privacy / README で統一

## ストア素材チェックリスト

- [ ] スクリーンショットを最低 1 枚用意
- [ ] 440x280 の small promo image を用意
- [ ] 128px アイコンの見栄えを確認
