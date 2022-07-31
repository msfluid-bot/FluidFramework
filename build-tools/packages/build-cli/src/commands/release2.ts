/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, MonoRepo, Package } from "@fluidframework/build-tools";
import { isVersionScheme, VersionScheme } from "@fluid-tools/version-tools";
import chalk from "chalk";
import { sm } from "jssm";
// import type { HookHandler } from "jssm";
import { BaseCommand } from "../base";
import {
    releaseGroupFlag,
    checkFlags,
    skipCheckFlag,
    versionSchemeFlag,
    packageSelectorFlag,
} from "../flags";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../releaseGroups";
import { bumpReleaseGroup, createBumpBranch, getPreReleaseDependencies, isReleased } from "../lib";
import { BaseReleaseCommand } from "./release";
import { rm } from "fs";
import { strict as assert } from "assert";

const RM = sm`
Init 'success'
=> CheckValidReleaseGroup 'success'
=> CheckPolicy 'success'
=> CheckBranchName 'success'
=> CheckHasRemote 'success'
=> CheckBranchUpToDate 'success'
=> CheckForPrereleaseDependencies 'success'
=> CheckIfCurrentReleaseGroupIsReleased 'success'
=> DoPostReleasePatchBump 'success'
=> CheckShouldCommit;

Init 'skipChecks'
=> CheckForPrereleaseDependencies;

[CheckValidReleaseGroup
CheckPolicy
CheckBranchName
CheckHasRemote
CheckBranchUpToDate
DoPostReleasePatchBump] 'failure' => Failed;

CheckForPrereleaseDependencies 'hasDependencies'
=> BumpPrereleaseDependencies 'success'
=> CheckShouldCommit 'success'
=> Commit 'success' => PromptToPR;

[CheckShouldCommit] 'failure'
=> PromptToCommit;

CheckIfCurrentReleaseGroupIsReleased 'failure'
=> PromptToRelease;
`;

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
export default class ReleaseCommand2 extends BaseReleaseCommand<typeof ReleaseCommand2.flags> {
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

