# Dory

**Dory は、人間と Agent のための AI-native SQL クライアントです。**

Dory は SQL ワークスペースです。人間はデータをクエリ、探索、可視化でき、AI Agent は MCP を通じて安全にデータベースを扱えます。

通常のデータベース MCP server は、クエリ結果をチャットへ返すだけです。Dory は Agent の作業を編集可能な SQL ワークスペースに変換します。SQL タブ、結果セット、チャート、保存済みクエリ、実行コンテキストを、人間が開き、確認し、修正し、続きから作業できます。

Dory は日常的な SQL クライアントとしても、Claude Code、Codex CLI、その他 MCP 対応 Agent のデータベース実行レイヤーとしても使えます。

## Why Dory?

AI Agent は SQL を書き、schema を調べ、分析質問に答えられるようになりました。しかし、実際のデータ作業にはチャット出力だけでは足りません。

チームには以下が必要です。

- 実行された SQL を確認する
- 実際の結果セットを検証する
- 誤ったクエリを修正する
- 結果をチャートやエクスポートに変換する
- 複数ステップの文脈を保持する
- 本物の SQL ワークスペースで作業を続ける

Dory はこのワークフローのために作られています。

## How Dory works

Dory は、同じデータベース操作を UI と Agent の両方に提供します。

- 人間は Dory を SQL クライアントとして使います。SQL を書き、schema を参照し、クエリを実行し、結果をフィルタし、チャートを作り、クエリを保存します。
- Agent は MCP 経由で Dory を使います。接続一覧を取得し、schema を探索し、読み取り専用 SQL を実行し、タブを作成し、データベース作業を整理します。
- Agent が生成した作業は、人間がレビュー、編集、継続できる実際のワークスペースになります。

## Dory vs Plain Database MCP Server

| Capability | Plain DB MCP Server | Dory |
| --- | ---: | ---: |
| Agent から SQL を実行 | Yes | Yes |
| schema を探索 | Yes | Yes |
| 編集可能な SQL タブ | No | Yes |
| 永続的な結果セット | No | Yes |
| チャートとフィルタ | No | Yes |
| 人間によるレビュー | Limited | Yes |
| 保存済みクエリとワークスペース文脈 | Limited | Yes |
| 日常的な SQL クライアントとして利用 | No | Yes |

## Key Features

### 編集可能な Agent ワークスペース

Agent のデータベース作業は、チャット履歴の中で終わるべきではありません。

- Agent が作成した SQL タブを通常のワークスペースタブとして開く
- SQL、結果セット、フィルタ、チャート、保存済みコンテキストを確認する
- 生成された SQL を編集し、自分で再実行する
- 最初からやり直さず、同じワークスペースから Agent Run を続ける

### Claude Code / Codex CLI 向け Desktop MCP

Dory デスクトップアプリはローカル MCP endpoint を提供し、外部 Agent が手動 token コピーなしで Dory の接続を使えるようにします。

- Claude Code、Codex CLI、その他 MCP 対応クライアントで利用可能
- Dory の接続一覧、schema 検査、保存済みクエリ、読み取り専用 SQL 実行を利用
- Desktop MCP grant は Dory が管理し、通常ユーザーに token 操作を求めない

### 人間のための SQL ワークスペース

- 複数結果セットに対応したマルチタブ SQL エディタ
- テーブル、カラム、データベースオブジェクトを確認できる schema browser
- 再利用できる保存済みクエリ
- クエリ実行履歴とワークスペースコンテキスト

### 結果セット、フィルタ、チャート

- テーブルビューで実際の結果セットを確認
- 返された行をフィルタ、検索、レビュー
- クエリ結果をワークスペース内でチャート化
- 結果セットとそれを生成した SQL の関係を保持

### Schema-aware AI Assistance

Dory の AI assistant は、実際のデータベース schema と現在のクエリコンテキストに基づいて動作します。

- 自然言語から SQL を生成
- 現在のタブで SQL を書き換え、修正し、説明
- 現在の database schema と query context を利用
- AI 支援を実際の SQL ワークスペース内に保つ

### 保存済みクエリと再利用可能なコンテキスト

- 有用な SQL を保存
- 接続とワークスペースごとにクエリ作業を整理
- 人間と Agent が以前のデータベース作業を引き継げる
- 1 回のチャット応答を超えてコンテキストを保持

