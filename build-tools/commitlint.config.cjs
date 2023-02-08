/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { getPackagesSync } = require("@manypkg/get-packages");
const { PackageName } = require("@rushstack/node-core-library");

const { packages } = getPackagesSync(process.cwd());
const scopes = packages.map((pkg) => PackageName.getUnscopedName(pkg.packageJson.name));
// const scopeEnum = scopes.map((scope) => return {scope: })

module.exports = {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"body-case": [2, "always", "sentence-case"],
		"subject-case": [2, "always", "sentence-case"],
		"type-enum": [
			2,
			"always",
			["build", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"],
		],
		"scope-enum": scopes,
	},
	prompt: {
		questions: {
			type: {
				description: "Select the type of change that you're committing",
				enum: {
					build: {
						description:
							"Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)",
						title: "Builds",
						emoji: "🛠",
					},
					ci: {
						description:
							"Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)",
						title: "Continuous Integrations",
						emoji: "⚙️",
					},
					docs: {
						description: "Documentation only changes",
						title: "Documentation",
						emoji: "📚",
					},
					feat: {
						description: "A new feature",
						title: "Features",
						emoji: "✨",
					},
					fix: {
						description: "A bug fix",
						title: "Bug Fixes",
						emoji: "🐛",
					},
					perf: {
						description: "A code change that improves performance",
						title: "Performance Improvements",
						emoji: "🚀",
					},
					refactor: {
						description: "A code change that neither fixes a bug nor adds a feature",
						title: "Code Refactoring",
						emoji: "📦",
					},
					revert: {
						description: "Reverts a previous commit",
						title: "Reverts",
						emoji: "🗑",
					},
					style: {
						description:
							"Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)",
						title: "Style",
						emoji: "💎",
					},
					test: {
						description: "Adding missing tests or correcting existing tests",
						title: "Tests",
						emoji: "🚨",
					},
				},
			},
      scope: {
        enum: scopes,
      }
		},
	},
};
