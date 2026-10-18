# FigueIt

Paver and tile layout calculator. Describe a patio (rectangle, triangle, L-shape, trapezoid, or a custom
outline you draw), pick a paver size and pattern, and FigueIt gives the square footage, how many full and cut
pavers you need, an order quantity with waste, and a drawing of the layout.

It is built twice, to the same spec, so the two stacks can be compared:

| Folder    | Stack                                          |
|-----------|------------------------------------------------|
| `web-ts/` | TypeScript, React, Vite, polygon-clipping      |
| `blazor/` | C#, Blazor WebAssembly (.NET 10), NetTopologySuite |
| `shared/` | `SPEC.md` (engine rules), `spec.json` (worked examples both engines must pass), `UI.md` (feature spec) |

## Run locally

React version (http://localhost:5173):

    cd web-ts
    npm install
    npm run dev

Blazor version (http://localhost:5174):

    cd blazor
    dotnet run --project src/FigueIt.Web --urls http://localhost:5174

## Test

    cd web-ts && npx vitest run
    cd blazor && dotnet test

## Branches and deployment

- `dev` is where work happens, locally.
- `main` is production. Pushing `main` to GitHub builds both versions and publishes them to GitHub Pages
  (React at the site root, Blazor under `/blazor/`).
