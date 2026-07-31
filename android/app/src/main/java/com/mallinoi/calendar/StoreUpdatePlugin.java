package com.mallinoi.calendar;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.InstallException;

@CapacitorPlugin(name = "StoreUpdate")
public class StoreUpdatePlugin extends Plugin {
    @PluginMethod
    public void getUpdateInfo(PluginCall call) {
        AppUpdateManager manager = AppUpdateManagerFactory.create(getContext());
        manager.getAppUpdateInfo()
                .addOnSuccessListener(info -> call.resolve(toResult(info)))
                .addOnFailureListener(error -> {
                    JSObject result = new JSObject();
                    result.put("updateAvailability", 0);
                    result.put("status", "unavailable");
                    if (error instanceof InstallException) {
                        result.put("errorCode", ((InstallException) error).getErrorCode());
                    }
                    call.resolve(result);
                });
    }

    private JSObject toResult(AppUpdateInfo info) {
        JSObject result = new JSObject();
        result.put("updateAvailability", info.updateAvailability());
        result.put("availableVersionCode", info.availableVersionCode());
        result.put("installStatus", info.installStatus());
        result.put("updatePriority", info.updatePriority());

        Integer stalenessDays = info.clientVersionStalenessDays();
        if (stalenessDays != null) {
            result.put("clientVersionStalenessDays", stalenessDays);
        }
        return result;
    }
}
