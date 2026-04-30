# AutoFill JP Chrome Web Store 入力値

`AutoFill JP` を `shota-0712/autofill-jp` と GitHub Pages で公開する前提の、貼り付け用フィールド集です。

## 公開 URL

- Homepage URL: `https://shota-0712.github.io/autofill-jp/`
- Support URL: `https://shota-0712.github.io/autofill-jp/#support`
- Privacy policy URL: `https://shota-0712.github.io/autofill-jp/privacy.html`
- Support email: `satellite0712@gmail.com`

## Store Listing

### Title

`AutoFill JP`

### Summary

`フォームに入力した内容を学習し、次回の入力を自動補完する拡張。就活・申込・アンケートなど各種フォームに対応。`

### Category

`Productivity`

### Language

`Japanese`

### Detailed description

```text
AutoFill JP は、各種フォームの入力内容を学習する自動入力 Chrome 拡張です。

ユーザーがページ上で入力した通常フィールドを学習し、次回は対応するフィールドへまとめて自動入力します。

主な特徴
- 手入力済みのフォーム内容をまとめて学習
- name / id に基づく明確なルール一致
- 学習時に「このサイトだけ」「この URL 配下」「全サイト」を選択可能。サイト欄が空欄のルールは全サイトに適用
- 必要に応じてホストまたは URL プレフィックスで絞り込み可能
- password / hidden フィールドは学習も自動入力もしない
- データはブラウザ内に保存され、外部サーバーへ送信しない

この拡張の目的は、ユーザーが自分で入力したフォーム情報を再利用し、繰り返し入力の手間を減らすことです。
```

### Homepage URL

`https://shota-0712.github.io/autofill-jp/`

### Support URL

`https://shota-0712.github.io/autofill-jp/#support`

### Privacy policy URL

`https://shota-0712.github.io/autofill-jp/privacy.html`

## Privacy Tab

### Single purpose description

```text
ユーザーが自分で入力した日本語フォーム情報を学習し、次回以降のフォーム入力を短縮するための拡張です。
```

### Permission justification: storage

```text
学習した自動入力ルールと軽微な設定をブラウザ内に保存するために使用します。
```

### Permission justification: contextMenus

```text
右クリックメニューから自動入力、学習、設定画面起動を実行するために使用します。
```

### Permission justification: all sites access

```text
就活サイトや応募フォームごとに DOM 構造が異なるため、ユーザーが訪れた任意の http(s) フォームで同じ機能を提供するために必要です。公開版ではトップフレームのみに UI を表示し、password / hidden フィールドは対象外にしています。
```

### Remote code

`No, I am not using remote code`

## Data use disclosure

この部分はダッシュボードの選択肢に合わせてチェックします。今の実装から見て、次で整合を取るのが安全です。

### Collected data

- Personal communications: `No`
- Health information: `No`
- Financial and payment information: `No`
- Authentication information: `No`
- Personal info: `Yes`
  - 理由: 氏名、住所、電話番号、メールアドレス等をユーザー入力から学習しうるため
- Location: `No`
- Web history: `No`
- User activity: `No`
- Website content: `Yes`
  - 理由: ユーザーが現在開いているフォーム上の入力済み値と field identifier を処理するため

### Purposes

- To provide core functionality: `Yes`
- For analytics: `No`
- For personalization: `No`
- For ads: `No`
- For creditworthiness / lending: `No`
- For sale to third parties: `No`

### Certification

- データはユーザーが要求した機能の提供にのみ使用する
- データを第三者へ販売しない
- パーソナライズ広告に使わない
- 限定例外を除き人が読まない

上の 4 項目は実装とポリシーに合わせて `Yes` で certifying する前提です。

## Distribution

### Visibility

初回は `Public` で問題ありません。審査前の限定公開確認を挟みたいなら `Private` または `Unlisted`。

### Regions

日本語中心で始めるなら `Japan`、最初から広く出すなら `All regions`。

## Test instructions

通常は空欄で問題ありません。ログイン必須サイトのテストアカウントを reviewer に渡す必要があるときだけ記入します。

## 公開前チェック

- `docs/index.html` と `docs/privacy.html` が GitHub Pages で開ける
- スクリーンショット最低 1 枚を用意
- `440x280` の small promo image を用意
- icon `128x128` の見栄え確認
- Listing / Privacy / Privacy Policy / 実装の文言が矛盾していない
