# What makes a site look AI-made, and what we do about it

Research done 2026-09-28 for the records app: MKW Time Trials, Lounge and wars, BO7 Zombies with the cousins.

## The short version

No single choice makes a UI look generated. What gives it away is the **default setting of everything
at once**: Tailwind and shadcn tokens left untouched, Inter, a violet primary, centred layouts, identical
cards, soft shadows, and copy that avoids saying anything specific. Anthropic's own write-up calls
this *distributional convergence*: with no direction, a model picks from the most common choices in
its training data ([Anthropic, Nov 2025](https://claude.com/blog/improving-frontend-design-through-skills)).
One guide puts it as "one of these is a coincidence, four or more is a confession"
([summary of tells](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)).

There's also a second-order trap. The popular "anti-AI" fixes are becoming tells of their own:
Space Grotesk as the "anti-Inter", Instrument Serif with one italic word, glassmorphism, cream paper
with a serif ([Wiegold](https://thomas-wiegold.com/blog/claude-code-frontend-design-plugin/),
[Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)).
So we don't just steer away from the defaults. Each direction has to come from a real, named
reference in the player's world.

## Checklist: tell → our rule

Each line gives a tell, then the rule we adopt against it. A mockup passes if it breaks none of the rules.

### Typography
| # | Tell | Our rule |
|---|---|---|
| T1 | Inter for everything, including display text ([925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide), [uxskill](https://uxskill.laithjunaidy.com/blog/shadcn-ui-looks-generic.html)) | No Inter, Roboto, Arial or system-ui as a visible face. |
| T2 | The "safe alternatives" on repeat: Space Grotesk, Geist, Instrument Serif, plus Fraunces, Playfair, DM Serif and Clash/Satoshi/General Sans ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)) | None of these. Each face has to justify itself through the reference: broadcast graphics or newspaper sports pages. |
| T3 | A single serif italic word used as the hero accent | Never. Italic only where print would use it, such as a photo caption. |
| T4 | Proportional digits in stats, so times jump around | Every time, delta, round and MMR uses `font-variant-numeric: tabular-nums`, right-aligned or aligned on the decimal point ([Tufte on timetables](https://www.edwardtufte.com/notebook/table-and-timetable-design-and-typography/), [Type Network](https://typenetwork.com/articles/opentype-at-work-figure-styles)). |
| T5 | All-caps small grey labels on every section ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)) | Caps only where the reference uses them: 3-letter player codes (F1 TLAs and arcade initials) and column heads in dense tables. Section titles are real headlines. |
| T6 | Default weight ladder (400/500/600) and "text-sm muted" everywhere | Big contrast in size and weight. The PB time is the largest thing on the screen, not the page title. |

### Colour
| # | Tell | Our rule |
|---|---|---|
| C1 | "VibeCode purple" (#6366F1–#8B5CF6) and purple-to-blue gradients ([DEV](https://dev.to/james_anderson_h/the-purple-gradient-problem-why-ai-ui-all-looks-alike-and-how-to-fix-it-3j65), [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)) | No gradients anywhere. Purple exists in one direction only, and only as the F1 timing state "faster than the world record split". It's never a brand colour. |
| C2 | Zinc neutral ramp untouched, with a violet primary ([uxskill](https://uxskill.laithjunaidy.com/blog/shadcn-ui-looks-generic.html)) | Neutrals come from the reference (broadcast black, newsprint pink), not from Tailwind's grey scale. |
| C3 | 5–6 neon colours competing for attention ([Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)) | One dominant ground, one ink, and at most one accent. All other colour carries data meaning with a legend. |
| C4 | Glows, coloured shadows, aurora backgrounds ([Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)) | No box-shadow with colour, no blur, no glow. Depth comes from rules, weight and contrast. |
| C5 | Permanent dark mode with low-contrast grey body text that fails AA ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)) | One direction is dark because the reference is a TV timing screen. Its body text is near-white, above 7:1. The other direction is light. |
| C6 | Meaningless status dots ([Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)) | A colour chip only exists if it maps to a defined state: WR, PB, slower, or no reference. |

### Layout and components
| # | Tell | Our rule |
|---|---|---|
| L1 | Centred hero, badge above the H1, one CTA ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)) | No hero. The first thing on screen is the latest record. |
| L2 | Three or six identical rounded cards with an icon on top ([Sinton](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)) | No card grids. Records are **rows in a table**, like a timing tower, a classification sheet or a box score. |
| L3 | Uniform 16px radius and 24px padding everywhere ([925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide)) | Radius 0 in both directions. Spacing varies on purpose: dense tables, generous around the PB. |
| L4 | Cards inside cards inside cards ([Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)) | One level of container at most. Group with rules (lines) and whitespace. |
| L5 | Coloured left-border stripe on cards and quotes ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)) | Banned. |
| L6 | Stat banner row ("12k users · 99.9% uptime") and bento grids ([DEV](https://dev.to/mukund_parekh_99a46547e34/ai-slop-has-a-look-heres-how-to-spot-it-3f67)) | No "big number + label" tile row. Numbers sit where they belong: in the table, next to what they measure. |
| L7 | Layouts that break at widths nobody prompted for ([Sinton](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)) | Checked at 390 and 1440 with screenshots. Tables reflow deliberately rather than scrolling by accident. |
| L8 | Smooth spline area chart with a gradient fill | PB progression is a **step chart**, because a PB only drops at the moment it's set. It has a WR reference line, direct labels and no gradient. A step line is the honest shape for a record that only ever improves. |

### Iconography
| # | Tell | Our rule |
|---|---|---|
| I1 | Lucide icons on every button and heading ([Sinton](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)) | No icon pack. Text labels first. The few glyphs we need (play, clip, camera) are drawn as bespoke SVG in the direction's own language. |
| I2 | Emoji as icons, and sparkles or rockets in headings ([Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)) | Zero emoji. Flags appear as ISO codes (GB, DE, US), the way timing sheets print nations. |

### Copy
| # | Tell | Our rule |
|---|---|---|
| W1 | Vague headlines ("Track your gaming journey", "Level up") ([Sinton](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)) | Headlines state a fact: "Crown City, 2:05.917. New PB by 0.367". |
| W2 | Slop vocabulary: seamless, unlock, elevate, effortless, journey, dive in, "not just X but Y" ([MarTech AI](https://charliehills.substack.com/p/ai-slop), [SlopMonster](https://github.com/ItsssssJack/SlopMonster/blob/main/SKILL.md), [Ritner](https://www.ritnerdigital.com/blog/the-phrases-that-give-away-ai-writing-and-how-to-edit-them-out-before-they-cost-you-trust)) | Grep before shipping: none of these words, in EN or ES. |
| W3 | "Welcome back, Alex 👋", empty-state cheerleading | No greeting. The player's code and the date are enough. |
| W4 | Em-dash pile-ups in UI copy ([example cleanup PR](https://github.com/Automotive-Insight/automotive-insight-main/pull/37)) | No em dashes in UI strings. Use middle dots, colons or full stops. |
| W5 | Placeholder data (John Doe, 1234, "Lorem") | Real tracks, real WRs from [mkwrs.com](https://mkwrs.com/) (with holder and date), real BO7 maps and modes. |
| W6 | The community's formats ignored | We use the community's formats: times `1:28.620`, splits, "Non-SC", 150cc/200cc, Lounge MMR, 6v6 war score out of 984 ([MKCentral guide](https://www.mariokartcentral.com/wp/mkcentral-new-player-guide/)). |

### Motion
| # | Tell | Our rule |
|---|---|---|
| M1 | Fade-up-on-scroll on every block, hover lift `translateY(-2px)` with a bigger shadow ([925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide)) | No scroll reveals. Motion only where the reference has it. Direction A has a timing-board "tick" when a time lands. Direction B has none (it's print). |
| M2 | Scattered micro-interactions | `prefers-reduced-motion` kills everything. Hover = underline or colour inversion, never lift. |

### Build traces
| # | Tell | Our rule |
|---|---|---|
| B1 | Stock favicon, `<title>My App</title>`, no alt text ([Sinton](https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website)) | Real titles, alt text on proof thumbnails, labelled inputs, a visible focus ring in the direction's own style. |

## References we steal from (on purpose)

- **F1 timing screens**: purple = fastest overall, green = personal best, yellow = slower than your
  own best, white = no reference ([RacingNews365](https://racingnews365.com/what-sectors-are-f1-and-what-do-the-different-colours-mean),
  [The Field](https://www.thefieldf1.com/charts/sector-colours)). This maps one-to-one onto splits vs PB and WR.
  Broadcast criticism is also worth keeping: italic times hurt legibility ([RaceFans](https://www.racefans.net/2022/06/05/information-overload-which-motorsport-series-has-the-most-effective-tv-graphics-package/)),
  and truncated decimals made fans angry ([GPFans](https://www.gpfans.com/en/f1-news/1078428/f1-2026-tv-broadcast-new-timing-tower-graphic/)).
  So times are always upright and always shown to the millisecond.
- **mkwrs.com / speedrun culture**: dense tables, time links to the video, date, nation code. Proof is
  a link, not decoration ([mkwrs.com](https://mkwrs.com/), [MKWorld WR history](https://mkwrs.com/mkworld/)).
- **Arcade high-score tables**: 3-letter initials were a hard constraint that became an identity
  ([Arcade Blogger](https://arcadeblogger.com/2021/01/31/anatomy-of-arcade-high-score-tables/),
  [Toshi Omagari on arcade typography](https://degradedorbit.com/articles/arcade-game-typography/)).
- **Newspaper sports pages**: agate box scores, standings, heavy condensed headlines, and pink paper
  (La Gazzetta dello Sport). Tables are the content, not a widget.
- **Split-flap / Solari boards**: fixed-width cells, and information that changes in place
  ([Wikipedia](https://en.wikipedia.org/wiki/Split-flap_display)).

## Real data used in the mockups (checked 2026-09-28)

- DK Spaceport 150cc WR 1:28.620, Darragh (GB), 2026-07-13, splits 24.111 · 14.274 · 12.612 · 12.467 · 12.080 · 13.076 ([video](https://www.youtube.com/watch?v=ZYbe6QydJSc), [mkwrs](https://mkwrs.com/mkworld/display.php?track=DK+Spaceport)).
- Crown City 150cc WR 2:03.410, Lean (DE), 2026-06-14, splits 52.638 · 42.461 · 28.311 ([video](https://www.youtube.com/watch?v=KL9U607u3Vc)).
- Rainbow Road 150cc WR 3:52.848, Technical (US), 2026-07-29 ([video](https://www.youtube.com/watch?v=-uu2WfPCQYM)).
- Peach Stadium 2:13.782 and Sky-High Sundae 1:52.717 (from the [mkwrs.com](https://mkwrs.com/) homepage).
- MKW 1.8.0 (2026-09-09) shows per-lap times in Time Trials, so splits are now easy to copy off the screen ([Nintendo Life](https://www.nintendolife.com/news/2026/09/mario-kart-world-has-been-updated-to-version-1-8-0-here-are-the-full-patch-notes)).
- TT combos: Bowser with Reel Racer or Baby Blooper ([Kotaku](https://kotaku.com/mario-kart-world-switch-2-time-trial-best-characters-1851785952)). Pii used Wario (Work Crew) with B Dasher.
- BO7 Zombies: Ashes of the Damned (launch), Astra Malorum, Paradox Junction, Totenreich, Kowakujō,
  Rex Infernus (2026-08-20, final map, War Mother and Warden bosses). Modes: Standard, Directed, Survival,
  Cursed, Cursed Survival ([CoD Wiki](https://callofduty.fandom.com/wiki/Rex_Infernus), [PCGamesN](https://www.pcgamesn.com/call-of-duty-black-ops-7/zombies-modes)).
- Lounge: MMR, 12P/24P ladders, mogi formats (2v2 … 6v6). A war is 6v6 over 984 points, and 493+ wins
  ([MKCentral](https://mkcentral.com/en-us/lounge), [new player guide](https://www.mariokartcentral.com/wp/mkcentral-new-player-guide/)).
- Player times (Andrés and cousins) are invented but plausible: all within 1–4 s of the WR.
