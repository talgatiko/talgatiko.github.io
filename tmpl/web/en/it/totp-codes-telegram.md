---
author: talgatiko
source: https://github.com/talgatiko/telegram-totp-widgets
date: 2026-11-11
description: "A Telegram bot for displaying TOTP codes: how it works,
  convenience and security limitations."
title: TOTP Codes in Telegram
source_sha256: e6fd894ee6f239146f514abddef00b16bac3e9ea54d9929fab8e1d50f6e5ad17
approval_sha256: e6fd894ee6f239146f514abddef00b16bac3e9ea54d9929fab8e1d50f6e5ad17
translation_source_sha256: e6fd894ee6f239146f514abddef00b16bac3e9ea54d9929fab8e1d50f6e5ad17
translation_engine: Codex
translation_model: gpt-6-astra
---
# TOTP Codes in Telegram

GitHub required a second factor to sign in. I needed somewhere to store and get one-time codes across devices without installing a separate app. That's how I decided to build a Telegram bot.

[The @totp_widgets_bot bot](https://t.me/totp_widgets_bot) creates cards with TOTP codes right in the chat. Send it an `otpauth://` setup link, or a name and secret key on two separate lines. The bot will reply with a widget; you can find the card by its name using the usual chat search.

The key is stored in the Telegram message data. The widget itself calculates the changing code locally on the device. The bot server is needed to create the card, not to calculate codes afterward. You can open the chat on another device running a version of Telegram that supports widgets.

But that convenience comes at a price. The secret passes through the bot's handler and remains in the message: anyone who gains access to the chat or the device can obtain the key and calculate future codes. So keep a separate backup of the key and your recovery codes.

As I wrote in the [project README](https://github.com/talgatiko/telegram-totp-widgets):

> **The bot is insecure, it's complete shit when it comes to security, don't use it!**

I made it for people who want to use codes right in Telegram and don't want to install anything extra. But what I want is for this feature to become part of Telegram itself:

> Pavel and co., ~~bring back the wall~~, please implement this feature in Telegram's Saved Messages: if a message contains a TOTP link, display it as a widget.

[Open the bot in Telegram](https://t.me/totp_widgets_bot) · [Source code on GitHub](https://github.com/talgatiko/telegram-totp-widgets)
