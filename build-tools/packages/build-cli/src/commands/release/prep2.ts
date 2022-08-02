/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import chalk from "chalk";
import { VersionBumpType } from "@fluid-tools/version-tools";
import {
    bumpTypeFlag,
    checkFlags,
    packageSelectorFlag,
    releaseGroupFlag,
    skipCheckFlag,
    versionSchemeFlag,
} from "../../flags";
import { CommandWithChecks, StateMachineCommand } from "../../base";
import { PrepReleaseMachine } from "../../machines";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../../releaseGroups";

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
        skipChecks: skipCheckFlag,
        ...checkFlags,
        ...StateMachineCommand.flags,
    };

    machine = PrepReleaseMachine;

    releaseGroup: ReleaseGroup | ReleasePackage = "";
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

            default: {
                localHandled = false;
            }
        }

        if (localHandled) {
            return true;
        }

        const superHandled = await super.handleState(state);
        // assert((localHandled && superHandled) !== true, `State handled in multiple places: ${state}`);
        return superHandled;
    }

    async run(): Promise<void> {
        const flags = this.processedFlags;

        this.releaseGroup = flags.releaseGroup!;
        this.shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        this.shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        this.shouldCommit = flags.commit && !flags.skipChecks;
        this.shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;
        this.bumpType = flags.bumpType!;

        const shouldInstall = flags.install && !flags.skipChecks;

        await this.stateLoop();
    }
}
