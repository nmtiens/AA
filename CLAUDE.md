## Health Stack

- typecheck: cd frontend && NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit -p . ; cd backend && npx tsc --noEmit -p .
- lint: cd frontend && npm run lint ; cd backend && npm run lint  (ESLint 9 flat config; lỗi chặn CI, cảnh báo `any`/exhaustive-deps chỉ nhắc)
- test: cd frontend && npm test (vitest, utils/*.test.ts) ; cd backend && npm test (node --test qua tsx, test/*.test.ts)
- deadcode: (chưa có — không cài knip)
- shell: (không có shell script)

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