    // eslint-disable-next-line complexity
    async run(): Promise<void> {
        const flags = this.processedFlags;
        const context = await this.getContext();

        const shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        const shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        const shouldInstall = flags.install && !flags.skipChecks;
        const shouldCommit = flags.commit && !flags.skipChecks;
        const shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;

        let releaseGroup: ReleaseGroup | ReleasePackage = flags.releaseGroup!;
        let remote: string | undefined;
        let bumpBranch: string | undefined;
        let terminalCount = 0;

        // RM.hook_any_transition( ({data}) => this.log(data) );
        RM.hook_any_transition((t: any) => {
            const { action, from, to } = t;
            this.verbose(`${from} [${action}] ==> ${to}`);
        });

        RM.hook_entry("PromptToPR", (o: any) => {
            this.logHr();
            this.log(
                `\nPlease push and create a PR for branch ${bumpBranch} targeting the ${context.originalBranchName} branch.`,
            );
            this.log(`\nAfter the PR is merged, then the release of ${releaseGroup} is complete!`);
        });

        RM.hook_entry("PromptToRelease", (o: any) => {
            let cmd = `${this.config.bin} ${this.id}`;
            cmd += isReleaseGroup(releaseGroup) ? ` -g ${releaseGroup}` : ` -p ${releaseGroup}`;

            cmd += ` -S ${flags.versionScheme}`;

            // If the release group is not yet released, instruct the user to queue a release build.
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
            this.logIndent(chalk.green(`${releaseGroup}`));
            this.log(
                `\nAfter the build is done and the release group has been published, run the following command to bump the release group to the next version and update dependencies on the newly released package(s):`,
            );
            this.logIndent(chalk.whiteBright(`\n${cmd}`));
            return;
        });

        for (const state of RM.states()) {
            if (RM.state_is_terminal(state)) {
                RM.hook_exit(state, (o: any) => {
                    const { from, action } = o;
                    this.log(chalk.magenta(`${state}: ${action} from ${from}`));
                });
            }
        }

        do {
            // if (RM.is_terminal()) {
            //     terminalCount++;
            //     this.log(chalk.green(`Terminal state: ${RM.state()}, count: ${terminalCount}`));
            //     // this.logError(`Exiting at state: ${RM.state()}`);
            // }

            switch (RM.state()) {
                case "Init": {
                    if(flags.skipChecks) {
                        this.warn(`SKIPPING ALL CHECKS!`);
                        // RM.action("skipChecks");
                    }
                    RM.action("success");
                    break;
                }
                case "CheckValidReleaseGroup": {
                    if (isReleaseGroup(flags.releaseGroup)) {
                        releaseGroup = flags.releaseGroup;
                    } else if (flags.package !== undefined && flags.package !== "") {
                        releaseGroup = flags.package;
                    } else {
                        RM.action("failure");
                    }
                    RM.action("success");
                    break;
                }
                case "CheckPolicy": {
                    // TODO: run policy check before releasing a version.
                    if (shouldCheckPolicy) {
                        this.warn(`Automated policy check not yet implemented.`);
                        // await runPolicyCheckWithFix(context);
                    } else {
                        this.warn("Skipping policy check.");
                    }

                    RM.action("success");
                    break;
                }
                case "CheckBranchName": {
                    if (shouldCheckBranch) {
                        if (!context.originalBranchName.startsWith("release/")) {
                            RM.action("failure");
                            this.logError(
                                `Patch release should only be done on 'release/*' branches, but current branch is '${context.originalBranchName}'`,
                            );
                        }
                    } else {
                        this.warn(
                            `Not checking if current branch is a release branch: ${context.originalBranchName}`,
                        );
                    }
                    RM.action("success");
                    break;
                }
                case "CheckHasRemote": {
                    remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                    if (remote === undefined) {
                        RM.action("failure");
                        this.logError(`Unable to find remote for '${context.originRemotePartialUrl}'`);
                    }

                    RM.action("success");
                    break;
                }
                case "CheckBranchUpToDate": {
                    const isBranchUpToDate = await context.gitRepo.isBranchUpToDate(
                        context.originalBranchName,
                        remote!,
                    );
                    if (shouldCheckBranchUpdate) {
                        if (!isBranchUpToDate) {
                            RM.action("failure");
                            this.logError(
                                `Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
                            );
                        }
                        RM.action("success");
                    } else {
                        this.warn("Not checking if the branch is up-to-date with the remote.");
                        RM.action("success");
                    }

                    break;
                }
                case "CheckForPrereleaseDependencies": {
                    const prereleaseDepNames = await getPreReleaseDependencies(
                        context,
                        releaseGroup,
                    );
                    if (
                        prereleaseDepNames.releaseGroups.length > 0 ||
                        prereleaseDepNames.packages.length > 0
                    ) {
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
                        RM.action("failure");
                    } else {
                        RM.action("success");
                    }
                    break;
                }
                case "CheckIfCurrentReleaseGroupIsReleased": {
                    const wasReleased = await isReleased(context, releaseGroup);
                    if (wasReleased) {
                        RM.action("success");
                    } else {
                        RM.action("failure");
                    }
                    break;
                }
                case "DoPostReleasePatchBump": {
                    if (!isReleaseGroup(releaseGroup)) {
                        RM.action("failure");
                        this.logError(`Expected a release group: ${releaseGroup}`);
                        break;
                    }
                    const releaseGroupRepo = context.repo.releaseGroups.get(releaseGroup)!;
                    // Since the release group is released, bump it to the next patch version.
                    await bumpReleaseGroup("patch", releaseGroupRepo, flags.versionScheme!);
                    RM.action("success");
                    break;
                }
                case "CheckShouldCommit": {
                    if (shouldCommit) {
                        RM.action("success");
                    } else {
                        RM.action("failure");
                    }
                    break;
                }
                case "Commit": {
                    assert(isReleaseGroup(releaseGroup));
                    bumpBranch = await createBumpBranch(context, releaseGroup, "patch");
                    await context.gitRepo.commit(
                        `[bump] ${releaseGroup} (patch)`,
                        `Error committing`,
                    );
                    RM.action("success");
                    break;
                }
                // case "PromptToPR": {
                //     this.log(
                //         `\nPlease push and create a PR for branch ${bumpBranch} targeting the ${context.originalBranchName} branch.`,
                //     );
                //     this.log(`\nAfter the PR is merged, then the release of ${releaseGroup} is complete!`);
                //     break;
                // }
                // case "PromptToCommit": {
                //     this.log(
                //         `Commit the local changes and create a PR targeting the ${context.originalBranchName} branch.`,
                //     );
                //     this.log(`\nAfter the PR is merged, then the release of ${releaseGroup} is complete!`);
                //     break;
                // }
                default: {
                    this.logError(`Unhandled state: ${RM.state()}`);
                }
            }
        } while (!RM.is_terminal() && terminalCount < 2);
    }
}
