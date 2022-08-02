/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Context, getResolvedFluidRoot, GitRepo, Logger } from "@fluidframework/build-tools";
import { Command, Flags } from "@oclif/core";
// eslint-disable-next-line import/no-internal-modules
import { FlagInput, OutputFlags, ParserOutput } from "@oclif/core/lib/interfaces";
import chalk from "chalk";
import type { Machine } from "jssm";
import {
    bumpVersionScheme,
    detectVersionScheme,
    VersionBumpType,
} from "@fluid-tools/version-tools";
import { rootPathFlag } from "./flags";
import { createBumpBranch, getPreReleaseDependencies, isReleased } from "./lib";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "./releaseGroups";
import { StateHandler } from "./machines";
import { ChecksBranchName, ChecksBranchUpdate, CheckSkipper, ChecksPolicy, ChecksShouldCommit, ChecksValidReleaseGroup } from "./checks";

// This is needed to get type safety working in derived classes.
// https://github.com/oclif/oclif.github.io/pull/142
export type InferredFlagsType<T> = T extends FlagInput<infer F>
    ? F & { json: boolean | undefined }
    : any;

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand<T extends typeof BaseCommand.flags> extends Command {
    static flags = {
        root: rootPathFlag(),
        timer: Flags.boolean({
            default: false,
            hidden: true,
        }),
        verbose: Flags.boolean({
            char: "v",
            description: "Verbose logging.",
            required: false,
        }),
    };

    protected parsedOutput?: ParserOutput<any, any>;

    /** The processed arguments that were passed to the CLI. */
    get processedArgs(): { [name: string]: any } {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.parsedOutput?.args ?? {};
    }

    /** The processed flags that were passed to the CLI. */
    get processedFlags(): InferredFlagsType<T> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.parsedOutput?.flags ?? {};
    }

    /** The flags defined on the base class. */
    private get baseFlags() {
        return this.processedFlags as Partial<OutputFlags<typeof BaseCommand.flags>>;
    }

    protected _context: Context | undefined;
    private _logger: Logger | undefined;

    async init() {
        this.parsedOutput = await this.parse(this.ctor);
    }

    async catch(err: any) {
        // add any custom logic to handle errors from the command
        // or simply return the parent class error handling
        return super.catch(err);
    }

    async finally(err: any) {
        // called after run and catch regardless of whether or not the command errored
        return super.finally(err);
    }

    /**
     * @returns A default logger that can be passed to core functions enabling them to log using the command logging
     * system */
    protected async getLogger(): Promise<Logger> {
        if (this._logger === undefined) {
            this._logger = {
                log: (msg: string | Error) => {
                    this.log(msg.toString());
                },
                logWarning: this.warn.bind(this),
                logError: (msg: string | Error) => {
                    this.error(msg);
                },
                logVerbose: (msg: string | Error) => {
                    this.verbose(msg);
                },
            };
        }

        return this._logger;
    }

    /**
     * The repo {@link Context}. The context is retrieved and cached the first time this method is called. Subsequent
     * calls will return the cached context.
     *
     * @returns The repo {@link Context}.
     */
    async getContext(): Promise<Context> {
        if (this._context === undefined) {
            const resolvedRoot = await getResolvedFluidRoot();
            const gitRepo = new GitRepo(resolvedRoot);
            const branch = await gitRepo.getCurrentBranchName();
            const logger = await this.getLogger();

            this.verbose(`Repo: ${resolvedRoot}`);
            this.verbose(`Branch: ${branch}`);

            this._context = new Context(
                gitRepo,
                "github.com/microsoft/FluidFramework",
                branch,
                logger,
            );
        }

        return this._context;
    }

    public warn(message: string | Error): string | Error {
        this.log(chalk.yellow(`WARNING: ${message}`));
        return message;
    }

    public verbose(message: string | Error): string | Error {
        if (this.baseFlags.verbose === true) {
            if (typeof message === "string") {
                this.log(chalk.grey(`VERBOSE: ${message}`));
            } else {
                this.log(chalk.red(`VERBOSE: ${message}`));
            }
        }

        return message;
    }

    /** Output a horizontal rule. */
    public logHr() {
        this.log("=".repeat(72));
    }

    public logError(message: string | Error) {
        this.log(chalk.red(`ERROR: ${message}`));
    }

    /** Log a message with an indent. */
    public logIndent(input: string, indent = 2) {
        this.log(`${" ".repeat(indent)}${input}`);
    }
}

export abstract class StateMachineCommand<T extends typeof StateMachineCommand.flags>
    extends BaseCommand<T>
    implements StateHandler {
    static flags = {
        ...BaseCommand.flags,
    };

    abstract get machine(): Machine<unknown>;
    async init(): Promise<void> {
        await super.init();
        await this.initMachineHooksBase();
    }

    protected async initMachineHooksBase() {
        for (const state of this.machine.states()) {
            if (this.machine.state_is_terminal(state)) {
                this.machine.hook_entry(state, (o: any) => {
                    const { from, action } = o;
                    this.verbose(`${state}: ${action} from ${from}`);
                });
            }
        }

        this.machine.hook_any_transition((t: any) => {
            const { action, from, to } = t;
            this.verbose(`STATE MACHINE: ${from} [${action}] ==> ${to}`);
        });

        this.machine.hook_exit("Init", (o: any) => {
            const { action } = o;
            if (action === "skipChecks") {
                this.warn(`Skipping ALL CHECKS! Be sure you know what you are doing!`);
            }
        });
    }

    async handleState(state: string): Promise<boolean> {
        const context = await this.getContext();
        switch (state) {
            case "Failed": {
                this.verbose("Failed state!");
                break;
            }

            case "CheckHasRemote": {
                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                if (remote === undefined) {
                    this.machine.action("failure");
                    this.logError(`Unable to find remote for '${context.originRemotePartialUrl}'`);
                }

                this.machine.action("success");
                break;
            }

            default: {
                return false;
            }
        }

        return true;
    }

    protected async stateLoop(): Promise<void> {
        do {
            const state = this.machine.state();
            // eslint-disable-next-line no-await-in-loop
            const handled = await this.handleState(state)
            if (!handled) {
                this.error(`Unhandled state: ${state}`);
            }
            // eslint-disable-next-line no-constant-condition
        } while (true);
    }
}

