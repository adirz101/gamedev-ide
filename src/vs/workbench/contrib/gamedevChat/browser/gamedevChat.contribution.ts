/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { GameDevChatViewPane } from './gamedevChatViewPane.js';
import { GameDevChatService, IGameDevChatService } from './gamedevChatService.js';

// View IDs
export const GAMEDEV_CHAT_VIEW_CONTAINER_ID = 'workbench.view.gamedevChat';
export const GAMEDEV_CHAT_VIEW_ID = 'workbench.panel.gamedevChat';
export const GAMEDEV_CHAT_OPEN_COMMAND_ID = 'workbench.action.openGamedevChat';

// Register icon
const gamedevChatIcon = registerIcon('gamedev-chat-icon', Codicon.sparkle, localize('gamedevChatIcon', 'Icon for GameDev AI Chat'));

// Register view container in Auxiliary Bar (right side)
const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: GAMEDEV_CHAT_VIEW_CONTAINER_ID,
	title: localize2('gamedevChat', "Chat"),
	icon: gamedevChatIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [GAMEDEV_CHAT_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: GAMEDEV_CHAT_VIEW_CONTAINER_ID,
	hideIfEmpty: false,
	order: 0,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

// Register the chat view
const chatViewDescriptor: IViewDescriptor = {
	id: GAMEDEV_CHAT_VIEW_ID,
	containerIcon: viewContainer.icon,
	containerTitle: viewContainer.title.value,
	singleViewPaneContainerTitle: viewContainer.title.value,
	name: localize2('gamedevChat', "Chat"),
	canToggleVisibility: false,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(GameDevChatViewPane),
	openCommandActionDescriptor: {
		id: GAMEDEV_CHAT_OPEN_COMMAND_ID,
		title: viewContainer.title,
		mnemonicTitle: localize({ key: 'miToggleAgent', comment: ['&& denotes a mnemonic'] }, "&&Chat"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
		},
		order: 0
	},
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([chatViewDescriptor], viewContainer);

// Register the chat service
registerSingleton(IGameDevChatService, GameDevChatService, InstantiationType.Delayed);
