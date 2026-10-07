"""Rebuild language and section indexes from published TeqCMS Markdown metadata."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "tmpl" / "web"
LABELS = {
    "ru": {"home": "ТАЛГАТИКУС", "sections": "Разделы", "articles": "Статьи",
           "security": "Информационная безопасность", "it": "Информационные технологии",
           "nsk": "Новый социальный контракт", "old": "Действующий сайт НСК"},
    "en": {"home": "TALGATICUS", "sections": "Sections", "articles": "Articles",
           "security": "Information security", "it": "Information technology",
           "nsk": "New Social Contract", "old": "Current NSK site"},
}


def front_matter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"Missing front matter: {path}")
    head = text.split("---\n", 2)[1]
    return {key.strip(): json.loads(value.strip()) for key, value in
            (line.split(":", 1) for line in head.splitlines() if ":" in line)}


def write_page(locale: str, route: str, title: str, content: str) -> None:
    path = ROOT / locale / f"{route}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    metadata = {"title": title, "description": title, "date": "2026-10-07"}
    front = "---\n" + "\n".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in metadata.items()) + "\n---\n\n"
    path.write_text(front + content, encoding="utf-8")


for locale, words in LABELS.items():
    by_section: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for path in sorted((ROOT / locale).rglob("*.md")):
        route = path.relative_to(ROOT / locale).with_suffix("").as_posix()
        if route == "index" or route.endswith("/index"):
            continue
        if "/" not in route:
            continue
        section = route.split("/", 1)[0]
        if section not in ("security", "it"):
            continue
        by_section[section].append((route, front_matter(path)["title"]))

    for section, items in by_section.items():
        links = "\n".join(f"- [{title}](https://talgatiko.github.io/{locale}/{route}/) "
                          f"([Markdown](https://talgatiko.github.io/{locale}/{route}.md))"
                          for route, title in items)
        body = (f"# {words[section]}\n\n"
                f"[RU](https://talgatiko.github.io/ru/{section}/) · "
                f"[EN](https://talgatiko.github.io/en/{section}/) · "
                f"[Markdown](https://talgatiko.github.io/{locale}/{section}.md)\n\n"
                f"{links}\n")
        write_page(locale, section, words[section], body)

    sections = "\n".join(f"- [{words[section]}](https://talgatiko.github.io/{locale}/{section}/)"
                         for section in ("security", "it"))
    body = (f"# {words['home']}\n\n"
            f"[RU](https://talgatiko.github.io/ru/) · "
            f"[EN](https://talgatiko.github.io/en/) · "
            f"[Markdown](https://talgatiko.github.io/{locale}/index.md)\n\n"
            f"## {words['sections']}\n\n{sections}\n"
            f"- [{words['old']}](https://talgatiko.github.io/new-social-contract/)\n")
    write_page(locale, "index", words["home"], body)

neutral = {
    "title": "TALGATICUS / ТАЛГАТИКУС",
    "description": "Articles in Russian and English",
    "date": "2026-10-07",
}
(ROOT / "index.md").write_text(
    "---\n" + "\n".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in neutral.items()) +
    "\n---\n\n# TALGATICUS / ТАЛГАТИКУС\n\n"
    "[Русский](https://talgatiko.github.io/ru/) · "
    "[English](https://talgatiko.github.io/en/)\n", encoding="utf-8")
print("Rebuilt bilingual site and section indexes.")
