# Shared Policy: Git flow (main vs branch+PR)

## Источник выбора флоу (гибрид: дефолт + override)

Мы больше **не** определяем флоу по затронутым путям (`system/` и т.п.).
Теперь флоу определяется так:

1) **Per-task override** (если задано в задаче):
- frontmatter задачи (`system/tasks/active/T-*.md`) поле `git_flow`:
  - `inherit` (или отсутствие поля) -> использовать дефолт канбана
  - `main` -> direct-to-main
  - `pr` -> branch -> push -> PR -> merge

2) **Board default** (дефолт канбана):
- `system/tasks/active/.kanban.json` -> поле `gitFlow`:
  - `"main"` = direct-to-main
  - `"pr"` = branch -> push -> PR -> merge

**Единственное правило:** агент обязан следовать *effective* значению, вычисленному по приоритету выше.

## Как агенту проверить effective режим

Перед любыми git-изменениями (или перед push):

1) Открой задачу (файл или Kanban drawer) и проверь `git_flow`.
2) Если `git_flow` = `inherit` (или поля нет) -> смотри дефолт:

```bash
cat system/tasks/active/.kanban.json
```

## Режим: direct-to-main (`gitFlow = "main"`)

- Делайте коммиты в текущей ветке (обычно `main`).
- Пушьте напрямую в `origin/main`.

## Режим: branch -> PR (`gitFlow = "pr"`)

1) Создать ветку от актуального `main`:

```bash
git checkout main
git pull --ff-only
git checkout -b agent/<agentId>/<topic>
```

2) Делать коммиты в ветку.

3) `git push -u origin <branch>`

4) Создать PR:
- через GitHub UI, или
- через `gh pr create` (если настроен)

5) Merge -> только после ревью/аппрува (минимум: Саша).

## Примечание

`git-iteration-closeout` (commit + push) по-прежнему обязателен; меняется только *куда* пушить (main vs feature branch).
