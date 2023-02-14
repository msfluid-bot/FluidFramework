/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { getPackagesSync } = require("@manypkg/get-packages");
const { PackageName } = require("@rushstack/node-core-library");
const { execSync } = require("child_process");

const { packages } = getPackagesSync(process.cwd());
const scopes = packages.map((pkg) => PackageName.getUnscopedName(pkg.packageJson.name));
const types = [
	{
		value: "build",
		title: "Builds",
		description: "Changes that affect the build system or external dependencies",
		emoji: "🏗️",
	},
	{
		value: "ci",
		description: "Changes to our CI configuration files and scripts",
		title: "Continuous Integrations",
		emoji: "🤖",
	},
	{
		value: "deprecate",
		description:
			"Changes which mark one or more APIs as being deprecated and make no functional changes",
		title: "Deprecations",
		emoji: "🔙",
	},
	{
		value: "docs",
		description: "Changes which strictly modify documentation",
		title: "Documentation",
		emoji: "📚",
	},
	{
		value: "feat",
		description: "Adds a new feature",
		title: "Features",
		emoji: "✨",
	},
	{
		value: "fix",
		description: "A bug fix",
		title: "Bug Fixes",
		emoji: "🐛",
	},
	{
		value: "improvement",
		description:
			"Improves an existing implementation without adding a new feature or fixing a bug",
		title: "Improvement",
		emoji: "👍",
	},
	{
		value: "merge",
		description: "Merge of branches that does nothing more than merge",
		title: "Merge",
		emoji: "🛣️",
	},
	{
		value: "perf",
		description: "A code change aimed at improving performance",
		title: "Performance Improvements",
		emoji: "🚀",
	},
	{
		value: "refactor",
		description:
			"Code Refactoring - a code change to improve code quality that does not affect runtime behavior",
		title: "Code Refactoring",
		emoji: "📦",
	},
	{
		value: "remove",
		description: "Removes a feature",
		title: "Remove",
		emoji: "💥",
	},
	{
		value: "revert",
		description: "Changes which strictly revert a previous change(s)",
		title: "Reverts",
		emoji: "🗑",
	},
	{
		value: "style",
		description:
			"Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons)",
		title: "Style",
		emoji: "💎",
	},
	{
		value: "test",
		description: "Adds missing tests or correcting existing tests",
		title: "Tests",
		emoji: "🧪",
	},
	{
		value: "tools",
		description:
			"Changes to repository tooling (scripts, linter configurations) that do not affect published packages",
		title: "Tools",
		emoji: "🛠",
	},
];

/** @type {import('cz-git').UserConfig} */
module.exports = {
	rules: {
		// @see: https://commitlint.js.org/#/reference-rules
		"body-case": [2, "always", ["sentence-case", "lower-case"]],
		"subject-case": [2, "always", ["sentence-case", "lower-case"]],
		"type-enum": [2, "always", types.map((v) => v.value)],
		"scope-enum": [2, "always", scopes],
		"header-max-length": [2, "always", 100],
	},
	prompt: {
		// alias: { fd: "docs: fix typos" },
		messages: {
			value: "Select the type of change that you're committing:",
			scope: "Denote the SCOPE of this change (optional):",
			customScope: "Denote the SCOPE of this change:",
			subject: "Write a SHORT, IMPERATIVE tense description of the change:\n",
			body: 'Provide a LONGER description of the change (optional). Use "|" for line breaks:\n',
			breaking: 'List any BREAKING CHANGES (optional). Use "|" for line breaks:\n',
			confirmCommit: "Are you sure you want to proceed with the commit above?",
		},
		types: types.map((v) => {
			return { value: v.value, name: `${v.value}: ${v.description}` };
		}),
		allowCustomScopes: true,
		allowEmptyScopes: true,
		allowBreakingChanges: ["feat", "fix", "refactor", "tools", "perf", "remove"],
	},
};
