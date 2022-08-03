/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import {
    bumpVersionScheme,
    detectVersionScheme,
    VersionBumpType,
} from "@fluid-tools/version-tools";
import { bumpTypeFlag, releaseGroupFlag } from "../../flags";
import { CommandWithChecks } from "../../base";
import { PrepReleaseMachine } from "../../machines/machines";
import { bumpBranchName, bumpReleaseGroup, releaseBranchName } from "../../lib";
import { ReleaseGroup } from "../../releaseGroups";
import { FluidRepo, MonoRepoKind } from "@fluidframework/build-tools";

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
export default class PrepCommand2 extends CommandWithChecks<typeof PrepCommand2.flags> {
    static description =
        "Prepares the repo for a major or minor release. Helps pre-bump to the next major/minor so release branches can be created.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        releaseGroup: releaseGroupFlag({
            required: true,
        }),
        bumpType: bumpTypeFlag({
            options: ["major", "minor"],
            required: true,
        }),
        ...CommandWithChecks.flags,
    };

    machine = PrepReleaseMachine.machine;

    releaseGroup: ReleaseGroup | undefined;
    releaseVersion: string | undefined;
    shouldSkipChecks = false;
    shouldCheckPolicy = true;
    shouldCheckBranch = true;
    shouldCheckBranchUpdate = true;
    shouldCommit = true;
    bumpType = "minor" as VersionBumpType;
    checkBranchName(name: string): boolean {
        this.verbose(`Checking if ${name} is 'main', 'next', or 'lts'.`);
        return ["main", "next", "lts"].includes(name);
    }

    get checkBranchNameErrorMessage(): string {
        return `Release prep should only be done on 'main' or 'next' branches, but current branch is '${this._context?.originalBranchName}'.`;
    }

    async handleState(state: string): Promise<boolean> {
        const context = await this.getContext();
        let localHandled = true;

        switch (state) {
            case "PromptToPR": {
                this.logHr();
                this.log(
                    `\nPlease push and create a PR for branch ${await context.gitRepo.getCurrentBranchName()} targeting the ${
                        context.originalBranchName
                    } branch.`,
                );
                this.log(
                    `\nAfter the PR is merged, then the release of ${this.releaseGroup} is complete!`,
                );
                this.exit();
                break;
            }

            case "PromptToCommit": {
                this.log(
                    `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.`,
                );
                this.exit();
                break;
            }

            case "CheckReleaseBranch": {
                // Check release branch
                const releaseBranch = releaseBranchName(this.releaseGroup!, this.releaseVersion!);

                const commit = await context.gitRepo.getShaForBranch(releaseBranch);
                if (commit !== undefined) {
                    this.logError(`${releaseBranch} already exists`);
                    this.machine.action("failure");
                }
                this.machine.action("success");
                break;
            }

            case "CheckInstallBuildTools": {
                // Make sure everything is installed (so that we can do build:genver)
                const buildToolsMonoRepo = context.repo.releaseGroups.get(MonoRepoKind.BuildTools)!;
                this.log(`Installing build-tools so we can run build:genver`);
                const ret = await buildToolsMonoRepo.install();
                if (ret.error) {
                    this.logError("Install failed.");
                    this.machine.action("failure");
                }

                this.machine.action("success");
                break;
            }

            case "DoReleaseGroupBump": {
                const rgRepo = context.repo.releaseGroups.get(this.releaseGroup!)!;
                const scheme = detectVersionScheme(this.releaseVersion!);
                const newVersion = bumpVersionScheme(this.releaseVersion, this.bumpType, scheme);

                this.log(
                    `Release bump: bumping ${chalk.blue(this.bumpType)} version to ${newVersion}`,
                );
                const bumpResults = await bumpReleaseGroup(this.bumpType, rgRepo, scheme);
                this.verbose(`Raw bump results:`);
                this.verbose(bumpResults);

                if (!(await FluidRepo.ensureInstalled(rgRepo.packages, false))) {
                    this.logError("Install failed.");
                    this.machine.action("failure");
                }
                this.machine.action("success");
                break;
            }

            case "PromptToPRBump": {
                const bumpBranch = bumpBranchName(
                    this.releaseGroup!,
                    this.bumpType,
                    this.releaseVersion!,
                );
                this.logHr();
                this.log(
                    `\n* Please push and create a PR for branch ${bumpBranch} targeting ${context.originalBranchName}.`,
                );

                if (context.originalBranchName === "main") {
                    const releaseBranch = releaseBranchName(
                        this.releaseGroup!,
                        this.releaseVersion!,
                    );
                    this.log(
                        `\n* After PR is merged, create branch ${releaseBranch} one commit before the merged PR and push to the repo.`,
                    );
                }

                this.log(
                    `\n* Once the release branch has been created, switch to it and use the following command to release the ${this.releaseGroup} release group:\n`,
                );
                this.logIndent(
                    `${this.config.bin} release -g ${this.releaseGroup} -t ${this.bumpType}`,
                );
                this.exit();
                break;
            }

            default: {
                localHandled = false;
            }
        }

        if (localHandled) {
            return true;
        }

        const superHandled = await super.handleState(state);
        return superHandled;
    }

    async run(): Promise<void> {
        const context = await this.getContext();
        const flags = this.processedFlags;

        this.releaseGroup = flags.releaseGroup;
        this.releaseVersion = context.repo.releaseGroups.get(this.releaseGroup)!.version;

        this.shouldSkipChecks = flags.skipChecks;
        this.shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        this.shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        this.shouldCommit = flags.commit && !flags.skipChecks;
        this.shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;

        const shouldInstall = flags.install && !flags.skipChecks;

        await this.stateLoop();
    }
}