export abstract class CommandWithChecks<T extends typeof CommandWithChecks.flags> extends StateMachineCommand<T>
    implements
    ChecksValidReleaseGroup,
    ChecksPolicy,
    ChecksBranchName,
    ChecksBranchUpdate,
    ChecksShouldCommit,
    CheckSkipper {
    abstract get shouldSkipChecks(): boolean;
    abstract set shouldSkipChecks(v: boolean);
    abstract get shouldCheckBranch(): boolean;
    abstract set shouldCheckBranch(v: boolean);
    abstract get shouldCommit(): boolean;
    abstract set shouldCommit(v: boolean);
    abstract get shouldCheckPolicy(): boolean;
    abstract set shouldCheckPolicy(v: boolean);
    abstract get shouldCheckBranchUpdate(): boolean;
    abstract set shouldCheckBranchUpdate(v: boolean);

    abstract get releaseGroup(): ReleaseGroup | ReleasePackage;
    abstract set releaseGroup(v: ReleaseGroup | ReleasePackage);
    abstract get bumpType(): VersionBumpType;
    abstract set bumpType(v: VersionBumpType);

    abstract checkBranchName(name: string): boolean;
    get checkBranchNameErrorMessage() {
        return `Branch name '${this._context?.originalBranchName}' isn't expected.`;
    }


    // eslint-disable-next-line complexity
    async handleState(state: string): Promise<boolean> {
        const context = await this.getContext();
        let localHandled = true;

        // First handle any states that we know about. If not handled here, we pass it up to the parent handler.
        switch (state) {
            case "Failed": {
                this.verbose("Failed state!");
                break;
            }

            case "Init": {
                if (this.shouldSkipChecks) {
                    this.machine.action("skipChecks");
                }

                this.machine.action("success");
                break;
            }

            case "CheckValidReleaseGroup": {
                if (isReleaseGroup(this.releaseGroup)) {
                    this.machine.action("success");
                } else {
                    this.machine.action("failure");
                }

                break;
            }

            case "CheckPolicy": {
                // TODO: run policy check before releasing a version.
                if (this.shouldCheckPolicy) {
                    this.warn(chalk.red(`Automated policy check not yet implemented.`));
                    // await runPolicyCheckWithFix(context);
                } else {
                    this.warn("Skipping policy check.");
                }

                this.machine.action("success");
                break;
            }

            case "CheckBranchName": {
                if (this.shouldCheckBranch) {
                    if (!this.checkBranchName(context.originalBranchName)) {
                        this.logError(this.checkBranchNameErrorMessage);
                        this.machine.action("failure");
                    }
                } else {
                    this.warn(
                        `Not checking if current branch is a release branch: ${context.originalBranchName}`,
                    );
                }

                this.machine.action("success");
                break;
            }

            case "CheckHasRemote": {
                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                if (remote === undefined) {
                    this.machine.action("failure");
                    this.logError(`Unable to find remote for '${context.originRemotePartialUrl}'`);
                }

                this.machine.action("success");
                break;
            }

            case "CheckBranchUpToDate": {
                const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
                const isBranchUpToDate = await context.gitRepo.isBranchUpToDate(
                    context.originalBranchName,
                    remote!,
                );
                if (this.shouldCheckBranchUpdate) {
                    if (!isBranchUpToDate) {
                        this.machine.action("failure");
                        this.logError(
                            `Local '${context.originalBranchName}' branch not up to date with remote. Please pull from '${remote}'.`,
                        );
                    }

                    this.machine.action("success");
                } else {
                    this.warn("Not checking if the branch is up-to-date with the remote.");
                    this.machine.action("success");
                }

                break;
            }

            case "CheckForPrereleaseDependencies": {
                const prereleaseDepNames = await getPreReleaseDependencies(
                    context,
                    this.releaseGroup,
                );
                if (
                    prereleaseDepNames.releaseGroups.length > 0 ||
                    prereleaseDepNames.packages.length > 0
                ) {
                    this.log(
                        chalk.red(
                            `\nCan't release the ${this.releaseGroup} release group because some of its dependencies need to be released first.`,
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

                    this.machine.action("failure");
                } else {
                    this.machine.action("success");
                }

                break;
            }

            case "CheckIfCurrentReleaseGroupIsReleased": {
                const wasReleased = await isReleased(context, this.releaseGroup);
                if (wasReleased) {
                    this.machine.action("success");
                } else {
                    this.machine.action("failure");
                }

                break;
            }

            case "CheckShouldCommit": {
                assert(isReleaseGroup(this.releaseGroup));
                const version = context.repo.releaseGroups.get(this.releaseGroup)!.version;
                const scheme = detectVersionScheme(version);
                const newVersion = bumpVersionScheme(version, this.bumpType, scheme);
                const bumpBranch = await createBumpBranch(context, this.releaseGroup, "patch");
                this.verbose(`Created bump branch: ${bumpBranch}`);
                await context.gitRepo.commit(
                    `[bump] ${this.releaseGroup}: ${version} => ${newVersion} (${this.bumpType})`,
                    `Error committing`,
                );
                this.machine.action("success");
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
}

