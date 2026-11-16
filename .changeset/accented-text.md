---
"gpxsnap": patch
---

Text rendering no longer throws on accented characters: a GPX named "Sortie l'après-midi" used to fail with `unsupported character in text: "è"`. The bitmap font now has French and common Latin-1 accented letters (lower and upper case, plus ç, œ, æ, ß, ñ), extra symbols (`# @ & _ = * ; < > [ ] ° " €`), maps typographic quotes, dashes and non-breaking spaces to their plain forms, strips diacritics it has no glyph for (ő → o), and draws a visible box for anything else instead of throwing. Decomposed (NFD) input is normalized first.
