## Code Splitting

- Keep each file focused on one reason to change.
- Split code when a file mixes orchestration, domain logic, rendering, and I/O.
- Extract reusable behavior only after the second real use case appears.
- Prefer small named functions over hidden boolean flags or deeply nested branches.
- Keep public APIs narrow; move helper details behind local functions or internal modules.
- When splitting code, move tests with the behavior and keep existing import paths stable when possible.
- Avoid broad refactors while fixing a bug unless the split is needed to make the fix safe.
