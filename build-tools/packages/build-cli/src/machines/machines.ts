/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Machine } from "jssm";
import { PrepReleaseMachineDefinition, ReleaseMachineDefinition } from "./definitions";

/**
 * A StateMachine combines an actual machine with known state and actions which are used to test that all states and
 * actions are accounted for. Note that this doesn't ensure all states are handled.
 */
export interface StateMachine {
    knownActions: string[];
    knownStates: string[];
    machine: Machine<unknown>;
}

/**
 * A StateHandler is an object that can handle states.
 */
export interface StateHandler {
    handleState: (state: string) => Promise<boolean>;
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
        "CheckNoMorePrereleaseDependencies",
        "CheckPolicy",
        "CheckShouldCommitBump",
        "CheckShouldCommitDeps",
        "CheckShouldRunChecks",
        "CheckValidReleaseGroup",
        "DoBumpReleasedDependencies",
        "DoReleaseGroupBumpPatch",
        "PromptToCommitBump",
        "PromptToCommitDeps",
        "PromptToPRBump",
        "PromptToPRDeps",
        "PromptToRelease",
        "PromptToReleaseDeps",
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
        "CheckNoMorePrereleaseDependencies",
        "CheckNoPrereleaseDependencies",
        "CheckPolicy",
        "CheckReleaseBranchDoesNotExist",
        "CheckShouldCommitBump",
        "CheckShouldCommitDeps",
        "CheckShouldRunChecks",
        "CheckValidReleaseGroup",
        "DoBumpReleasedDependencies",
        "DoReleaseGroupBumpMinor",
        "PromptToCommitBump",
        "PromptToCommitDeps",
        "PromptToPRBump",
        "PromptToPRDeps",
        "PromptToReleaseDeps",
    ],
    machine: PrepReleaseMachineDefinition,
};

/**
 * An array of all known machines. Intended for testing.
 *
 * @internal
 * */
export const allMachines = [ReleaseMachine, PrepReleaseMachine];
