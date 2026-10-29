---
title: "Smyslocode: a compact language for running and training neural networks"
description: Smyslocode uses representations already familiar to models to
  shorten text while preserving task performance.
date: 2026-10-29
author: Талгат Зайниев
license: CC BY 4.0
source: https://github.com/talgatiko/talgatiko.github.io
source_sha256: 277121c14d9c2d664167ef4dee58e554a17cd548ba3eb3311dd94b361967cc05
translation_source_sha256: 277121c14d9c2d664167ef4dee58e554a17cd548ba3eb3311dd94b361967cc05
translation_engine: Codex
translation_model: gpt-6.1-sol
---
# Smyslocode: a compact language for running and training neural networks

To find a contradiction in a contract, a neural network reads the contract. To continue a conversation, it reads the message history. To understand a program, it reads the code, the task description, and the results of checks. This stream occupies context and requires memory and computation. The user needs a result: a contradiction found, a working program, facts compared.

I propose conveying this content more compactly, using representations the model has already learned. I call this intermediate language Smyslocode. Its vocabulary needs to be selected in advance from the model’s existing tokens, while separate small neural networks handle translation from ordinary text and formulation of the response.

Even a 10% reduction while preserving quality would be useful. I expect it could reach 50% or more. Tests will show how far this can go.

The idea has two stages: first, use Smyslocode with existing models, keeping their weights unchanged; then train new models on texts that have already been converted.

## Use what the model already knows

