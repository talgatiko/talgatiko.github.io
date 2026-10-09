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
LEGACY_NSK = [
    ("", "Главная НСК"),
    ("ru/", "Русская главная НСК"),
    ("catalog/", "Каталог материалов НСК"),
    ("help/", "Как помочь проекту НСК"),
    ("license/", "Условия использования НСК"),
    ("ru/texts/nsk-001/", "NSK-001 · Паспорт концепции"),
    ("ru/texts/nsk-002/", "NSK-002 · НСК — кратко"),
    ("ru/texts/nsk-003/", "NSK-003 · Полная статья с FAQ"),
    ("ru/texts/nsk-005/", "NSK-005 · Как проводится база"),
    ("ru/texts/nsk-006/", "NSK-006 · Условные примеры"),
    ("ru/texts/nsk-007/", "NSK-007 · Открытые вопросы"),
    ("ru/texts/nsk-008/", "NSK-008 · Источники"),
    ("ru/texts/nsk-009/", "NSK-009 · Об авторе"),
    ("ru/texts/nsk-010/", "NSK-010 · Оригинал LiveJournal 2010 года"),
]


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
    path.write_text(front + content, encoding="utf-8", newline="\r\n")


def html_url(locale: str, route: str) -> str:
    return f"https://talgatiko.github.io/{locale}/" if route == "index" else f"https://talgatiko.github.io/{locale}/{route}/"


def markdown_url(locale: str, route: str) -> str:
    return (f"https://talgatiko.github.io/{locale}/index.md" if route == "index"
            else f"https://talgatiko.github.io/{locale}/{route}.md")


def format_links(locale: str, route: str) -> str:
    return f"[HTML]({html_url(locale, route)}) · [Markdown]({markdown_url(locale, route)})"


site_map: dict[str, list[tuple[str, str]]] = {}
section_map: dict[str, dict[str, list[tuple[str, str]]]] = {}


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
        links = "\n".join(f"- [{title}]({html_url(locale, route)}) "
                          f"· [Markdown]({markdown_url(locale, route)})"
                          for route, title in items)
        body = (f"# {words[section]}\n\n"
                f"RU: {format_links('ru', section)} · EN: {format_links('en', section)}\n\n"
                f"{links}\n")
        write_page(locale, section, words[section], body)

    site_map[locale] = [("index", words["home"])]
    for section in ("security", "it"):
        site_map[locale].append((section, words[section]))
        site_map[locale].extend(by_section[section])
    section_map[locale] = by_section
    sections = "\n".join(f"- [{words[section]}]({html_url(locale, section)}) "
                         f"· [Markdown]({markdown_url(locale, section)})"
                         for section in ("security", "it"))
    articles = "\n".join(f"- [{title}]({html_url(locale, route)}) "
                         f"· [Markdown]({markdown_url(locale, route)})"
                         for section in ("security", "it") for route, title in by_section[section])
    body = (f"# {words['home']}\n\n"
            f"RU: {format_links('ru', 'index')} · EN: {format_links('en', 'index')}\n\n"
            f"## {words['sections']}\n\n{sections}\n"
            f"- [{words['old']}](https://talgatiko.github.io/new-social-contract/)\n\n"
            f"## {words['articles']}\n\n{articles}\n")
    write_page(locale, "index", words["home"], body)

neutral = {
    "title": "TALGATICUS / ТАЛГАТИКУС",
    "description": "Публикации об информационной безопасности, ИТ и НСК · Publications on information security, IT, and the New Social Contract",
    "date": "2026-10-09",
}
map_lines = [
    "# TALGATICUS / ТАЛГАТИКУС",
    "",
    "## Проекты / Projects",
    "",
    "- **Новый социальный контракт / New Social Contract** · "
    "[Действующий сайт / Current website](https://talgatiko.github.io/new-social-contract/)",
    "- **Проекты автора / Author's projects** · "
    "[Профиль и публичные репозитории / Profile and public repositories](https://github.com/talgatiko)",
    "",
    "## Публикации / Publications",
    "",
    f"- **Информационная безопасность · RU**: {format_links('ru', 'security')}",
    f"- **Information security · EN**: {format_links('en', 'security')}",
    f"- **Информационные технологии · RU**: {format_links('ru', 'it')}",
    f"- **Information technology · EN**: {format_links('en', 'it')}",
    "",
    "## Полная карта сайта / Complete site map",
    "",
    "- [Главная HTML / Home HTML](https://talgatiko.github.io/) · "
    "[Главная Markdown / Home Markdown](https://talgatiko.github.io/index.md)",
]
for locale, heading in (("ru", "Русский / Russian"), ("en", "English / Английский")):
    words = LABELS[locale]
    map_lines.extend(["", f"### {heading}", ""])
    map_lines.append(f"- {format_links(locale, 'index')}")
    for section in ("security", "it"):
        map_lines.extend([
            "",
            f"#### {words[section]}",
            "",
            f"- {format_links(locale, section)}",
        ])
        map_lines.extend(
            f"- [{title}]({html_url(locale, route)}) · [Markdown]({markdown_url(locale, route)})"
            for route, title in section_map[locale][section]
        )
map_lines.extend(["", "### НСК · действующий отдельный сайт / Current NSK site", ""])
map_lines.extend(f"- [{title}](https://talgatiko.github.io/new-social-contract/{route})"
                 for route, title in LEGACY_NSK)
map_lines.append("")
(ROOT / "index.md").write_text(
    "---\n" + "\n".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in neutral.items()) +
    "\n---\n\n" + "\n".join(map_lines), encoding="utf-8", newline="\r\n")
print("Rebuilt bilingual site and section indexes.")
