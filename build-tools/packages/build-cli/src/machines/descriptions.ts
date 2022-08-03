/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const stateDescriptions = new Map([
    ["Init", "The initial state that all machines start in."],
    ["Failed", "The terminal state that most states will transition to if they fail."],
    ["CheckShouldRunChecks", "Succeeds if the state machine's checks should be run."],
    ["CheckValidReleaseGroup", "Succeeds if the release group is valid."],
    ["CheckPolicy", "Succeeds if the repo policy check succeeds."],
    ["CheckBranchName", "Succeeds if the current branch matches the expected pattern."],
    [
        "CheckHasRemote",
        "Succeeds if there is a remote upstream branch in the microsoft/FluidFramework repo.",
    ],
    ["CheckBranchUpToDate", "Succeeds if the branch is up to date with the remote."],
    [
        "CheckInstallBuildTools",
        "Succeeds if the build tools are installed, and installs them if not.",
    ],
    [
        "CheckNoPrereleaseDependencies",
        "Succeeds if the release group has no dependencies on pre-release packages within the repo.",
    ],
    ["CheckReleaseBranchDoesNotExist", "Succeeds if the release branch does not yet exist."],
    [
        "CheckIfCurrentReleaseGroupIsReleased",
        "Succeeds if the release group has been released at the current version.",
    ],
    [
        "CheckShouldCommitBump",
        "Succeeds if the local bump changes should be committed to a new branch.",
    ],
    [
        "CheckShouldCommitDeps",
        "Succeeds if the local dependency changes should be committed to a new branch.",
    ],
    ["DoReleaseGroupBumpPatch", "Does a patch bump of the release group."],
    ["DoReleaseGroupBumpMinor", "Does a minor bump of the release group."],
    ["DoBumpPrereleaseDependencies", "Bumps pre-release dependencies to release versions."],
    ["PromptToPRBump", "Prompts to create a bump PR from the current branch."],
    ["PromptToPRDeps", "Prompts to create a dependency bump PR from the current branch."],
    ["PromptToCommitBump", "Prompts to commit local bump changes manually."],
    ["PromptToCommitDeps", "Prompts to commit local dependency changes manually."],
    ["PromptToRelease", "Prompts to run a release build in ADO."],
]);

export const actionDescriptions = new Map([
    ["success", "Indicates that the state succeeded."],
    ["failure", "Indicates that the state failed."],
]);
