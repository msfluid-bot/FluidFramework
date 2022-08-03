/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Machine } from "jssm";
import { PrepReleaseMachineDefinition, ReleaseMachineDefinition } from "./definitions";

export interface StateHandler {
    handleState: (state: string) => Promise<boolean>;
    isHandledState?: (state: string) => Promise<boolean>;
}

/**
 * A StateMachine combines an actual machine with known state and actions which are used to test that all states and
 * actions are accounted for. Note that this doesn't ensure all states are handled.
 */
export interface StateMachine {
    knownActions: string[];
    knownStates: string[];
    machine: Machine<unknown>;
}

const commonKnownActions = ["success", "failure"];

/**
 * A state machine that encodes the release process for a release group, including checking for prerelease dependencies
 * and requiring them to be released, updating said prerelease dependencies, and bumping the release group to the next
 * patch after release.
 */
export const ReleaseMachine: StateMachine = {
    knownActions: commonKnownActions,
    knownStates: [
        "Init",
        "Failed",
        "CheckBranchName",
        "CheckBranchUpToDate",
        "CheckHasRemote",
        "CheckIfCurrentReleaseGroupIsReleased",
        "CheckNoPrereleaseDependencies",
        "CheckPolicy",
        "CheckShouldCommitBump",
        "CheckShouldCommitDeps",
        "CheckShouldRunChecks",
        "CheckValidReleaseGroup",
        "DoBumpPrereleaseDependencies",
        "DoReleaseGroupBumpPatch",
        "PromptToCommitBump",
        "PromptToCommitDeps",
        "PromptToPRBump",
        "PromptToPRDeps",
        "PromptToRelease",
    ],
    machine: ReleaseMachineDefinition,
};

export const PrepReleaseMachine: StateMachine = {
    knownActions: commonKnownActions,
    knownStates: [
        "Init",
        "Failed",
        "CheckBranchName",
        "CheckBranchUpToDate",
        "CheckHasRemote",
        "CheckInstallBuildTools",
        "CheckNoPrereleaseDependencies",
        "CheckPolicy",
        "CheckReleaseBranchDoesNotExist",
        "CheckShouldCommitBump",
        "CheckShouldCommitDeps",
        "CheckShouldRunChecks",
        "CheckValidReleaseGroup",
        "DoBumpPrereleaseDependencies",
        "DoReleaseGroupBumpMinor",
        "PromptToCommitBump",
        "PromptToCommitDeps",
        "PromptToPRBump",
        "PromptToPRDeps",
    ],
    machine: PrepReleaseMachineDefinition,
};

export const allMachines = [ReleaseMachine, PrepReleaseMachine];
