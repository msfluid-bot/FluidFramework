/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sm } from "jssm";

/**
 * The state machine definitions in this file are written in Finite State Language (FSL), which is documented at
 * {@link https://fsl.tools/}.
 *
 * They can be visualized using the browser-based tool at
 * {@link https://stonecypher.github.io/jssm-viz-demo/graph_explorer.html}. Just copy/paste the FSL string for the
 * machine into the editor.
 */

/**
 * An FSL state machine that encodes the Fluid release process.
 */

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
DoReleaseGroupBumpPatch
] 'failure' => Failed;

CheckNoPrereleaseDependencies 'failure'
=> DoBumpReleasedDependencies 'success'
=> CheckNoMorePrereleaseDependencies 'success'
=> CheckShouldCommitDeps 'success'
=> PromptToPRDeps;

CheckNoMorePrereleaseDependencies 'failure'
=> PromptToReleaseDeps;

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

state DoBumpReleasedDependencies: {
    background-color : steelblue;
    text-color       : white;
};
`;

/**
 * The PrepReleaseMachine encodes the Fluid release prep process.
 *
 * @alpha
 */
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
=> DoBumpReleasedDependencies 'success'
=> CheckNoMorePrereleaseDependencies 'success'
=> CheckShouldCommitDeps 'success'
=> PromptToPRDeps;

[
DoReleaseGroupBumpMinor
] 'failure' => Failed;

CheckShouldCommitBump 'failure'
=> PromptToCommitBump;

CheckShouldCommitDeps 'failure'
=> PromptToCommitDeps;

CheckNoMorePrereleaseDependencies 'failure'
=> PromptToReleaseDeps;

// visual styling
state DoReleaseGroupBumpMinor: {
    background-color : steelblue;
    text-color       : white;
};

state DoBumpReleasedDependencies: {
    background-color : steelblue;
    text-color       : white;
};
`;
