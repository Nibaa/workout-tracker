# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Releases

Versioning now follows semantic versioning.

- Pushes to `main` run `semantic-release` in GitHub Actions.
- `fix:` commits create a patch release.
- `feat:` commits create a minor release.
- `feat!:` or a `BREAKING CHANGE:` footer creates a major release.

Examples:

```text
fix: correct alternating exercise completion state
feat: allow logging both alternating exercises in one workout
feat!: change export format for workout history
```
