import browser, { Idle, Runtime } from 'webextension-polyfill'
import SettingsStorage from './settingsStorage'
import { MsgEvent, PlayingMediaChangeEvent, SettingsData } from './types'

interface ActiveMedia {
    tabId?: number,
    videoSource: string | null,
    url: string | null
}

export default class Awake {
    idle: boolean
    mediaPlaying: boolean
    windowUnfocused: boolean

    constructor() {
        this.idle = false;
        this.mediaPlaying = false;
        this.windowUnfocused = false;

        // Check initial window focus state
        browser.windows.getAll().then((windows) => {
            this.windowUnfocused = !windows.some(w => w.focused);
        }).catch(() => {
            this.windowUnfocused = true;
        });

        // Set up settings
        SettingsStorage.onChangeOrLoad((settings: SettingsData) => {
            browser.idle.setDetectionInterval(parseInt(settings.idleTimer as string));
        });

        // Create events
        browser.idle.onStateChanged.addListener((state: Idle.IdleState) => {
            this.idle = state === 'locked' || state === 'idle';
        });

        // Keep track of how many different media sources are playing
        let currentlyPlaying: Array<ActiveMedia> = [];
        browser.runtime.onMessage.addListener((message: MsgEvent, sender: Runtime.MessageSender) => {
            if (message.type !== 'playingMedia') {
                return;
            }
            const media = (message as PlayingMediaChangeEvent).playingMedia;
            const tabId = sender.tab?.id;

            switch (media.state) {
                case 'playing':
                    currentlyPlaying.push({
                        tabId,
                        videoSource: media.videoSource,
                        url: media.url
                    });
                    break;
                case 'paused':
                    // Remove the media if it matches
                    const sameMediaCheck = (item: ActiveMedia) =>
                        !(item.tabId === tabId && item.videoSource === media.videoSource && item.url === media.url);
                    currentlyPlaying = currentlyPlaying.filter(sameMediaCheck);
                    break;
                case 'stopAll':
                    // Remove all media for this tab (or all if no tabId)
                    currentlyPlaying = tabId !== undefined
                        ? currentlyPlaying.filter(item => item.tabId !== tabId)
                        : [];
                    break;
            }

            this.mediaPlaying = currentlyPlaying.length !== 0;
        });

        // Clean up media sources when tabs close so they don't remain stuck
        browser.tabs.onRemoved.addListener((tabId: number) => {
            currentlyPlaying = currentlyPlaying.filter(item => item.tabId !== tabId);
            this.mediaPlaying = currentlyPlaying.length !== 0;
        });

        browser.windows.onFocusChanged.addListener((windowId: number) => {
            this.windowUnfocused = windowId === browser.windows.WINDOW_ID_NONE;
        });
    }

    public available(): boolean {
        // If window is unfocused (user switched to another window/profile or another app),
        // timer should not count.
        if (this.windowUnfocused) {
            return false;
        }

        // When focused:
        // - Media playing keeps the timer running even if hands-off (idle)
        // - Otherwise, only count if user is not idle
        return this.mediaPlaying || !this.idle;
    }
}
