---
name: code-review
description: Use when the user asks for a code review, self-review, reliability review, or to find bugs, duplication, unused code, or maintainability improvements in SAGE.
---
# SAGE code review workflow

## Review the requested scope

1. Identify the requested files, feature, or diff. If the user asks about current changes, inspect the actual working-tree diff before reviewing.
2. Read the nearby implementation and tests needed to understand behavior. Do not broaden the review to unrelated modules.
3. Check correctness and behavioral regressions first, then reliability, security, API/data contracts, and maintainability.

## Report actionable findings

- Lead with findings ordered by severity. For each finding, cite the file and line, explain the concrete impact, and describe a suitable fix.
- Report only issues supported by the code or tests. Separate confirmed defects from risks that depend on an assumption; omit style preferences without meaningful impact.
- Look for unnecessary duplication, unused code, excess abstractions, and dependencies, but do not assume fewer files or fewer lines automatically means a better design.
- Recommend the best in-scope solution, not merely the smallest patch. Do not include unrelated cleanup.

## Make changes only when requested

- For a feedback-only review, report findings and recommendations without editing files.
- If the user asks to fix or apply review findings, implement only the relevant in-scope fixes, add or update focused tests, and run the narrowest useful validation.
- State important assumptions and remaining test gaps. Do not claim a check passed unless it was run successfully.