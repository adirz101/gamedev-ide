/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions, IViewDescriptor } from '../../../common/views.js';
import { ProjectKnowledgeViewPane } from './projectKnowledgeViewPane.js';
import { IUnityProjectService } from '../common/types.js';
import { IUnityBridgeService } from '../common/bridgeTypes.js';
import { UnityProjectService } from './unityProjectService.js';
import { UnityBridgeService } from './unityBridgeService.js';

// View IDs
export const GAMEDEV_PROJECT_VIEW_CONTAINER_ID = 'workbench.view.gamedevProject';
export const GAMEDEV_PROJECT_VIEW_ID = 'workbench.panel.gamedevProject';

// Register icon
const gamedevProjectIcon = registerIcon('gamedev-project-icon', Codicon.folder, localize('gamedevProjectIcon', 'Icon for GameDev Project Knowledge'));

// Register view container in Auxiliary Bar (right sidebar)
const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: GAMEDEV_PROJECT_VIEW_CONTAINER_ID,
	title: localize2('gamedevProject', 'Project'),
	icon: gamedevProjectIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [GAMEDEV_PROJECT_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: GAMEDEV_PROJECT_VIEW_CONTAINER_ID,
	hideIfEmpty: false,
	order: 1, // After Agent (which is order 0)
}, ViewContainerLocation.AuxiliaryBar, { isDefault: false });

// Register the view
const projectViewDescriptor: IViewDescriptor = {
	id: GAMEDEV_PROJECT_VIEW_ID,
	containerIcon: viewContainer.icon,
	containerTitle: viewContainer.title.value,
	singleViewPaneContainerTitle: viewContainer.title.value,
	name: localize2('gamedevProjectKnowledge', 'Project'),
	canToggleVisibility: false,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(ProjectKnowledgeViewPane),
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([projectViewDescriptor], viewContainer);

// Register the Unity Project Service
registerSingleton(IUnityProjectService, UnityProjectService, InstantiationType.Delayed);

// Register the Unity Bridge Service
registerSingleton(IUnityBridgeService, UnityBridgeService, InstantiationType.Delayed);
