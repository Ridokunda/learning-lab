# Validation

Validated on 10 September 2026.

## Repeatable offline checks

Run `node build.cjs`, then `node test.cjs`. No packages need to be installed.

The tests execute the actual JavaScript embedded in the downloadable HTML with a minimal DOM/storage harness. They cover:

- 120 unique questions, four distinct choices each, six groups of 20, and eight questions per topic.
- JavaScript syntax and absence of external asset dependencies or network requests.
- Rejection of incomplete submissions without losing selected answers.
- Persistence and restoration of answers, scores, and the selected view.
- A mixed 108/120 attempt, plus all-correct and all-incorrect attempts.
- Topic totals, percentages, submitted-only grading, and locked graded answers.
- Text report contents, new attempts, invalid saved data, and blocked browser storage.

## Browser checks

The same standalone HTML was served locally for browser interaction tests. Direct `file://` navigation is restricted by the testing browser, so that navigation mode could not be exercised there. The HTML contains no imports, remote resources, or server calls.

- Selected all 20 answers in one group, reloaded, and confirmed all selections persisted.
- Submitted the group and verified the expected 5/20 (25%) result.
- Checked total score, topic breakdown, incomplete-group treatment, and 15 missed-question entries.
- Expanded a missed question and verified the selected answer, correct answer, and explanation.
- Exercised report generation and the download button without console errors. The browser automation download-event hook did not confirm completion; text report contents are checked by the offline test.
- Checked cancel and confirm paths for starting a new attempt; confirmed scores reset.
- Verified the optional read-only report tool returns the visible scores and rejects invalid input.
- Inspected desktop and narrow-screen layouts.

This is functional validation, not a claim of exhaustive browser compatibility or a formal accessibility audit.
