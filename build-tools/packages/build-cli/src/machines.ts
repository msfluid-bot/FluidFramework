/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sm } from "jssm";
import type { Machine } from "jssm";
import { extend } from "extended-enum";

export interface StateHandler {
    handleState: (state: string) => Promise<boolean>;
    isHandledState?: (state: string) => Promise<boolean>;
}

/**
 * A state machine that encodes the release process for a release group, including checking for prerelease dependencies
 * and requiring them to be released, updating said prerelease dependencies, and bumping the release group to the next
 * patch after release.
 */
export const ReleaseMachine: Machine<unknown> = sm`
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
] 'failure' => Failed;

CheckForPrereleaseDependencies 'hasDependencies'
=> DoBumpPrereleaseDependencies 'success'
=> CheckShouldCommit 'success'
=> PromptToPR;

[DoBumpPrereleaseDependencies
DoPostReleasePatchBump
] 'failure' => Failed;

[CheckShouldCommit] 'failure'
=> PromptToCommit;

CheckIfCurrentReleaseGroupIsReleased 'failure'
=> PromptToRelease;
`;

enum _ReleaseMachineActions {
    success = "success",
    failure = "failure",
    skipChecks = "skipChecks",
    hasDependencies = "hasDependencies",
}
export class ReleaseMachineActions extends extend<
    typeof _ReleaseMachineActions,
    _ReleaseMachineActions
>(_ReleaseMachineActions) {}

enum _ReleaseMachineStates {
    Init = "Init",
    Failed = "Failed",
    CheckValidReleaseGroup = "CheckValidReleaseGroup",
    CheckPolicy = "CheckPolicy",
    CheckBranchName = "CheckBranchName",
    CheckHasRemote = "CheckHasRemote",
    CheckBranchUpToDate = "CheckBranchUpToDate",
    CheckForPrereleaseDependencies = "CheckForPrereleaseDependencies",
    CheckIfCurrentReleaseGroupIsReleased = "CheckIfCurrentReleaseGroupIsReleased",
    CheckShouldCommit = "CheckShouldCommit",
    DoPostReleasePatchBump = "DoPostReleasePatchBump",
    DoBumpPrereleaseDependencies = "DoBumpPrereleaseDependencies",
    PromptToPR = "PromptToPR",
    PromptToCommit = "PromptToCommit",
    PromptToRelease = "PromptToRelease",
}

export class ReleaseMachineStates extends extend<
    typeof _ReleaseMachineStates,
    _ReleaseMachineStates
>(_ReleaseMachineStates) {}

export const PrepReleaseMachine = sm`
Init 'success'
=> CheckValidReleaseGroup 'success'
=> CheckPolicy 'success'
=> CheckBranchName 'success'
=> CheckHasRemote 'success'
=> CheckBranchUpToDate 'success'
=> CheckForPrereleaseDependencies 'success'
=> CheckReleaseBranch 'success'
=> CheckInstallBuildTools 'success'
=> DoReleaseGroupBump 'success'
=> CheckShouldCommit 'success'
=> PromptToPR;

Init 'skipChecks'
=> CheckForPrereleaseDependencies;

[CheckValidReleaseGroup
CheckPolicy
CheckBranchName
CheckHasRemote
CheckBranchUpToDate
CheckReleaseBranch
CheckInstallBuildTools
] 'failure' => Failed;

CheckForPrereleaseDependencies 'hasDependencies'
=> DoBumpPrereleaseDependencies 'success'
=> CheckShouldCommit;

[DoBumpPrereleaseDependencies
DoReleaseGroupBump
] 'failure' => Failed;

[CheckShouldCommit] 'failure'
=> PromptToCommit;
`;

enum _PrepReleaseMachineActions {
    success = "success",
    failure = "failure",
    skipChecks = "skipChecks",
    hasDependencies = "hasDependencies",
}
export class PrepReleaseMachineActions extends extend<
    typeof _ReleaseMachineActions,
    _ReleaseMachineActions
>(_ReleaseMachineActions) {}

enum _PrepReleaseMachineStates {
    Init = "Init",
    Failed = "Failed",
}
export class PrepReleaseMachineStates extends extend<
    typeof _ReleaseMachineStates,
    _ReleaseMachineStates
>(_ReleaseMachineStates) {}

export const allMachines = [ReleaseMachine, PrepReleaseMachine];
