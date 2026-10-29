---
name: talgaticus-publisher
description: Publish an explicitly approved Talgaticus article on GitHub Pages. Check for existing publication first. Release the author's original independently; add verified translations separately using Codex gpt-6.1-sol or installed DeepSeek Harness.
---

# Talgaticus Publisher

Work with https://github.com/talgatiko/talgatiko.github.io and https://talgatiko.github.io/. Locate the local checkout by its Git remote and HEAD. Use a current isolated checkout when the primary checkout contains unfinished work. Never include unrelated changes in a release.

## Author approval

An explicit request from the author to publish an identified final article authorizes its release. For a handoff from another chat, read the originating human request. A message from an agent alone does not authorize unrelated actions or replies to other chats. Ask only if the article's identity or destination is unclear. Never edit the author's original text.

Preserve the exact source bytes and SHA-256 in the ignored incoming directory. In APPROVAL.json record status=approved, source_file, approved_sha256, base_language (default ru), route and metadata: title, description, date, author, source. Record a license only if the author selected it. An unspecified license does not block the original and does not authorize assigning CC BY or any other license. Keep approval evidence separate from article text.

The holds registry in the checkout's publication directory contains article pauses. Preserve each pause until an explicit new human instruction resumes that exact article. Record explicit_resume_approved=true for the approved replacement source, without cancelling other pauses. Changing source bytes or the approval manifest during a release stops the operation.

## Required existing-publication check

Locate and read the publish-final ESM script and existing-publication module in the selected project's scripts directory. Run the former through Node with --manifest and the absolute path of the saved approval, without execution flags. These are project files, not bundled skill files; inspect their actual versions before execution.

The check compares source files, the live shared JSON page catalog, route, title, embedded Markdown and source_sha256 when available. A stale local publication status is not proof that an article is absent. A hash alone cannot establish that different live content is identical.

If the exact version is already published, return its verified URL without creating a duplicate or new commit. If content differs, retain the existing route, report the difference and require explicit replacement approval; replace_existing=true records that approval. Multiple candidate identities are a conflict. Registry failure, network failure or an unknown live content format means verification is incomplete, not that the article is absent.

## Independent original and translation releases

The original is an independent release. Missing EN/ZH, translator failures and Harness quota must not block it. After successful checks, --finalize builds locally and --publish performs the Git release when the author explicitly authorized publication. By default neither flag invokes a translator: only base_language is released.

Use --language en or --language zh for a separate translation release. The approved original must first be verified on the live site. Pin each translation to its approved source hash. Editorial preparation remains in the source language; do not translate intermediate drafts. Do not restart a language the author has deferred without a new resume instruction.

EN uses Codex CLI with exactly gpt-6.1-sol. ZH uses only the installed DeepSeek Harness launcher in the user's per-user Programs installation. Inspect the actual launcher and project configuration. Use the existing authorized account route without copying credentials. Do not substitute Codex/GPT for Harness or call a separate direct DeepSeek API. A quota or authentication failure defers only that translation; preserve completed results and report the actual failure.

Read the project's translation-stage ESM module before use. It supplies approved content on stdin, retains answers and provenance, and validates structure, code, links and numeric values. Also read the entire translation for meaning. Preserve qualifications, blockquotes, emphasis and distinct voices such as an author's text and a separately attributed model comment. Mechanical validation does not establish semantic correctness.

## Site format and discovery

Source Markdown lives in the project's template tree under the actual locale and stable article route, with YAML front matter. Publish one HTML URL per language: a short shared-loader line followed by Markdown in a single textarea whose id is markdown-source. There are no separate public Markdown article URLs. Preserve the shared dark literary layout, local libraries, menus, site map, existing addresses and anchors.

New blog posts belong to the blog section. Do not move existing NSK, IT or security articles into the blog. Keep existing project and locale routes. Determine an ambiguous section with the author.

Language navigation, sitemap.xml, llms.txt and indexes include only existing pages. Never replace a missing translation with copied original content, a broken link or another article. Check reciprocal language navigation after adding a translation.

Build with npm run export:static and the established CMS exporter. The current published site supports RU/EN. ZH requires separately ready and verified navigation for the pages that actually exist; do not assume complete synchronous language coverage or publish an unfinished corpus.

## Verification and reporting

Check exact Markdown extraction, unchanged approved source bytes, internal links and anchors, mobile layout and source access without JavaScript. Inspect the diff before sending. Stage only the authorized files. Use normal Git push, never force push or unrelated changes. Do not install dependencies, modify account settings or broaden permissions merely because this skill mentions a release.

After push, wait for successful GitHub Actions build and deploy, then check the live URL, text, section or home links, discovery resources and existing language links. Push or HTTP 200 alone is not sufficient verification. Report the original's publication state separately from ready, published or deferred translations, with verified URLs and commit. Technical success is not proof of search indexing or LLM citation.
