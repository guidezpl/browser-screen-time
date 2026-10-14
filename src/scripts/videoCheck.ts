import browser from 'webextension-polyfill'
import SettingsStorage from './settingsStorage'
import { PlayingMediaChangeEvent, SettingsData } from './types'

interface VideoElementWithEvents {
    elem: HTMLVideoElement,
    play: EventListenerOrEventListenerObject,
    pause: EventListenerOrEventListenerObject,
    emptied: EventListenerOrEventListenerObject,
    unload: EventListenerOrEventListenerObject,
    volumechange: EventListenerOrEventListenerObject
}

let videoElements: Array<VideoElementWithEvents> = [];

function createEvents(): void {
    const videoElems = document.querySelectorAll<HTMLVideoElement>('video:not(.bws-found)');
    for (const elem of videoElems) {
        elem.classList.add('bws-found');

        const getVideoSource = () => elem.currentSrc || elem.src || elem.getAttribute('src') || '';

        const sendMediaState = (state: 'playing' | 'paused') => {
            const changeEvent = {
                type: 'playingMedia',
                playingMedia: {
                    videoSource: getVideoSource(),
                    url: location.hostname,
                    state: state
                }
            };
            browser.runtime.sendMessage(changeEvent).catch(() => {});
        };

        const isAudible = () => !elem.muted && elem.volume > 0;

        const onPlay = () => {
            if (isAudible()) {
                sendMediaState('playing');
            } else {
                sendMediaState('paused');
            }
        };

        const onPause = () => {
            sendMediaState('paused');
        };

        const onEmptied = () => {
            sendMediaState('paused');
        };

        const onUnload = () => {
            sendMediaState('paused');
        };

        const onVolumeChange = () => {
            if (!elem.paused && isAudible()) {
                sendMediaState('playing');
            } else {
                sendMediaState('paused');
            }
        };

        let videoElementWithListeners: VideoElementWithEvents = {
            elem: elem,
            play: onPlay,
            pause: onPause,
            emptied: onEmptied,
            unload: onUnload,
            volumechange: onVolumeChange
        };

        elem.addEventListener('play', videoElementWithListeners.play);
        elem.addEventListener('pause', videoElementWithListeners.pause);
        elem.addEventListener('emptied', videoElementWithListeners.emptied);
        elem.addEventListener('volumechange', videoElementWithListeners.volumechange);
        window.addEventListener('unload', videoElementWithListeners.unload);

        videoElements.push(videoElementWithListeners);
    }
}

function removeEvents(): void {
    for (const item of videoElements) {
        if (!item.elem) {
            continue;
        }

        item.elem.classList.remove('bws-found');

        item.elem.removeEventListener('play', item.play);
        item.elem.removeEventListener('pause', item.pause);
        item.elem.removeEventListener('emptied', item.emptied);
        item.elem.removeEventListener('volumechange', item.volumechange);
        window.removeEventListener('unload', item.unload);
    }
    videoElements = [];
}

const observer = new MutationObserver(createEvents);

SettingsStorage.onChangeOrLoad((settings: SettingsData) => {
    if (settings.videoCheck) {
        observer.observe(document.body, {
            subtree: true,
            childList: true
        });
    } else {
        observer.disconnect();
        removeEvents();

        const changeEvent: PlayingMediaChangeEvent = {
            type: 'playingMedia',
            playingMedia: {
                videoSource: null,
                url: null,
                state: 'stopAll'
            }
        }
        browser.runtime.sendMessage(changeEvent).catch(() => {});
    }
});
