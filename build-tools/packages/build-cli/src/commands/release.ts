/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, MonoRepo, Package } from "@fluidframework/build-tools";
import { VersionScheme } from "@fluid-tools/version-tools";
import chalk from "chalk";
import { BaseCommand } from "../base";
import {
    releaseGroupFlag,
    checkFlags,
    skipCheckFlag,
    versionSchemeFlag,
    packageSelectorFlag,
} from "../flags";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../types";
// eslint-disable-next-line import/no-internal-modules
import { getPreReleaseDependencies, isReleased } from "../lib/packages";
// eslint-disable-next-line import/no-internal-modules
import { bumpReleaseGroup } from "../lib/bump";

/**
 * A base command that sets up common flags that most release-related commands should have.
 */
export abstract class BaseReleaseCommand<
    T extends typeof BaseReleaseCommand.flags,
> extends BaseCommand<T> {
    static flags = {
        skipChecks: skipCheckFlag,
        ...checkFlags,
        ...BaseCommand.flags,
    };
}

/**
 * Releases a release group recursively.
 *
 * @remarks
 *
 * First the release group's dependencies are checked. If any of the dependencies are also in the repo, then they're
 * checked for the latest release version. If the dependencies have not yet been released, then the command prompts to
 * perform the release of the dependency, then run the releae command again.
 *
 * This process is continued until all the dependencies have been released, after which the release group itself is
 * released.
 */
export default class ReleaseCommand extends BaseReleaseCommand<typeof ReleaseCommand.flags> {
    static description = "Release a release group and any dependencies.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        versionScheme: versionSchemeFlag({
            required: true,
        }),
        releaseGroup: releaseGroupFlag({
            exclusive: ["package"],
            required: false,
        }),
        package: packageSelectorFlag({
            exclusive: ["releaseGroup"],
            required: false,
        }),
        ...BaseReleaseCommand.flags,
    };

    static args = [];

    // eslint-disable-next-line complexity
    async run(): Promise<void> {
        const flags = this.processedFlags;
        const context = await this.getContext(flags.verbose);

        const shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        const shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        const shouldInstall = flags.install && !flags.skipChecks;
        const shouldCommit = flags.commit && !flags.skipChecks;
        const shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;

        let releaseGroup: ReleaseGroup | ReleasePackage;

        if (isReleaseGroup(flags.releaseGroup)) {
            releaseGroup = flags.releaseGroup;
        } else if (flags.package !== undefined && flags.package !== "") {
            releaseGroup = flags.package;
        } else {
            this.error(`Must provide a valid release group or package name.`);
        }

        // TODO: run policy check before releasing a version.
        if (shouldCheckPolicy) {
            this.warn(`Automated policy check not yet implemented.`);
            // await runPolicyCheckWithFix(context);
        } else {
            this.warn("Skipping policy check.");
        }

        if (shouldCheckBranch && !context.originalBranchName.startsWith("release/")) {
            this.error(
                `Patch release should only be done on 'release/*' branches, but current branch is '${context.originalBranchName}'`,
            );
        } else {
            this.warn(
                `Not checking if current branch is a release branch: ${context.originalBranchName}`,
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
        } else {
            this.warn("Not checking if the branch is up-to-date with the remote.");
        }

        const prereleaseDepNames = await getPreReleaseDependencies(context, releaseGroup);

        if (prereleaseDepNames.releaseGroups.length > 0 || prereleaseDepNames.packages.length > 0) {
            this.log(
                chalk.red(
                    `\nCan't release the ${releaseGroup} release group because some of its dependencies need to be released first.`,
                ),
            );

            if (prereleaseDepNames.releaseGroups.length > 0) {
                this.log(`\nRelease these release groups:`);
                for (const p of prereleaseDepNames.releaseGroups) {
                    this.logIndent(chalk.blueBright(`${p}`));
                }
            }

            if (prereleaseDepNames.packages.length > 0) {
                this.log(`\nRelease these packages:`);
                for (const p of prereleaseDepNames.packages) {
                    this.logIndent(chalk.blue(`${p}`));
                }
            }

            this.exit();
        } else {
            const toBump: MonoRepo | Package = isReleaseGroup(releaseGroup)
                ? context.repo.releaseGroups.get(releaseGroup)!
                : context.fullPackageMap.get(flags.package!)!;

            await this.checkAndQueueReleaseGroup(
                context,
                toBump,
                shouldCommit,
                flags.versionScheme!,
            );
            this.exit();
        }

        this.error("Nothing to release.");
    }

    /**
     * Checks if a release group is released, and if not, instructs the user to queue a release build in ADO.
     *
     * @param context -
     * @param releaseGroupRepo -
     * @param shouldCommit -
     * @param scheme -
     * @returns
     */
    async checkAndQueueReleaseGroup(
        context: Context,
        releaseGroupRepo: MonoRepo | Package,
        shouldCommit: boolean,
        scheme: VersionScheme,
    ) {
        const wasReleased = await isReleased(context, releaseGroupRepo);
        const releaseGroupName =
            releaseGroupRepo instanceof MonoRepo
                ? releaseGroupRepo.kind.toLowerCase()
                : releaseGroupRepo.name;

        let cmd = `${this.config.bin} ${this.id}`;
        cmd +=
            releaseGroupRepo instanceof MonoRepo
                ? ` -g ${releaseGroupName}`
                : ` -p ${releaseGroupName}`;

        cmd += ` -S ${scheme}`;

        // If the release group is not yet released, instruct the user to queue a release build.
        if (!wasReleased) {
            this.logHr();
            this.log(
                chalk.white(
                    `Please queue a ${chalk.green(
                        "release",
                    )} build for the following release group in ADO for branch ${chalk.blue(
                        context.originalBranchName,
                    )}:`,
                ),
            );
            this.logIndent(chalk.green(`${releaseGroupName}`));
            this.log(
                `\nAfter the build is done and the release group has been published, run the following command to bump the release group to the next version and update dependencies on the newly released package(s):`,
            );
            this.logIndent(chalk.whiteBright(`\n${cmd}`));
            return;
        }

        // Since the release group is released, bump it to the next patch version.
        await bumpReleaseGroup("patch", releaseGroupRepo, scheme);

        // Create branch
        const bumpBranch = `patch_bump_${releaseGroupName.toLowerCase()}_${Date.now()}`;
        this.logHr();

        if (shouldCommit) {
            await context.createBranch(bumpBranch);
            this.log(
                `\nPlease push and create a PR for branch ${bumpBranch} targeting the ${context.originalBranchName} branch.`,
            );
            await context.gitRepo.commit(`[bump] ${releaseGroupName} (patch)`, `Error committing`);
        } else {
            this.log(
                `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.`,
            );
        }

        this.log(`\nAfter the PR is merged, then the release of ${releaseGroupName} is complete!`);
    }
}