Text enters a neural network as a sequence of tokens. A token can correspond to a whole word or part of one. One word occupies one position, another several: this depends on the tokenizer’s vocabulary and rules. The number of letters does not determine the number of tokens. [Overview of tokenization in Transformers](https://huggingface.co/docs/transformers/main/tokenizer_summary).

Each token has a corresponding input vector—an embedding. For the first version of Smyslocode, I propose using the very tokens and embeddings the model already has, with the meanings it has learned.

Suppose a Russian word is split into several tokens. The model’s vocabulary may contain a single-token equivalent that conveys the intended meaning. It could come from Russian, Chinese, English, or another language. If the model correctly understands the replacement in the relevant contexts, it can be included in the Smyslocode vocabulary.

This search covers words, phrases, actions, and relationships. Candidates should be selected from the entire available vocabulary. Switching to another language is useful where it saves tokens; a suitable expression in the original language works too.

The replacement should convey the content of the entire group of tokens. A prefix, an ending, and a neighboring word can change the meaning, so selecting one fragment of a word and discarding the rest is not enough.

Embeddings make it possible to search for semantic equivalents. Candidates then need to be checked in context: similar vectors occur for both synonyms and antonyms. The final selection criterion is how the main model understands the converted text and performs the task. [Research on distinguishing antonyms from synonyms](https://aclanthology.org/P19-1319/).

## The same content in different languages

Even today, texts with the same meaning can have different token counts depending on the language. Petrov and colleagues studied this effect and found differences of up to 15 times for particular languages and tokenizers. [Language Model Tokenizers Introduce Unfairness Between Languages, NeurIPS 2023](https://arxiv.org/abs/2305.15425).

A clear example is a short greeting in which the model introduces itself to the person it is speaking with. OpenAI published it in 20 languages; here are the token counts for eight versions, counted using the same GPT‑4o tokenizer. [OpenAI data, May 13, 2024](https://openai.com/index/hello-gpt-4o/#language-tokenization).

| Language | Token count |
|---|---:|
| Russian | 23 |
| English | 24 |
| Chinese | 24 |
| Spanish | 26 |
| Japanese | 26 |
| Arabic | 26 |
| Hindi | 31 |
| Telugu | 45 |

Here, the Russian version was shorter than the English one, while Telugu required almost twice as many tokens. The ratio changes with the wording and the model’s vocabulary. This provides a reason to search for compact equivalents across languages instead of choosing one language for all conversions.

## The vocabulary needs to be prepared in advance

The main work begins before the first user request. We need to study the vocabularies and embedding spaces of existing neural networks, use open models to search for equivalents, and select compact expressions for concepts, actions, and relationships. Then we need to test them and compile the Smyslocode vocabulary.

This could be a large and lengthy research effort. In everyday use, however, the translators will work with prepared mappings. The language is developed in advance; using it should be fast.

Alongside the vocabulary, we need conversion rules. They must preserve negation, conditions, time, possession, and the direction of an action. “A passed the document to B” and “B passed the document to A” describe different events. “May be deleted” and “must not be deleted” call for opposite actions. A compact representation must convey these differences.

At the first stage, the rules guide the translator: it builds sequences from tokens and meanings familiar to the model. These tokens are not assigned arbitrary new meanings.

I see Smyslocode as a relatively universal language for neural networks, independent of any single human language. We can begin with a vocabulary for a particular model, then test its portability and identify a shared subset.

## Translate the entire input stream

**Ordinary text → input translator → Smyslocode → main model → output translator → response in the user’s language.**

All textual content passes through the input translator: requests, documents, conversation history, and tool results. It converts the stream into Smyslocode and keeps a conversion log.

The main model works with the compact representation. The output translator receives its result, the original text, and information about the conversion. Using these, it restores names and terminology and formulates the response in the language of the request. I envisage small, fast neural networks for both translators.

Numbers, names, program code, and exact quotations can be left in their original form. Ordinary text is retained wherever conversion is not beneficial or reliable.

The criterion for the entire pipeline is preservation of meaning and completion of the task. Responses may differ in wording. Finding a contradiction requires preserving statements and the relationships between them; working with a quotation requires its exact text. Accuracy requirements therefore depend on the nature of the work.

## Related approaches

Research on prompt compression already provides several directions to build on.

**LLMLingua-2** trains a small model to select the tokens that should be retained. Smyslocode adds a search for compact equivalents from a vocabulary selected in advance to the removal of redundancy. [LLMLingua-2](https://aclanthology.org/2024.findings-acl.57/).

**Cross-Lingual Token Arbitrage** combines translating a prompt into English with rewriting it compactly. Smyslocode extends the search to tokens from any language, including the original one. [Cross-Lingual Token Arbitrage](https://arxiv.org/abs/2606.03618).

**Lexical Prompt Compression** uses lexical transformations: removing redundant elements, abbreviating, and substituting shorter synonyms. This is a related direction for comparison with Smyslocode’s vocabulary-based transformations. [Lexical Prompt Compression](https://arxiv.org/abs/2609.13154).

In **SPAE**, a trained encoder converts images and video into existing tokens from a multilingual vocabulary. An unchanged language model works with this representation, and a decoder reconstructs the visual data. An architecture with external converters and an unchanged main model has thus already been implemented for visual tasks. [SPAE](https://arxiv.org/html/2306.17842v2).

In **Large Language Model as Token Compressor and Decompressor**, text is converted into short sequences of Z-tokens. The approach supports processing in the space of these codes and expanding the result. This requires extending the vocabulary and training adapters; the first stage of Smyslocode uses the existing vocabulary without changing the main model. [Research on Z-tokens](https://arxiv.org/html/2603.25340v2).

My proposal combines preliminary research into existing representations, a compact multilingual vocabulary, conversion rules, and two translators. These works provide methods and results against which such a system needs to be compared.

## First stage: running existing models

The starting point was a question about memory for long contexts. During generation, a language model stores intermediate data about processed tokens in a KV cache—a cache of the attention mechanism’s keys and values. How they are stored depends on the architecture and implementation. [Caching strategies in Transformers](https://huggingface.co/docs/transformers/kv_cache).

Smyslocode shortens the sequence the main model has to process. Its weights, vocabulary, and input embeddings remain unchanged. The expected benefits are a smaller KV cache, less computation, and faster responses. The size of the model’s weights remains the same.

This opens up two possibilities: fitting more original content into the available window or processing the same amount at a lower cost. For example, working more efficiently with material containing 260 thousand original tokens, then moving toward much longer contexts, up to a million. Useful capacity grows through a compact representation of the material within the standard token window.

The speed of the system is determined by the entire pipeline. Alongside the main model, we therefore need to measure the translators’ work and the storage of the original text and conversion log. The cost of preparing the vocabulary in advance is accounted for separately.

Available open-model files, remote resources, and APIs are enough to begin the research. A GPU of one’s own is not required. An API can be used to test understanding of compact prompts; measuring the KV cache requires access to the model’s runtime environment. A closed text API generally exposes neither cache usage nor the internal embedding table.

## Second stage: training on Smyslocode

The next step is to convert training corpora into Smyslocode. New models will learn from the outset to process and generate compact sequences. Translators will enable them to interact with human languages.

I expect shorter sequences to save computation during training as well. To assess the benefit, we need to compare the costs of reaching the same quality: corpus preparation, the number of passes through the data, and computation per pass. A denser representation changes the difficulty of prediction, so the relationship between cost and compression level needs to be measured.

Preparing the corpus requires particular attention to content: anything lost in translation will no longer reach training through that corpus.

## What this could offer

The first direction is efficiency. Shortening the input stream should reduce the cost of running existing models, expand the useful capacity of the context, and deliver results faster. For new models, there is also the prospect of more economical training.

The second is narrowing the gap between languages. Equivalent messages can be translated into a shared intermediate representation so that the main model’s performance depends less on the user’s language. For this, the translators must also convey idioms, cultural associations, and ambiguities. Comparing the quality of the entire pipeline across languages will show how far this task has been addressed.

The third is research into language and thought. In developing Smyslocode, we will investigate which structures are necessary to preserve meaning: negation, causality, time, possession, and relationships between participants. What can be expressed more compactly? Which relationships need to be preserved explicitly? Where does shortening destroy content?

I see this work as an opportunity to better understand the language representations of artificial intelligence and to develop new questions and methods for studying human language and thought. Comparing the structures we find with how people understand and express meaning could become a research direction in its own right.

## How to test the idea

To begin, we can take an open multilingual model with roughly 4–8 billion parameters and a small Smyslocode vocabulary. Tests can be run locally or remotely, keeping the main model’s weights unchanged.

1. **Find equivalents.** Study the vocabulary and embeddings, and select compact replacements for words and phrases. Test them in different contexts, particularly negation, conditions, and relationships. Count the tokens in the entire resulting sequence.
2. **Build the translators.** Start with vocabulary-based transformations and existing small models. Also test the main model’s direct response in the user’s language to isolate the output translator’s contribution.
3. **Separate selection from testing.** Freeze the vocabulary and rules after selection, then test them on other documents, topics, and phrasings.
4. **Compare compression methods.** Use the same tasks in their original form, after concise rewriting, after translation into English, and after conversion into Smyslocode. Add available methods from related research.
5. **Measure quality and costs.** Check response correctness, preservation of requirements, token count, memory, and the time taken by the entire pipeline. Include instructions and examples for the model in the calculation. Save its raw response: this will reveal what the main model solved and what the output translator corrected or solved anew.
6. **Test portability.** Test the prepared vocabulary on another model. Determine which part transfers directly and which requires a separate profile.

The three main obstacles are semantic errors in replacements, translator costs, and the vocabulary’s dependence on the model. These tests should show where they arise and how they affect the result. Unsuccessful replacements will help identify which relationships require more detailed expression.

Smyslocode begins with a practical task: conveying the same content to a model in fewer tokens. Beyond that lies the possibility of a shared intermediate language for running neural networks and preparing training data. Finding its vocabulary, testing combinations, and measuring the resulting effect is the immediate work I propose undertaking.
