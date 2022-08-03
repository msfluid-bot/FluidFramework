/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sm } from "jssm";

export const ReleaseMachineDefinition = sm`
machine_name: "Fluid Release Process";

Init 'success'
=> CheckShouldRunChecks 'success'
=> CheckValidReleaseGroup 'success'
=> CheckPolicy 'success'
=> CheckBranchName 'success'
=> CheckHasRemote 'success'
=> CheckBranchUpToDate 'success'
=> CheckNoPrereleaseDependencies 'success'
=> CheckIfCurrentReleaseGroupIsReleased 'success'
=> DoReleaseGroupBumpPatch 'success'
=> CheckShouldCommitBump 'success'
=> PromptToPRBump;

CheckShouldRunChecks 'failure'
=> CheckNoPrereleaseDependencies;

[
CheckValidReleaseGroup
CheckPolicy
CheckBranchName
CheckHasRemote
CheckBranchUpToDate
DoBumpPrereleaseDependencies
DoReleaseGroupBumpPatch
] 'failure' => Failed;

CheckNoPrereleaseDependencies 'failure'
=> DoBumpPrereleaseDependencies 'success'
=> CheckShouldCommitDeps 'success'
=> PromptToPRDeps;

CheckShouldCommitBump 'failure'
=> PromptToCommitBump;

CheckShouldCommitDeps 'failure'
=> PromptToCommitDeps;

CheckIfCurrentReleaseGroupIsReleased 'failure'
=> PromptToRelease;

// visual styling
state DoReleaseGroupBumpPatch: {
    background-color : steelblue;
    text-color       : white;
};

state DoBumpPrereleaseDependencies: {
    background-color : steelblue;
    text-color       : white;
};
`;

export const PrepReleaseMachineDefinition = sm`
machine_name: "Fluid Release Prep Process";

Init 'success'
=> CheckShouldRunChecks 'success'
=> CheckValidReleaseGroup 'success'
=> CheckPolicy 'success'
=> CheckBranchName 'success'
=> CheckHasRemote 'success'
=> CheckBranchUpToDate 'success'
=> CheckNoPrereleaseDependencies 'success'
=> CheckReleaseBranchDoesNotExist 'success'
=> CheckInstallBuildTools 'success'
=> DoReleaseGroupBumpMinor 'success'
=> CheckShouldCommitBump 'success'
=> PromptToPRBump;

CheckShouldRunChecks 'failure'
=> CheckNoPrereleaseDependencies;

[
Init
CheckValidReleaseGroup
CheckPolicy
CheckBranchName
CheckHasRemote
CheckBranchUpToDate
CheckReleaseBranchDoesNotExist
CheckInstallBuildTools
] 'failure' => Failed;

CheckNoPrereleaseDependencies 'failure'
=> DoBumpPrereleaseDependencies 'success'
=> CheckShouldCommitDeps 'success'
=> PromptToPRDeps;

[DoBumpPrereleaseDependencies
DoReleaseGroupBumpMinor
] 'failure' => Failed;

CheckShouldCommitBump 'failure'
=> PromptToCommitBump;

CheckShouldCommitDeps 'failure'
=> PromptToCommitDeps;

// visual styling
state DoReleaseGroupBumpMinor: {
  background-color : steelblue;
  text-color       : white;
};

state DoBumpPrereleaseDependencies: {
  background-color : steelblue;
  text-color       : white;
};
`;
