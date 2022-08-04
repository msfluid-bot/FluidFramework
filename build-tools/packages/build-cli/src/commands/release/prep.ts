/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Context, FluidRepo, MonoRepoKind } from "@fluidframework/build-tools";
import { bumpVersionScheme, detectVersionScheme } from "@fluid-tools/version-tools";
import chalk from "chalk";
import { BaseReleaseCommand } from "../release";
import { bumpTypeExtendedFlag, releaseGroupFlag } from "../../flags";
import { isReleaseGroup, ReleaseGroup } from "../../releaseGroups";
import { releaseBranchName, bumpReleaseGroup, npmCheckUpdates, createBumpBranch } from "../../lib";

const supportedBranches = new Set(["main", "next"]);

/**
 * The `release prep` command.
 */
export default class PrepCommand extends BaseReleaseCommand<typeof PrepCommand.flags> {
    static description =
        "Prepares the repo for a major or minor release. Helps pre-bump to the next major/minor so release branches can be created.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        releaseGroup: releaseGroupFlag({
            required: true,
        }),
        bumpType: bumpTypeExtendedFlag({
            options: ["major", "minor"],
            required: true,
        }),
        ...BaseReleaseCommand.flags,
    };

    static args = [];

    async run(): Promise<void> {
        const flags = this.processedFlags;
        const context = await this.getContext();
        const shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        const shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        const shouldInstall = flags.install && !flags.skipChecks;
        const shouldCommit = flags.commit && !flags.skipChecks;
        const shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;

        const releaseGroup: ReleaseGroup = flags.releaseGroup;

        // TODO: run policy check before releasing a version.
        if (shouldCheckPolicy) {
            if (shouldCheckBranch && context.originalBranchName !== "main") {
                this.warn(
                    `Skipping policy check because the branch is not main: '${context.originalBranchName}'`,
                );
            }
            // await runPolicyCheckWithFix(context);
        } else {
            this.warn("Skipping policy check.");
        }

        if (shouldCheckBranch && !supportedBranches.has(context.originalBranchName)) {
            this.error(
                `Release prep should only be done on 'main' or 'next' branches, but current branch is '${context.originalBranchName}'.`,
            );
        }

        if (!supportedBranches.has(context.originalBranchName)) {
            this.warn(
                `Release prep should only be done on 'main' or 'next' branches. Make sure you know what you are doing!`,
            );
        }

        const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
        if (remote === undefined) {
            this.error(`Unable to find remote for '${context.originRemotePartialUrl}'`);
        }

        if (
            shouldCheckBranchUpdate &&
            !(await context.gitRepo.isBranchUpToDate(context.originalBranchName, remote))
        ) {
            this.error(
                `Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
            );
        } else if (!shouldCheckBranchUpdate) {
            this.warn("Not checking if the branch is up-to-date with the remote.");
        }

        // Bump any pre-release packages that have releases to their released version.
        const updates = await npmCheckUpdates(
            context,
            releaseGroup,
            context.packagesNotInReleaseGroup(releaseGroup).map((p) => p.name),
            "current",
            /* prerelease */ false,
            /* writeChanges */ true,
            await this.getLogger(),
        );

        if (updates.length > 0) {
            // TODO: create branch and commit changes automatically -- maybe pull out shared logic with release command?
            this.log(chalk.red(`\nFound prelease dependencies on released packages.`));
            this.log(
                `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.`,
            );
            this.exit();
        } else {
            this.log(chalk.green(`No prerelease dependencies found.`));
        }

        assert(flags.bumpType === "major" || flags.bumpType === "minor");

        await this.createReleaseBranchesAndBump(
            context,
            releaseGroup,
            flags.bumpType,
            shouldInstall,
            shouldCommit,
        );

        this.exit();
    }

    /**
     * Create release bump branch based on the repo state for either main or next branches, bump minor version
     * immediately and push it to `main` and the new release branch to remote.
     */
    // eslint-disable-next-line max-params
    async createReleaseBranchesAndBump(
        context: Context,
        releaseGroup: ReleaseGroup,
        bumpType: "minor" | "major",
        shouldInstall: boolean,
        shouldCommit: boolean,
    ) {
        this.log(`Preparing for a ${bumpType} release of the ${releaseGroup} release group.`);

        // // Create release branch
        const releaseVersion = context.repo.releaseGroups.get(releaseGroup)!.version;
        const scheme = detectVersionScheme(releaseVersion);
        const newVersion = bumpVersionScheme(releaseVersion, bumpType, scheme);
        const releaseBranch = releaseBranchName(releaseGroup, releaseVersion);

        const commit = await context.gitRepo.getShaForBranch(releaseBranch);
        if (commit !== undefined) {
            this.error(`${releaseBranch} already exists`);
        }

        // Make sure everything is installed (so that we can do build:genver)
        const rgMonoRepo = context.repo.releaseGroups.get(MonoRepoKind.BuildTools)!;
        this.log(`Installing build-tools so we can run build:genver`);
        const ret = await rgMonoRepo.install();
        if (ret.error) {
            this.error("Install failed.");
        }

        console.log(`Release bump: bumping ${chalk.blue(bumpType)} version to ${newVersion}`);
        const bumpBranch = await createBumpBranch(context, releaseGroup, bumpType);
        const bumpResults = await bumpReleaseGroup(bumpType, rgMonoRepo, scheme);
        this.verbose(bumpResults);

        if (shouldInstall) {
            if (!(await FluidRepo.ensureInstalled(rgMonoRepo.packages, false))) {
                this.error("Install failed.");
            }
        } else {
            this.warn(`Skipping installation. Lockfiles might be outdated.`);
        }

        if (shouldCommit) {
            await context.gitRepo.commit(
                `[bump] ${releaseGroup} (${bumpType})`,
                `Error committing`,
            );
        } else {
            this.log(
                `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.`,
            );
        }

        this.logHr();
        this.log(
            `\n* Please push and create a PR for branch ${bumpBranch} targeting ${context.originalBranchName}.`,
        );

        if (context.originalBranchName === "main") {
            this.log(
                `\n* After PR is merged, create branch ${releaseBranch} one commit before the merged PR and push to the repo.`,
            );
        }

        this.log(
            `\n* Once the release branch has been created, switch to it and use the following command to release the ${releaseGroup} release group:\n`,
        );
        this.logIndent(`${this.config.bin} release -g ${releaseGroup} -t ${bumpType}`);
    }
}
