## Testing

- Add or update tests for behavior changes, bug fixes, and public API changes.
- Prefer focused tests that describe user-visible behavior over implementation details.
- Cover the failure path when the change adds validation, parsing, file writes, or security checks.
- Keep fixtures small and local to the test unless several suites share the exact same setup.
- Run the narrowest relevant test first, then the project quality script before finishing.
- If a test cannot be run, explain the reason and the remaining risk.
