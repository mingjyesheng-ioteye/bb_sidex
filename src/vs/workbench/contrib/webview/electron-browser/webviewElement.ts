/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { consumeStream } from '../../../../base/common/stream.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import type { WebviewThemeDataProvider } from '../browser/themeing.js';
import type { WebviewInitInfo } from '../browser/webview.js';
import { WebviewElement } from '../browser/webviewElement.js';
import { WindowIgnoreMenuShortcutsManager } from './windowIgnoreMenuShortcutsManager.js';

export class ElectronWebviewElement extends WebviewElement {

	private readonly _webviewKeyboardHandler: WindowIgnoreMenuShortcutsManager;

	protected override get platform() { return 'tauri'; }

	constructor(
		initInfo: WebviewInitInfo,
		webviewThemeDataProvider: WebviewThemeDataProvider,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITunnelService tunnelService: ITunnelService,
		@IFileService fileService: IFileService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@INotificationService notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(initInfo, webviewThemeDataProvider,
			configurationService, contextMenuService, notificationService, environmentService,
			fileService, logService, remoteAuthorityResolverService, tunnelService, instantiationService, accessibilityService, uriIdentityService);

		this._webviewKeyboardHandler = new WindowIgnoreMenuShortcutsManager();
	}

	override dispose(): void {
		this._webviewKeyboardHandler.didBlur();
		super.dispose();
	}

	protected override webviewContentEndpoint(iframeId: string): string {
		return `https://webview-${iframeId}.localhost`;
	}

	protected override streamToBuffer(stream: VSBufferReadableStream): Promise<ArrayBufferLike> {
		return consumeStream<VSBuffer, ArrayBufferLike>(stream, (buffers: readonly VSBuffer[]) => {
			const totalLength = buffers.reduce((prev, curr) => prev + curr.byteLength, 0);
			const ret = new ArrayBuffer(totalLength);
			const view = new Uint8Array(ret);
			let offset = 0;
			for (const element of buffers) {
				view.set(element.buffer, offset);
				offset += element.byteLength;
			}
			return ret;
		});
	}

	protected override handleFocusChange(isFocused: boolean): void {
		super.handleFocusChange(isFocused);
		if (isFocused) {
			this._webviewKeyboardHandler.didFocus();
		} else {
			this._webviewKeyboardHandler.didBlur();
		}
	}
}
