/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { VersionBumpType } from "@fluid-tools/version-tools";
import chalk from "chalk";
import { CommandWithChecks, StateMachineCommand } from "../base";
import {
    checkFlags,
    packageSelectorFlag,
    releaseGroupFlag,
    skipCheckFlag,
    versionSchemeFlag,
} from "../flags";
import { bumpReleaseGroup } from "../lib";
import { ReleaseMachine } from "../machines";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../releaseGroups";

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
export default class ReleaseCommand2 extends CommandWithChecks<typeof ReleaseCommand2.flags> {
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
        skipChecks: skipCheckFlag,
        ...checkFlags,
        ...StateMachineCommand.flags,
    };

    machine = ReleaseMachine;

    releaseGroup: ReleaseGroup | ReleasePackage = "";
    shouldSkipChecks = false;
    shouldCheckPolicy = true;
    shouldCheckBranch = true;
    shouldCheckBranchUpdate = true;
    shouldCommit = true;

    /** Releases always result in a "patch" bump type after the release. */
    bumpType = "patch" as VersionBumpType;

    checkBranchName(name: string): boolean {
        this.verbose(`Checking if ${name} starts with release/`);
        return name.startsWith("release/");
    }

    get checkBranchNameErrorMessage(): string {
        return `Patch release should only be done on 'release/*' branches, but current branch is '${this._context?.originalBranchName}'`;
    }

    async init(): Promise<void> {
        await super.init();
        // await this.initMachineHooks();
    }

    async handleState(state: string): Promise<boolean> {
        const context = await this.getContext();
        let localHandled = true;

        // First handle any states that we know about. If not handled here, we pass it up to the parent handler.
        switch (state) {
            case "DoPostReleasePatchBump": {
                if (!isReleaseGroup(this.releaseGroup)) {
                    this.logError(`Expected a release group: ${this.releaseGroup}`);
                    this.machine.action("failure");
                    break;
                }

                const releaseGroupRepo = context.repo.releaseGroups.get(this.releaseGroup)!;
                // Since the release group is released, bump it to the next patch version.
                await bumpReleaseGroup(
                    "patch",
                    releaseGroupRepo,
                    this.processedFlags.versionScheme!,
                );
                this.machine.action("success");
                break;
            }

            case "PromptToPR": {
                this.logHr();
                this.log(
                    `\nPlease push and create a PR for branch ${await context.gitRepo.getCurrentBranchName()} targeting the ${context.originalBranchName
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
                this.log(
                    `\nAfter the PR is merged, then the release of ${this.releaseGroup} is complete!`,
                );
                this.exit();
                break;
            }

            case "PromptToRelease": {
                let cmd = `${this.config.bin} ${this.id}`;
                cmd += isReleaseGroup(this.releaseGroup)
                    ? ` -g ${this.releaseGroup}`
                    : ` -p ${this.releaseGroup}`;

                cmd += ` -S ${this.processedFlags.versionScheme}`;

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
                this.logIndent(chalk.green(`${this.releaseGroup}`));
                this.log(
                    `\nAfter the build is done and the release group has been published, run the following command to bump the release group to the next version and update dependencies on the newly released package(s):`,
                );
                this.logIndent(chalk.whiteBright(`\n${cmd}`));
                this.exit();
                break;
            }

            default: {
                localHandled = false;
            }
        }

        const superHandled = await super.handleState(state);
        assert((localHandled && superHandled) !== true, `State handled in multiple places: ${state}`);
        return superHandled || localHandled;
    }

    async run(): Promise<void> {
        const flags = this.processedFlags;

        this.releaseGroup = flags.releaseGroup!;
        this.shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        this.shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        this.shouldCommit = flags.commit && !flags.skipChecks;
        this.shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;

        const shouldInstall = flags.install && !flags.skipChecks;

        await this.stateLoop();
    }
}
