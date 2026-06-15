## Code Review

- Review correctness, edge cases, compatibility, and rollback risk before style.
- Treat generated files, lockfiles, and config changes as part of the behavioral surface.
- Check whether new inputs are normalized before validation or security decisions.
- Verify that user-authored content is preserved outside managed blocks.
- Prefer concrete file and line references when reporting issues.
- If no issues are found, state the residual test or integration risk plainly.