### データベース対応

Dory はマルチデータベース SQL クライアントです。幅広いドライバに対応し、一部のデータベースでは汎用 SQL 実行以上の深い統合を提供します。

| Database | Status |
| --- | --- |
| ClickHouse | Deeply integrated |
| PostgreSQL | Supported |
| Neon | Supported |
| MySQL | Supported |
| MariaDB | Supported |
| SQLite | Supported |
| DuckDB | Supported |
| SQL Server | Supported |
| Oracle | Supported |
| Snowflake | Planned |

### ClickHouse Deep Integration

Dory は、汎用 SQL エディタ以上の操作性を必要とする ClickHouse チーム向けにネイティブな運用画面を提供します。

- slow query、error、active user、latency、throughput を含む query monitoring
- user、database、query type、time range による多次元フィルタ
- すべての `GRANT` や `CREATE USER` を手書きせずに user / role を管理
- On Cluster を使った cluster-level privilege operation

## Quick Start

### macOS に Homebrew でインストール

```bash
brew install dorylab/dory/dory
```

### Docker で実行

```bash
docker run -d --name dory \
  -p 3000:3000 \
  -e DS_SECRET_KEY="$(openssl rand -base64 32 | tr -d '\n')" \
  -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  -e BETTER_AUTH_URL="http://localhost:3000" \
  -e DORY_AI_PROVIDER=openai \
  -e DORY_AI_MODEL=gpt-4o-mini \
  -e DORY_AI_API_KEY=your_api_key_here \
  -e DORY_AI_URL=https://api.openai.com/v1 \
  -e NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=false \
  -e DORY_INIT_USER_EMAIL=admin@getdory.dev \
  -e DORY_INIT_USER_PASSWORD=admin \
  dorylab/dory:latest
```

初期管理者アカウント:

`Username: admin@getdory.dev`

`Password: admin`

### Docker Compose でセルフホスト

```bash
cp docker-compose.env.example .env
# .env を編集し、placeholder の secret/password を置き換えます。
docker compose up -d
```

詳しいセルフホスト手順は [Self-Hosting Documentation](https://www.getdory.dev/docs/deploy/self-hosting) を参照してください。

## Desktop MCP

Dory デスクトップアプリには local MCP support が含まれており、Agent クライアントは API token を手動コピーせずに Dory の接続を使えます。

CLI stdio、headless HTTP、hosted bridge を含む完全な MCP 手順は [Dory MCP Guide](./mcp.md) を参照してください。

Desktop MCP の有効化:

1. Dory デスクトップアプリを開く。
2. **Settings → Agent Access** に移動。
3. **Enable** をオンにする。
4. 表示された local endpoint を MCP client に追加。

デフォルトの Desktop MCP endpoint:

```text
http://127.0.0.1:3318/api/mcp
```

Codex CLI:

```bash
codex mcp add dory --url http://127.0.0.1:3318/api/mcp
codex mcp list
```

Claude Code:

```bash
claude mcp add --transport http dory http://127.0.0.1:3318/api/mcp
claude mcp list
```

Dory は Desktop MCP grant を自動的に管理します。local MCP endpoint は、接続一覧、schema 検査、保存済みクエリの読み取り、table preview、read-only SQL、分析コンテキスト構築をサポートします。

Desktop 以外または headless の構成では [`@getdory/cli`](../packages/cli/README.md) を使い、[Dory MCP Guide](./mcp.md) を参照してください。

## Supported AI Providers

Dory は pluggable AI provider architecture を採用しています。環境変数を変更するだけで provider を切り替えられます。

| Provider | Env `DORY_AI_PROVIDER` | Description |
| --- | --- | --- |
| OpenAI | `openai` | OpenAI official API |
| OpenAI-Compatible | `openai-compatible` | OpenAI-compatible API services |
| Anthropic | `anthropic` | Claude models via Anthropic official API |
| Google | `google` | Gemini models via Google Generative AI API |
| Qwen (Alibaba) | `qwen` | Qwen via DashScope OpenAI-compatible endpoint |
| xAI | `xai` | Grok models via xAI API |

## Roadmap

- [Dory Roadmap](../ROADMAP.md)
- [GitHub Discussion #35](https://github.com/dorylab/dory/discussions/35)

## License

Apache-2.0
