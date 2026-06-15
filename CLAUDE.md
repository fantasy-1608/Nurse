<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Nurse** (3204 symbols, 5619 relationships, 285 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Build Workflow (BẮT BUỘC)

> **⚠️ CRITICAL:** Code nguồn nằm trong `src/`, nhưng Chrome Extension load từ `dist/Nurse/`. Mọi thay đổi trong `src/` sẽ **KHÔNG CÓ HIỆU LỰC** cho đến khi chạy build.

Sau **MỖI LẦN** sửa file trong `src/`, agent **PHẢI** chạy:

```bash
node build/build.js nurse
```

Quy trình đầy đủ để thay đổi có hiệu lực:
1. Sửa code trong `src/`
2. Chạy `node build/build.js nurse` để copy sang `dist/Nurse/`
3. Hướng dẫn user: Reload tiện ích trong `chrome://extensions` + F5 trang HIS

## Always Do

- **MUST run `node build/build.js nurse` after ANY code change in `src/`.** The extension loads from `dist/Nurse/`, not `src/`. Forgetting this step means your changes have ZERO effect.
- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER forget to run `node build/build.js nurse` after editing files in `src/`. This is the #1 cause of "code changes not working".
- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Nurse/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Nurse/clusters` | All functional areas |
| `gitnexus://repo/Nurse/processes` | All execution flows |
| `gitnexus://repo/Nurse/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

