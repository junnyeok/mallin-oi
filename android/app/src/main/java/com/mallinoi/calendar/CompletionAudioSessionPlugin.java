package com.mallinoi.calendar;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CompletionAudioSession")
public class CompletionAudioSessionPlugin extends Plugin {
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean hasAudioFocus = false;

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
            hasAudioFocus = false;
        }
    };

    @PluginMethod
    public void beginInterruption(PluginCall call) {
        AudioManager manager = getAudioManager();
        int result;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build())
                    .setOnAudioFocusChangeListener(focusChangeListener)
                    .build();
            result = manager.requestAudioFocus(audioFocusRequest);
        } else {
            result = manager.requestAudioFocus(
                    focusChangeListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            );
        }

        hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        JSObject response = new JSObject();
        response.put("active", hasAudioFocus);
        call.resolve(response);
    }

    @PluginMethod
    public void endInterruption(PluginCall call) {
        abandonAudioFocus();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        abandonAudioFocus();
    }

    @Override
    protected void handleOnDestroy() {
        abandonAudioFocus();
    }

    private AudioManager getAudioManager() {
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }
        return audioManager;
    }

    private void abandonAudioFocus() {
        if (!hasAudioFocus || audioManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(focusChangeListener);
        }

        hasAudioFocus = false;
        audioFocusRequest = null;
    }
}
