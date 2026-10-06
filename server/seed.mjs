// Starter notes written into an empty vault on first run.
const day = 24 * 60 * 60 * 1000
const ago = (days, hours = 0) => new Date(Date.now() - days * day - hours * 3600_000).toISOString()
const ymd = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const today = ymd(new Date())
const yesterday = ymd(new Date(Date.now() - day))

const card = (id, x, y, w, h, color, text) =>
  `<!-- card id=${id} x=${x} y=${y} w=${w} h=${h}${color ? ` color=${color}` : ''} -->\n${text}\n<!-- /card -->`

export function seedNotes() {
  const n = (path, fields) => ({
    path,
    title: path.split('/').pop().replace(/\.md$/, ''),
    created: ago(3),
    updated: ago(1),
    ...fields,
  })
  return [
    n('Welcome to Margin.md', {
      pinned: true,
      tags: ['guide'],
      created: ago(0, 2),
      updated: ago(0, 1),
      content: `Margin keeps every note as a plain markdown file in a folder on your disk. No database, no lock-in — open the \`vault\` folder in any editor and it all still makes sense.

## Find your way around

- **⌘K** — search everything, jump between notes, run commands. Press it twice-quick: the first result is always the note you were just in.
- **⌥C** — quick capture from anywhere. It lands in today's daily note.
- **⌥D** — open today's daily note. **⌥N** — new note. **⌥S** — new scratch note.
- **⌘E** — switch to a read-only view and back. **⌘.** — show or hide the backlinks pane.

## What to try

- [ ] Open the [[Markdown tour]] to see tables, math and code
- [ ] Open today's daily note and drag some cards around the canvas
- [ ] Type \`[[\` in any note to link to another one
- [ ] Capture a link in **Research** and collect a few quotes
- [ ] Make a scratch note — it cleans itself up after a week

## How things are organised

| Thing | What it is on disk |
| --- | --- |
| Notebook | A folder |
| Note | A \`.md\` file with a little frontmatter |
| Tag | \`tags:\` in frontmatter, or an inline #hashtag |
| Canvas | Cards stored as markdown at the end of the note |
| Images & PDFs | Files in \`attachments/\` |
| History | Snapshots in \`.history/\` |

Notes link to each other with \`[[double brackets]]\`. See [[Reading list]] or [[Project Atlas — kickoff]] for examples, and check the backlinks pane on the right to see what points here.`,
    }),
    n('Learning/Markdown tour.md', {
      tags: ['guide', 'markdown'],
      created: ago(2),
      updated: ago(0, 3),
      content: `Everything here is standard markdown, rendered as you type. Put the cursor on a line to see and edit its source.

## Text

Regular, **bold**, *italic*, ~~struck~~, \`inline code\`, and [links](https://commonmark.org). Inline tags like #markdown work anywhere.

> A blockquote for the line you want to remember.

## Lists and tasks

1. Ordered lists
2. Keep counting on Enter

- [x] Tasks can be ticked with a click
- [ ] The file updates when you tick them

## Tables

| Method | Time | Space | Stable |
| :-- | :-: | :-: | :-: |
| Merge sort | $O(n \\log n)$ | $O(n)$ | yes |
| Quick sort | $O(n \\log n)$ avg | $O(\\log n)$ | no |
| Heap sort | $O(n \\log n)$ | $O(1)$ | no |

## Math

Inline math sits in the sentence, like $e^{i\\pi} + 1 = 0$. Display math gets its own line:

$$
\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\, e^{-2\\pi i x \\xi}\\, dx
$$

$$
\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}
\\qquad
\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
$$

## Code

\`\`\`python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

## Images and files

Paste or drop an image straight into the editor. It is saved to \`attachments/\` and linked like any markdown image. PDFs embed the same way: \`![paper](attachments/paper.pdf)\`.

Back to [[Welcome to Margin]].`,
    }),
    n('Work/Project Atlas — kickoff.md', {
      tags: ['atlas', 'meeting'],
      pinned: true,
      created: ago(6),
      updated: ago(1, 4),
      content: `**Attendees:** Priya, Marcus, Elena, me

## Goals for the quarter

1. Cut onboarding time from 9 days to 4
2. Ship the new permissions model behind a flag
3. Retire the legacy export pipeline

## Decisions

- Weekly sync moves to Tuesdays
- Elena owns the migration plan, see [[Atlas migration plan]]
- We write a short decision record for anything that changes the data model

## Action items

- [x] Share the draft timeline
- [ ] Review risks with security
- [ ] Book the customer interviews

## Open questions

How much of the export pipeline is still used? Marcus thinks under 5% of accounts. Need numbers before we commit. #question`,
    }),
    n('Work/Atlas migration plan.md', {
      tags: ['atlas', 'plan'],
      created: ago(5),
      updated: ago(2),
      content: `Follows from [[Project Atlas — kickoff]].

## Phases

| Phase | Scope | Owner | Target |
| --- | --- | --- | --- |
| 0 | Audit current usage | Marcus | Week 1 |
| 1 | Dual-write to new store | Elena | Week 3 |
| 2 | Backfill and verify | Elena | Week 5 |
| 3 | Cut over, keep rollback | Priya | Week 7 |

## Risks

- Backfill throughput. Rough estimate: $\\frac{4.2 \\times 10^8 \\text{ rows}}{12{,}000 \\text{ rows/s}} \\approx 9.7$ hours
- Rollback window is short once dual-write stops

## Notes

Keep the old tables read-only for 30 days after cut-over.`,
    }),
    n('Work/1-1 notes.md', {
      tags: ['meeting'],
      created: ago(9),
      updated: ago(3),
      content: `Running notes, newest first.

## This week

- Feedback on the Atlas proposal: tighten the summary, lead with the customer problem
- Growth: write more, present at the next all-hands

## Last week

- Agreed to hand off on-call rotation planning
- Asked for a budget line for the research interviews`,
    }),
    n('Research/How to take smart notes.md', {
      type: 'article',
      tags: ['notes', 'reading'],
      source: 'https://en.wikipedia.org/wiki/Zettelkasten',
      status: 'reading',
      created: ago(4),
      updated: ago(1, 2),
      content: `## Summary

A Zettelkasten is a web of small notes, each about one idea, linked to the others. The value comes from the links, not the pile.

## Quotes

> One cannot think without writing.

> The slip-box is not a collection of notes. Working with it is less about retrieving specific notes and more about being pointed to relevant facts.

## My notes

- Write notes in my own words, one idea each
- Link when writing, not later. Compare with [[Reading list]]
- Daily notes are the inbox; the good bits graduate into their own notes

## Links

- [Zettelkasten on Wikipedia](https://en.wikipedia.org/wiki/Zettelkasten)`,
    }),
    n('Research/Spaced repetition.md', {
      type: 'article',
      tags: ['learning', 'memory'],
      source: 'https://en.wikipedia.org/wiki/Spaced_repetition',
      status: 'unread',
      created: ago(2),
      updated: ago(2),
      content: `## Summary

Reviewing just before you would forget is far more efficient than cramming.

## Quotes

>

## My notes

The forgetting curve is roughly $R = e^{-t/S}$ where $S$ is the stability of the memory. Each successful review increases $S$.`,
    }),
    n('Learning/Linear algebra — eigenvalues.md', {
      tags: ['math', 'learning'],
      created: ago(7),
      updated: ago(4),
      content: `A vector $v \\neq 0$ is an eigenvector of $A$ if $Av = \\lambda v$ for some scalar $\\lambda$.

## Finding them

Solve the characteristic equation:

$$
\\det(A - \\lambda I) = 0
$$

For a $2 \\times 2$ matrix this is $\\lambda^2 - \\operatorname{tr}(A)\\,\\lambda + \\det(A) = 0$.

## Example

$$
A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}
\\quad\\Rightarrow\\quad
\\lambda_1 = 3,\\; \\lambda_2 = 1
$$

## Why it matters

- Diagonalisation: $A = PDP^{-1}$ makes powers of $A$ cheap
- PCA picks the eigenvectors of the covariance matrix with the largest eigenvalues

Related: [[Markdown tour]] for more math syntax.`,
    }),
    n('Personal/Reading list.md', {
      tags: ['reading'],
      created: ago(12),
      updated: ago(2),
      content: `## Now

- *The Pragmatic Programmer* — halfway
- [[How to take smart notes]]

## Next

- [ ] *Thinking in Systems*
- [ ] *A Philosophy of Software Design*
- [ ] *The Design of Everyday Things*

## Done

- [x] *Deep Work*`,
    }),
    n('Personal/Trip to Lisbon.md', {
      tags: ['travel'],
      created: ago(15),
      updated: ago(8),
      content: `## Plan

| Day | Area | Ideas |
| --- | --- | --- |
| Fri | Alfama | Tram 28, Miradouro de Santa Luzia |
| Sat | Belém | Pastéis, the tower, MAAT |
| Sun | Sintra | Pena Palace, early train |

## To book

- [x] Flights
- [ ] Sintra train tickets
- [ ] Dinner on Saturday`,
    }),
    n('Ideas/App ideas.md', {
      tags: ['idea'],
      created: ago(10),
      updated: ago(5),
      content: `- A habit tracker that only asks one question a day
- Shared grocery list that learns the shop layout
- Browser extension that saves the paragraph, not the page`,
    }),
    n(`Daily/${yesterday}.md`, {
      type: 'daily',
      created: ago(1, 6),
      updated: ago(1, 1),
      content: `- 09:10 Standup: migration audit is ahead of schedule
- 11:30 Read half of [[How to take smart notes]]
- 16:45 Idea: link daily notes to the projects they mention`,
    }),
    n(`Daily/${today}.md`, {
      type: 'daily',
      view: 'canvas',
      created: ago(0, 3),
      updated: ago(0, 1),
      content: `- Morning pages go here. Switch to **Canvas** to lay the day out spatially.

<!-- canvas -->
${card('c1', 0, 0, 280, 170, 'amber', '### Today\n\n- [ ] Review risks with security\n- [ ] Draft the Atlas summary\n- [x] Inbox to zero')}
${card('c2', 340, -20, 280, 130, 'blue', '**Atlas**\n\nKickoff notes are in [[Project Atlas — kickoff]]. The plan lives in [[Atlas migration plan]].')}
${card('c3', 340, 170, 280, 150, 'green', '**Reading**\n\nContinue [[How to take smart notes]]\n\n> Link when writing, not later.')}
${card('c4', 0, 230, 280, 120, '', 'Double-click empty space to add a card. Drag the dot on a card to connect it to another.')}
${card('c5', 680, 60, 240, 120, 'pink', '**Idea**\n\nBackfill estimate: $\\approx 9.7$ hours. Worth a dry run first?')}
<!-- edge from=c1 to=c2 -->
<!-- edge from=c2 to=c5 -->
<!-- edge from=c1 to=c3 -->`,
    }),
    n('Scratch/Scratch — call with vendor.md', {
      type: 'scratch',
      created: ago(1),
      updated: ago(1),
      expires: new Date(Date.now() + 6 * day).toISOString(),
      content: `- Renewal is up in March
- They can do 15% if we commit to two years
- Ask about the audit log add-on`,
    }),
    n('Scratch/Scratch — regex for dates.md', {
      type: 'scratch',
      created: ago(0, 5),
      updated: ago(0, 5),
      expires: new Date(Date.now() + 1 * day).toISOString(),
      content: '```\n\\d{4}-\\d{2}-\\d{2}\n```\n\nMatches ISO dates. Delete me once the script works.',
    }),
  ]
}
