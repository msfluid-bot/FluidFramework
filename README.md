# Reproducing syncpack custom types and version groups issues

To reproduce:

1. Install syncpack globally: `npm i -g syncpack@9.3.2`
1. Check out the syncpack-issues-repro branch of https://github.com/tylerbutler/FluidFramework/
## Issue 1

Run `syncpack list-mismatches` and view the output.

Output will look like this:

```
= Version Group 2 ==============================================================
✘ npm has mismatched versions which syncpack cannot fix
  ^6 in engines.npm of package.json
  ^5 in engines.npm of packages/framework/fluid-framework/package.json
  ^5 in engines.npm of packages/framework/tinylicious-client/package.json
= Default Version Group ========================================================
✘ node >=14.13.0 is the highest valid semver version in use
  ^12.13.0 in engines.node of packages/framework/fluid-framework/package.json
  ^12.13.0 in engines.node of packages/framework/tinylicious-client/package.json
```

**The mismatched node version is caught, but I expected the it to be group 3, but it's in the default group.** The
relevant section of the syncpack config looks like this:

```json
customTypes: {
  enginesNpm: {
    path: "engines.npm",
    strategy: "version",
  },
  enginesNode: {
    path: "engines.node",
    strategy: "version",
  },
  packageManager: {
    path: "packageManager",
    strategy: "name@version",
  },
},

// ...

// GROUP 3
// engines.npm field should match
{
  dependencyTypes: ["enginesNpm"],
  dependencies: ["**"],
  packages: ["**"],
},

// GROUP 2
// packageManager field versions should match, though this field is only used in the release group root
// package.json today.
{
  dependencyTypes: ["packageManager"],
  dependencies: ["**"],
  packages: ["**"],
},
```

## Issue 2

Run `syncpack lint-semver-ranges` from the root of the repo.

Output will look like this:

```
= Semver Group 1 ===============================================================
✘ node
  ^12.13.0 → >=12.13.0 in engines.node of packages/framework/fluid-framework/package.json
  ^12.13.0 → >=12.13.0 in engines.node of packages/framework/tinylicious-client/package.json
```

**The mismatched node version is caught, but I expected the it to be group 8, but it's in group 1.**

## Issue 3

**The npm version mismatch is missed.** I expected it to be caught in group 7. I suspect that node would have also been
missed but not for group 1, which has the same range requirement as npm.

## Issue 4

Run `syncpack set-semver-ranges` or `syncpack fix-mismatches` from the root of the repo; they both seem to behave the
same way.

**Files are overwritten with spaces instead of tabs.** The `indent: "\t"` setting in the syncpack config is ignored.

## Issue 5

Reset changes from issue 4 using `git reset --hard`, then run `syncpack set-semver-ranges --indent $'\t'` or `syncpack
fix-mismatches --indent $'\t'` from the root of the repo. This works around issue 5; both commands seem to behave the
same way.

Ignore changes in the `experimental` folder. Look at the changes in the fluid-framework and tinylicious-client packages.
**The npm version is mismatched,** but the node version is corrected. I expected the npm version to be updated as well.
